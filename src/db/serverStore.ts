/** Durable backend-only SQLite store. Never bundle this module into the browser. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { WalletRecord } from './database';

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const filename = path.join(dir, 'quantscale.db');
const db = new DatabaseSync(filename);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(
  'CREATE TABLE IF NOT EXISTS wallets (mode TEXT PRIMARY KEY, balance_cents INTEGER NOT NULL, reserved_cents INTEGER NOT NULL DEFAULT 0, equity_cents INTEGER NOT NULL, realized_pnl_cents INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);' +
  'CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, delta_cents INTEGER NOT NULL, balance_after_cents INTEGER NOT NULL, kind TEXT NOT NULL, description TEXT NOT NULL, reference_id TEXT UNIQUE, created_at INTEGER NOT NULL);' +
  'CREATE TABLE IF NOT EXISTS engine_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at INTEGER NOT NULL);' +
  'CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);' +
  'CREATE TABLE IF NOT EXISTS positions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);' +
  'CREATE TABLE IF NOT EXISTS accounted_positions (id TEXT PRIMARY KEY, pnl_cents INTEGER NOT NULL, created_at INTEGER NOT NULL);'
);
db.prepare('INSERT OR IGNORE INTO wallets VALUES (?, ?, ?, ?, ?, ?)').run('PAPER', 100000, 0, 100000, 0, Date.now());

export class ServerStore {
  public getWallet(mode: 'PAPER' | 'LIVE' | 'SIMULATION'): WalletRecord {
    if (mode !== 'PAPER') throw new Error('Only PAPER wallet accounting is supported in this deployment.');
    const row = db.prepare('SELECT * FROM wallets WHERE mode=?').get(mode) as Record<string, number | string> | undefined;
    if (!row) throw new Error('Wallet record missing. Trading is blocked.');
    return {
      walletId: mode, mode,
      balanceCents: Number(row.balance_cents), reservedCents: Number(row.reserved_cents),
      equityCents: Number(row.equity_cents), realizedPnlCents: Number(row.realized_pnl_cents),
      updatedAt: Number(row.updated_at),
    };
  }
  public updateWallet(
    mode: 'PAPER' | 'LIVE' | 'SIMULATION', balanceCents: number, reservedCents: number,
    equityCents: number, realizedPnlCents: number, kind: string, description: string, referenceId?: string
  ): void {
    if (mode !== 'PAPER') throw new Error('Real-money wallet mutation is disabled.');
    for (const x of [balanceCents, reservedCents, equityCents, realizedPnlCents]) {
      if (!Number.isSafeInteger(x)) throw new Error('Unsafe financial amount');
    }
    if (balanceCents < 0 || reservedCents < 0) throw new Error('Negative funds or collateral.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.getWallet('PAPER');
      const delta = balanceCents - before.balanceCents;
      db.prepare('UPDATE wallets SET balance_cents=?, reserved_cents=?, equity_cents=?, realized_pnl_cents=?, updated_at=? WHERE mode=?')
        .run(balanceCents, reservedCents, equityCents, realizedPnlCents, Date.now(), mode);
      db.prepare('INSERT INTO ledger(mode,delta_cents,balance_after_cents,kind,description,reference_id,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(mode, delta, balanceCents, kind, description, referenceId || null, Date.now());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  public resetPaperWallet(cents = 100000): void {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid paper bankroll.');
    this.updateWallet('PAPER', cents, 0, cents, 0, 'RESET', 'Confirmed paper-wallet reset');
  }
  public getEngineSnapshot(): Record<string, any> | null {
    const row = db.prepare('SELECT payload FROM engine_snapshot WHERE id=1').get() as {payload: string} | undefined;
    return row ? JSON.parse(row.payload) : null;
  }
  public saveEngineSnapshot(payload: Record<string, any>): void {
    const orders: Array<{ id: string }> = payload.orders || [];
    const positions: Array<{ id: string }> = payload.positions || [];
    db.exec('BEGIN IMMEDIATE');
    try {
      const now = Date.now();
      db.prepare('INSERT INTO engine_snapshot(id,payload,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at')
        .run(JSON.stringify(payload), now);
      const putOrder = db.prepare('INSERT INTO orders(id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at');
      for (const o of orders) putOrder.run(o.id, JSON.stringify(o), now);
      const putPosition = db.prepare('INSERT INTO positions(id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at');
      for (const p of positions) putPosition.run(p.id, JSON.stringify(p), now);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  public reconcileClosedPositions(positions: Array<{id:string; status:string; portfolioId:string; realizedPnl?:number}>): void {
    for (const p of positions) {
      if (p.status !== 'CLOSED' || p.portfolioId !== 'PRIMARY') continue;
      const pnlCents = Math.round((p.realizedPnl || 0) * 100);
      if (!Number.isSafeInteger(pnlCents)) throw new Error('Invalid P&L');
      db.exec('BEGIN IMMEDIATE');
      try {
        const inserted = db.prepare('INSERT OR IGNORE INTO accounted_positions(id,pnl_cents,created_at) VALUES(?,?,?)')
          .run(p.id, pnlCents, Date.now());
        if (inserted.changes) {
          const wallet = this.getWallet('PAPER');
          const balance = wallet.balanceCents + pnlCents;
          if (balance < 0) throw new Error('Reconciliation produced negative balance');
          db.prepare('UPDATE wallets SET balance_cents=?, equity_cents=?, realized_pnl_cents=?, updated_at=? WHERE mode=?')
            .run(balance, wallet.equityCents + pnlCents, wallet.realizedPnlCents + pnlCents, Date.now(), 'PAPER');
          db.prepare('INSERT INTO ledger(mode,delta_cents,balance_after_cents,kind,description,reference_id,created_at) VALUES(?,?,?,?,?,?,?)')
            .run('PAPER', pnlCents, balance, 'REALIZED_PNL', 'Closed paper position', 'position:' + p.id, Date.now());
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  }
  public close(): void { db.close(); }
}
export const dbEngine = new ServerStore();
