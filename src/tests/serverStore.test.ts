import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

describe('Server WAL ledger and process recovery', () => {
  it('commits deposits atomically, snapshots engine, restores closed-position P&L exactly once', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantscale-test-'));
    process.env.DATA_DIR = dir;
    const { dbEngine } = await import('../db/serverStore');
    const initial = dbEngine.getWallet('PAPER');
    assert.equal(initial.balanceCents, 100000);
    dbEngine.updateWallet('PAPER', 125000, 0, 125000, 0, 'DEPOSIT', 'Unit test');
    assert.equal(dbEngine.getWallet('PAPER').balanceCents, 125000);
    const closed = [{ id: 'p-1', portfolioId: 'PRIMARY', status: 'CLOSED', realizedPnl: -3.25 }];
    dbEngine.reconcileClosedPositions(closed);
    dbEngine.reconcileClosedPositions(closed);
    assert.equal(dbEngine.getWallet('PAPER').balanceCents, 124675);
    dbEngine.saveEngineSnapshot({ orders: [{id: 'o-1'}], positions: closed, currentSpotPrice: 85000 });
    assert.equal(dbEngine.getEngineSnapshot()?.currentSpotPrice, 85000);
    dbEngine.close();

    const db = new DatabaseSync(path.join(dir, 'quantscale.db'));
    const wallet = db.prepare('SELECT balance_cents FROM wallets WHERE mode=?').get('PAPER') as {balance_cents:number};
    const ledger = db.prepare('SELECT count(*) AS n FROM ledger WHERE reference_id=?').get('position:p-1') as {n:number};
    assert.equal(Number(wallet.balance_cents), 124675);
    assert.equal(Number(ledger.n), 1);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
