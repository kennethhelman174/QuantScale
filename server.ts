import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { tradingEngine } from './src/services/tradingEngine';
import { dbEngine } from './src/db/database';
import { githubUpdater } from './src/services/githubUpdater';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const LOCK_FILE = path.join(__dirname, '.engine.lock');

// Manage single-writer process lock
function acquireEngineLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pidStr = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0); // Check if process with PID exists
          console.warn(`[EngineLock] Server process PID ${pid} is already running with exclusive lock.`);
          return false;
        } catch {
          console.log(`[EngineLock] Stale lock file found for PID ${pid}. Overwriting...`);
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), 'utf-8');
    console.log(`[EngineLock] Acquired single-writer process lock for PID ${process.pid}`);
    return true;
  } catch (err) {
    console.error(`[EngineLock] Error managing process lock file:`, err);
    return false;
  }
}

function releaseEngineLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pidStr = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      if (pidStr === process.pid.toString()) {
        fs.unlinkSync(LOCK_FILE);
        console.log(`[EngineLock] Released single-writer process lock.`);
      }
    }
  } catch (err) {
    console.error(`[EngineLock] Error releasing lock file:`, err);
  }
}

async function startServer() {
  const isPrimary = acquireEngineLock();

  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Connected WebSocket clients
  const connectedClients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    // Send initial snapshot on connection
    const snapshotPacket = {
      type: 'STATE_SNAPSHOT',
      timestamp: Date.now(),
      mode: tradingEngine.mode,
      spotPrice: tradingEngine.currentSpotPrice,
      market: tradingEngine.currentMarket,
      book: tradingEngine.currentBook,
      positions: tradingEngine.positions,
      orders: tradingEngine.orders,
      isAutoTrading: tradingEngine.isAutoTrading,
      autoTradingMode: tradingEngine.autoTradingMode,
      wallet: dbEngine.getWallet('PAPER'),
      updaterStatus: githubUpdater.getStatus(),
    };
    ws.send(JSON.stringify(snapshotPacket));

    ws.on('close', () => {
      connectedClients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Client error:', err);
      connectedClients.delete(ws);
    });
  });

  // Broadcast state updates to all WebSocket subscribers
  const broadcastState = () => {
    if (connectedClients.size === 0) return;
    const packet = {
      type: 'TICK_UPDATE',
      timestamp: Date.now(),
      mode: tradingEngine.mode,
      spotPrice: tradingEngine.currentSpotPrice,
      market: tradingEngine.currentMarket,
      book: tradingEngine.currentBook,
      positionsCount: tradingEngine.positions.length,
      ordersCount: tradingEngine.orders.length,
      isAutoTrading: tradingEngine.isAutoTrading,
      autoTradingMode: tradingEngine.autoTradingMode,
      wallet: dbEngine.getWallet('PAPER'),
    };
    const message = JSON.stringify(packet);
    for (const client of connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  // Start persistent backend trading engine if primary lock acquired
  if (isPrimary) {
    tradingEngine.start();
    tradingEngine.subscribe(() => {
      broadcastState();
    });
    githubUpdater.startAutoCheck();
  }

  // --- REST API ROUTES ---

  // Health / Engine status
  app.get('/api/status', (_req: Request, res: Response) => {
    res.json({
      status: 'ONLINE',
      isPrimaryWriter: isPrimary,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: Date.now(),
      mode: tradingEngine.mode,
      spotPrice: tradingEngine.currentSpotPrice,
      marketTicker: tradingEngine.currentMarket.ticker,
      activePositions: tradingEngine.positions.filter((p) => p.status === 'OPEN').length,
      isAutoTrading: tradingEngine.isAutoTrading,
      autoTradingMode: tradingEngine.autoTradingMode,
      githubUpdater: githubUpdater.getStatus(),
    });
  });

  // Current market & book snapshot
  app.get('/api/market', (_req: Request, res: Response) => {
    res.json({
      market: tradingEngine.currentMarket,
      book: tradingEngine.currentBook,
      spotPrice: tradingEngine.currentSpotPrice,
      candles: tradingEngine.candles.slice(-30),
    });
  });

  // Active and historical positions
  app.get('/api/positions', (_req: Request, res: Response) => {
    res.json({
      positions: tradingEngine.positions,
    });
  });

  // Active and historical orders
  app.get('/api/orders', (_req: Request, res: Response) => {
    res.json({
      orders: tradingEngine.orders,
    });
  });

  // Paper wallet accounting
  app.get('/api/wallet', (_req: Request, res: Response) => {
    const mode = tradingEngine.mode === 'LIVE' ? 'LIVE' : 'PAPER';
    res.json({
      wallet: dbEngine.getWallet(mode),
    });
  });

  // Wallet deposit
  app.post('/api/wallet/deposit', (req: Request, res: Response) => {
    const { amountDollars, note } = req.body;
    const dollars = parseFloat(amountDollars);
    if (isNaN(dollars) || dollars <= 0) {
      res.status(400).json({ error: 'Invalid deposit amount' });
      return;
    }
    const mode = tradingEngine.mode === 'LIVE' ? 'LIVE' : 'PAPER';
    const currentWallet = dbEngine.getWallet(mode);
    const amtCents = Math.round(dollars * 100);
    const newBal = currentWallet.balanceCents + amtCents;
    const newEq = currentWallet.equityCents + amtCents;

    dbEngine.updateWallet(
      mode,
      newBal,
      currentWallet.reservedCents,
      newEq,
      currentWallet.realizedPnlCents,
      'DEPOSIT',
      note || `API Deposit ($${dollars.toFixed(2)})`
    );

    res.json({ success: true, wallet: dbEngine.getWallet(mode) });
  });

  // Wallet withdrawal
  app.post('/api/wallet/withdraw', (req: Request, res: Response) => {
    const { amountDollars, note } = req.body;
    const dollars = parseFloat(amountDollars);
    if (isNaN(dollars) || dollars <= 0) {
      res.status(400).json({ error: 'Invalid withdrawal amount' });
      return;
    }
    const mode = tradingEngine.mode === 'LIVE' ? 'LIVE' : 'PAPER';
    const currentWallet = dbEngine.getWallet(mode);
    const amtCents = Math.round(dollars * 100);

    if (amtCents > currentWallet.balanceCents) {
      res.status(400).json({ error: 'Withdrawal exceeds available unreserved cash balance' });
      return;
    }

    const newBal = currentWallet.balanceCents - amtCents;
    const newEq = currentWallet.equityCents - amtCents;

    dbEngine.updateWallet(
      mode,
      newBal,
      currentWallet.reservedCents,
      newEq,
      currentWallet.realizedPnlCents,
      'WITHDRAWAL',
      note || `API Withdrawal ($${dollars.toFixed(2)})`
    );

    res.json({ success: true, wallet: dbEngine.getWallet(mode) });
  });

  // Paper wallet reset
  app.post('/api/wallet/reset', (req: Request, res: Response) => {
    const { startingBankrollDollars } = req.body;
    const dollars = parseFloat(startingBankrollDollars) || 1000;
    const cents = Math.round(dollars * 100);

    dbEngine.resetPaperWallet(cents);
    res.json({ success: true, wallet: dbEngine.getWallet('PAPER') });
  });

  // Switch execution mode
  app.post('/api/mode', (req: Request, res: Response) => {
    const { mode, operatorConfirmation } = req.body;
    if (mode === 'LIVE' && !operatorConfirmation) {
      res.status(403).json({
        error: 'Explicit operator confirmation required to enable LIVE authenticated trading mode.',
      });
      return;
    }

    if (!['SIMULATION', 'PAPER', 'LIVE'].includes(mode)) {
      res.status(400).json({ error: 'Invalid execution mode' });
      return;
    }

    tradingEngine.mode = mode;
    tradingEngine.logDiagnostic('WARN', 'ORDER_ROUTING', `API switched execution mode to [${mode}]`);
    res.json({ success: true, mode: tradingEngine.mode });
  });

  // Diagnostics export
  app.get('/api/diagnostics', (_req: Request, res: Response) => {
    res.json(tradingEngine.exportDiagnosticBundle());
  });

  // GitHub Auto-Updater status & manual check
  app.get('/api/update/status', (_req: Request, res: Response) => {
    res.json(githubUpdater.getStatus());
  });

  app.post('/api/update/check', async (_req: Request, res: Response) => {
    const result = await githubUpdater.checkUpdate();
    res.json(result);
  });

  // --- VITE MIDDLEWARE OR STATIC PRODUCTION SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('[Server] Shutting down QuantScale server...');
    tradingEngine.stop();
    releaseEngineLock();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  QuantScale / K-Alpha Persistent Server Running`);
    console.log(`  Port: http://localhost:${PORT}`);
    console.log(`  WebSocket Endpoint: ws://localhost:${PORT}/ws`);
    console.log(`  Execution Mode: ${tradingEngine.mode}`);
    console.log(`  Primary Lock: ${isPrimary ? 'HELD' : 'SECONDARY'}`);
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal server startup error:', err);
  releaseEngineLock();
  process.exit(1);
});
