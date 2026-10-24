import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { tradingEngine } from './src/services/tradingEngine';
import { dbEngine } from './src/db/serverStore';
import { githubUpdater } from './src/services/githubUpdater';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const LOCK_FILE = path.join(__dirname, '.engine.lock');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY || ADMIN_API_KEY.length < 32) throw new Error('Set a strong ADMIN_API_KEY in the server environment before starting QuantScale.');

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

// Administrative credentials are accepted ONLY from the header, never URLs or JSON bodies.
function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const key = req.header('x-api-key');
  if (!key || key !== ADMIN_API_KEY) {
    res.status(401).json({ error: 'Administrator authorization required.' });
    return;
  }
  next();
}

async function startServer() {
  const isPrimary = acquireEngineLock();
  if (!isPrimary) throw new Error('Another QuantScale engine appears active. Refusing to start a second server.');

  // Restore durable state before starting the only trading engine.
  const saved = dbEngine.getEngineSnapshot();
  if (saved) {
    tradingEngine.orders = saved.orders || [];
    tradingEngine.positions = saved.positions || [];
    tradingEngine.spotHistory = saved.spotHistory || [];
    tradingEngine.candles = saved.candles || [];
    if (saved.currentMarket) tradingEngine.currentMarket = saved.currentMarket;
    if (saved.currentBook) tradingEngine.currentBook = saved.currentBook;
    if (Number.isFinite(saved.currentSpotPrice)) tradingEngine.currentSpotPrice = saved.currentSpotPrice;
    if (saved.autoTradingMode) tradingEngine.autoTradingMode = saved.autoTradingMode;
  }
  // LIVE remains disabled and changes require an authenticated server action.
  tradingEngine.mode = 'PAPER';
  tradingEngine.isAutoTrading = false;
  const primary = tradingEngine.riskManager.getPortfolio('PRIMARY');
  const cash = dbEngine.getWallet('PAPER').balanceCents / 100;
  if (primary) {
    primary.cashBalance = cash;
    primary.equity = cash;
    primary.usableHeadroom = cash;
  }
  const persist = () => {
    try {
      dbEngine.reconcileClosedPositions(tradingEngine.positions);
      dbEngine.saveEngineSnapshot({
        orders: tradingEngine.orders, positions: tradingEngine.positions,
        spotHistory: tradingEngine.spotHistory, candles: tradingEngine.candles,
        currentMarket: tradingEngine.currentMarket, currentBook: tradingEngine.currentBook,
        currentSpotPrice: tradingEngine.currentSpotPrice,
        autoTradingMode: tradingEngine.autoTradingMode,
      });
    } catch (error) {
      tradingEngine.isAutoTrading = false;
      tradingEngine.riskManager.setEmergencyPause(true);
      console.error('[PERSISTENCE] Trading halted because saving failed:', error);
    }
  };

  const app = express();
  app.use(express.json({ limit: '16kb' }));

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
      positions: tradingEngine.positions,
      orders: tradingEngine.orders,
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
    tradingEngine.subscribe(persist);
    persist();
    // Update checks/deployments run in a separate systemd timer, not inside the trading process.
  }

  // --- REST API ROUTES ---

  // Local deployment health is distinct from market readiness.
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok', database: 'ready', isPrimaryWriter: isPrimary,
      mode: tradingEngine.mode, activeEngine: tradingEngine.getIsRunning(),
      marketReady: tradingEngine.mode === 'DEMO' ||
        (tradingEngine.currentBook.source === 'KALSHI_WS' && !tradingEngine.currentBook.isStale),
    });
  });

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

  // Wallet deposit (Authenticated)
  app.post('/api/wallet/deposit', authenticateAdmin, (req: Request, res: Response) => {
    const { amountDollars, note } = req.body;
    const dollars = Number(amountDollars);
    if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 1000000 || !Number.isSafeInteger(Math.round(dollars * 100))) {
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

  // Wallet withdrawal (Authenticated)
  app.post('/api/wallet/withdraw', authenticateAdmin, (req: Request, res: Response) => {
    const { amountDollars, note } = req.body;
    const dollars = Number(amountDollars);
    if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 1000000 || !Number.isSafeInteger(Math.round(dollars * 100))) {
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

  // Paper wallet reset (Authenticated)
  app.post('/api/wallet/reset', authenticateAdmin, (req: Request, res: Response) => {
    const { startingBankrollDollars } = req.body;
    const dollars = Number(startingBankrollDollars);
    const cents = Math.round(dollars * 100);

    if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 1000000) {
      res.status(400).json({ error: 'Invalid paper bankroll' });
      return;
    }
    if (tradingEngine.positions.some(p => p.status === 'OPEN')) {
      res.status(409).json({ error: 'Cannot reset wallet with open positions.' });
      return;
    }
    dbEngine.resetPaperWallet(cents);
    const primary = tradingEngine.riskManager.getPortfolio('PRIMARY');
    if (primary) primary.cashBalance = dollars;
    res.json({ success: true, wallet: dbEngine.getWallet('PAPER') });
  });

  // LIVE is deliberately unavailable until authenticated order routing is independently verified.
  app.post('/api/mode', authenticateAdmin, (req: Request, res: Response) => {
    const mode = req.body?.mode;
    if (mode === 'LIVE') {
      res.status(403).json({ error: 'LIVE execution is disabled in this build.' });
      return;
    }
    if (mode !== 'DEMO' && mode !== 'PAPER') {
      res.status(400).json({ error: 'Only DEMO or PAPER is supported.' });
      return;
    }
    tradingEngine.stop();
    tradingEngine.mode = mode;
    tradingEngine.isAutoTrading = false;
    tradingEngine.start();
    persist();
    res.json({ success: true, mode, isAutoTrading: false });
  });

  // Diagnostics export
  app.get('/api/diagnostics', (_req: Request, res: Response) => {
    res.json(tradingEngine.exportDiagnosticBundle());
  });

  // GitHub Auto-Updater status & manual check
  app.get('/api/update/status', (_req: Request, res: Response) => {
    res.json(githubUpdater.getStatus());
  });

  app.post('/api/update/check', authenticateAdmin, async (_req: Request, res: Response) => {
    const result = await githubUpdater.checkUpdate();
    res.json(result);
  });

  app.post('/api/update/deploy', authenticateAdmin, (_req: Request, res: Response) => {
    res.status(409).json({ error: 'Deployments run through the external systemd update timer.' });
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
    persist();
    dbEngine.close();
    releaseEngineLock();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
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
