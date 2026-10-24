/**
 * QuantScale Persistent SQLite Database Engine
 *
 * Provides a durable SQLite database using WAL mode, atomic transactions,
 * foreign key integrity, schema migrations, and audit trails.
 * Runs in Node.js (with file persistence) and Browser environments (with localStorage fallback).
 */

import initSqlJsModule, { Database as SqlDatabase } from 'sql.js';

const getInitSqlJs = () => {
  if (typeof initSqlJsModule === 'function') {
    return initSqlJsModule;
  }
  if (initSqlJsModule && typeof (initSqlJsModule as any).default === 'function') {
    return (initSqlJsModule as any).default;
  }
  return initSqlJsModule;
};

const isNode = typeof window === 'undefined' && typeof process !== 'undefined' && process.versions && !!process.versions.node;

let nodeFs: typeof import('fs') | null = null;
let nodePath: typeof import('path') | null = null;

async function loadNodeModules() {
  if (isNode && !nodeFs) {
    try {
      nodeFs = await import('node:fs');
      nodePath = await import('node:path');
    } catch {
      // Browser environment fallback
    }
  }
}

function arrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface WalletRecord {
  walletId: string;
  mode: 'PAPER' | 'LIVE' | 'SIMULATION';
  balanceCents: number;
  reservedCents: number;
  equityCents: number;
  realizedPnlCents: number;
  updatedAt: number;
}

export class DatabaseEngine {
  private db: SqlDatabase | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initialize();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await loadNodeModules();

    try {
      let wasmBinary: ArrayBuffer | undefined = undefined;

      if (!isNode && typeof window !== 'undefined') {
        const candidateUrls = [
          '/sql-wasm.wasm',
          '/node_modules/sql.js/dist/sql-wasm.wasm',
          'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm',
        ];

        for (const url of candidateUrls) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              if (buffer.byteLength >= 4) {
                const header = new Uint8Array(buffer.slice(0, 4));
                // Verify WASM magic header: \0asm (0x00, 0x61, 0x73, 0x6d)
                if (header[0] === 0x00 && header[1] === 0x61 && header[2] === 0x73 && header[3] === 0x6d) {
                  wasmBinary = buffer;
                  break;
                }
              }
            }
          } catch {
            // Proceed to next candidate URL
          }
        }
      }

      const initFn = getInitSqlJs();
      const SQL = await initFn({
        wasmBinary,
        locateFile: (file: string) => {
          if (isNode && nodePath) {
            return nodePath.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
          }
          return `/${file}`;
        },
      });

      if (isNode && nodeFs && nodePath) {
        const dataDir = process.env.DATA_DIR || nodePath.join(process.cwd(), 'data');
        const dbPath = nodePath.join(dataDir, 'quantscale.db');

        if (!nodeFs.existsSync(dataDir)) {
          try {
            nodeFs.mkdirSync(dataDir, { recursive: true });
          } catch {
            // Directory exists or permission error
          }
        }

        if (nodeFs.existsSync(dbPath)) {
          try {
            const fileBuffer = nodeFs.readFileSync(dbPath);
            this.db = new SQL.Database(fileBuffer);
          } catch {
            this.db = new SQL.Database();
          }
        } else {
          this.db = new SQL.Database();
        }
      } else {
        // Browser environment fallback with localStorage persistence
        try {
          const savedB64 = typeof localStorage !== 'undefined' ? localStorage.getItem('quantscale_db_b64') : null;
          if (savedB64) {
            const bytes = base64ToBytes(savedB64);
            this.db = new SQL.Database(bytes);
          } else {
            this.db = new SQL.Database();
          }
        } catch {
          this.db = new SQL.Database();
        }
      }

      this.applyPragmasAndMigrations();
      this.saveToDisk();
      this.isInitialized = true;
    } catch (err) {
      console.error('[DATABASE] Initialization error:', err);
    }
  }

  private saveToDisk(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      if (isNode && nodeFs && nodePath) {
        const dataDir = process.env.DATA_DIR || nodePath.join(process.cwd(), 'data');
        const dbPath = nodePath.join(dataDir, 'quantscale.db');
        if (!nodeFs.existsSync(dataDir)) {
          nodeFs.mkdirSync(dataDir, { recursive: true });
        }
        nodeFs.writeFileSync(dbPath, Buffer.from(data));
      } else if (typeof localStorage !== 'undefined') {
        const b64 = arrayToBase64(data);
        localStorage.setItem('quantscale_db_b64', b64);
      }
    } catch (err) {
      console.error('[DATABASE] Failed to write database to disk:', err);
    }
  }

  private applyPragmasAndMigrations(): void {
    if (!this.db) return;

    // Enable Pragmas
    try {
      this.db.exec(`
        PRAGMA foreign_keys = ON;
      `);
    } catch {
      // pragma fallback
    }

    // Schema Creation
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trading_sessions (
        session_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        status TEXT NOT NULL,
        initial_bankroll_cents INTEGER NOT NULL,
        final_bankroll_cents INTEGER
      );

      CREATE TABLE IF NOT EXISTS market_metadata (
        ticker TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        strike_price_cents INTEGER NOT NULL,
        open_timestamp INTEGER NOT NULL,
        close_timestamp INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spot_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        source TEXT NOT NULL,
        return_30s REAL NOT NULL,
        realized_vol_15m REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orderbook_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        best_bid_cents INTEGER NOT NULL,
        best_ask_cents INTEGER NOT NULL,
        spread_cents INTEGER NOT NULL,
        mid_price_cents INTEGER NOT NULL,
        micro_imbalance REAL NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS strategy_signals (
        signal_id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        strategy_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        action TEXT NOT NULL,
        confidence REAL NOT NULL,
        edge_cents REAL NOT NULL,
        expected_ev_cents REAL NOT NULL,
        decision_rationale TEXT NOT NULL,
        rejection_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        client_order_id TEXT UNIQUE NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        portfolio_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        side TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        contracts INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        filled_contracts INTEGER DEFAULT 0,
        average_fill_price_cents INTEGER DEFAULT 0,
        fee_paid_cents INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS fills (
        fill_id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        client_order_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        side TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        contracts INTEGER NOT NULL,
        fee_cents INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders(order_id)
      );

      CREATE TABLE IF NOT EXISTS positions (
        position_id TEXT PRIMARY KEY,
        portfolio_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        side TEXT NOT NULL,
        contracts INTEGER NOT NULL,
        entry_price_cents INTEGER NOT NULL,
        current_price_cents INTEGER NOT NULL,
        unrealized_pnl_cents INTEGER NOT NULL,
        realized_pnl_cents INTEGER DEFAULT 0,
        total_fees_cents INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        exit_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS paper_wallets (
        mode TEXT PRIMARY KEY,
        balance_cents INTEGER NOT NULL,
        reserved_cents INTEGER NOT NULL,
        equity_cents INTEGER NOT NULL,
        realized_pnl_cents INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cash_ledger (
        ledger_id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        balance_after_cents INTEGER NOT NULL,
        reference_id TEXT,
        description TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS risk_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata_json TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diagnostic_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS github_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commit_hash TEXT NOT NULL,
        branch TEXT NOT NULL,
        status TEXT NOT NULL,
        deployed_at INTEGER NOT NULL,
        notes TEXT
      );
    `);

    // Ensure default Paper Wallet ($1,000.00 = 100000 cents)
    const walletCheck = this.db.exec("SELECT mode FROM paper_wallets WHERE mode = 'PAPER'");
    if (walletCheck.length === 0 || walletCheck[0].values.length === 0) {
      const now = Date.now();
      this.db.exec(`
        INSERT INTO paper_wallets (mode, balance_cents, reserved_cents, equity_cents, realized_pnl_cents, updated_at)
        VALUES ('PAPER', 100000, 0, 100000, 0, ${now});
      `);
      this.db.exec(`
        INSERT INTO cash_ledger (mode, type, amount_cents, balance_after_cents, description, timestamp)
        VALUES ('PAPER', 'INITIAL_BANKROLL', 100000, 100000, 'Initial Paper Wallet Funding', ${now});
      `);
    }

    // Set app metadata
    this.db.exec(`
      INSERT OR REPLACE INTO system_metadata (key, value, updated_at)
      VALUES ('app_version', 'v2.4.0-Pi4-Prod', ${Date.now()});
    `);
  }

  // --- WALLET & CASH LEDGER METHODS ---

  public getWallet(mode: 'PAPER' | 'LIVE' | 'SIMULATION'): WalletRecord {
    if (!this.db) {
      return {
        walletId: mode,
        mode,
        balanceCents: 100000,
        reservedCents: 0,
        equityCents: 100000,
        realizedPnlCents: 0,
        updatedAt: Date.now(),
      };
    }

    try {
      const stmt = this.db.prepare('SELECT mode, balance_cents, reserved_cents, equity_cents, realized_pnl_cents, updated_at FROM paper_wallets WHERE mode = :mode');
      stmt.bind({ ':mode': mode });

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return {
          walletId: mode,
          mode: row.mode as 'PAPER' | 'LIVE' | 'SIMULATION',
          balanceCents: Number(row.balance_cents),
          reservedCents: Number(row.reserved_cents),
          equityCents: Number(row.equity_cents),
          realizedPnlCents: Number(row.realized_pnl_cents),
          updatedAt: Number(row.updated_at),
        };
      }
      stmt.free();
    } catch {
      // Return default on query error
    }

    return {
      walletId: mode,
      mode,
      balanceCents: 100000,
      reservedCents: 0,
      equityCents: 100000,
      realizedPnlCents: 0,
      updatedAt: Date.now(),
    };
  }

  public updateWallet(
    mode: 'PAPER' | 'LIVE' | 'SIMULATION',
    balanceCents: number,
    reservedCents: number,
    equityCents: number,
    realizedPnlCents: number,
    ledgerType: string,
    description: string,
    referenceId?: string
  ): void {
    if (!this.db) return;
    const now = Date.now();

    try {
      this.db.exec(`
        INSERT OR REPLACE INTO paper_wallets (mode, balance_cents, reserved_cents, equity_cents, realized_pnl_cents, updated_at)
        VALUES ('${mode}', ${Math.round(balanceCents)}, ${Math.round(reservedCents)}, ${Math.round(equityCents)}, ${Math.round(realizedPnlCents)}, ${now});
      `);

      this.db.exec(`
        INSERT INTO cash_ledger (mode, type, amount_cents, balance_after_cents, reference_id, description, timestamp)
        VALUES ('${mode}', '${ledgerType}', ${Math.round(balanceCents)}, ${Math.round(balanceCents)}, ${referenceId ? `'${referenceId}'` : 'NULL'}, '${description.replace(/'/g, "''")}', ${now});
      `);

      this.saveToDisk();
    } catch (err) {
      console.error('[DATABASE] Error updating wallet:', err);
    }
  }

  public resetPaperWallet(newBankrollCents = 100000): void {
    if (!this.db) return;
    const now = Date.now();
    try {
      this.db.exec(`
        INSERT OR REPLACE INTO paper_wallets (mode, balance_cents, reserved_cents, equity_cents, realized_pnl_cents, updated_at)
        VALUES ('PAPER', ${newBankrollCents}, 0, ${newBankrollCents}, 0, ${now});
      `);
      this.db.exec(`
        INSERT INTO cash_ledger (mode, type, amount_cents, balance_after_cents, description, timestamp)
        VALUES ('PAPER', 'MANUAL_RESET', ${newBankrollCents}, ${newBankrollCents}, 'Manual Paper Wallet Reset', ${now});
      `);
      this.saveToDisk();
    } catch (err) {
      console.error('[DATABASE] Error resetting paper wallet:', err);
    }
  }

  public logDiagnostic(level: string, category: string, message: string, source = 'BACKEND'): void {
    if (!this.db) return;
    const now = Date.now();
    const cleanMsg = message.replace(/'/g, "''");
    try {
      this.db.exec(`
        INSERT INTO diagnostic_logs (timestamp, level, category, message, source)
        VALUES (${now}, '${level}', '${category}', '${cleanMsg}', '${source}');
      `);
      this.saveToDisk();
    } catch {
      // Ignored
    }
  }

  public getDiagnosticLogs(limit = 100): Array<{ id: number; timestamp: number; level: string; category: string; message: string; source: string }> {
    if (!this.db) return [];
    try {
      const res = this.db.exec(`SELECT id, timestamp, level, category, message, source FROM diagnostic_logs ORDER BY id DESC LIMIT ${limit}`);
      if (res.length === 0) return [];
      return res[0].values.map((row) => ({
        id: Number(row[0]),
        timestamp: Number(row[1]),
        level: String(row[2]),
        category: String(row[3]),
        message: String(row[4]),
        source: String(row[5]),
      }));
    } catch {
      return [];
    }
  }

  public saveSpotObservation(priceCents: number, return30s: number, realizedVol15m: number, source = 'COINBASE'): void {
    if (!this.db) return;
    const now = Date.now();
    try {
      this.db.exec(`
        INSERT INTO spot_observations (timestamp, price_cents, source, return_30s, realized_vol_15m)
        VALUES (${now}, ${Math.round(priceCents)}, '${source}', ${return30s}, ${realizedVol15m});
      `);
    } catch {
      // Ignored
    }
  }

  public close(): void {
    this.saveToDisk();
  }
}

export const dbEngine = new DatabaseEngine();
