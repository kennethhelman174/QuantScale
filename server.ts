import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { tradingEngine } from './src/services/tradingEngine';
import { dbEngine } from './src/db/serverStore';
import { githubUpdater } from './src/services/githubUpdater';
import { KalshiPublicFeed } from './src/services/kalshiPublicFeed';
import { KalshiSettlementObserver } from './src/services/kalshiSettlementObserver';
import { CoinbaseProxyFeed } from './src/services/coinbaseProxyFeed';
import { evaluateWindowDirection } from './src/services/directionResearch';
import { evaluateQuoteResearch } from './src/services/quoteResearch';
import { evaluateCalibration } from './src/services/probabilityCalibration';
import { PythonPaperBridge } from './src/services/pythonPaperBridge';
import { paperConsistency } from './src/services/paperConsistency';
import type { Kalshi15MMarket, KalshiOrderBook } from './src/types/market';

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
  const startupWallet = dbEngine.getWallet('PAPER');
  tradingEngine.riskManager.synchronizePaperWallet(
    startupWallet.balanceCents, startupWallet.reservedCents, startupWallet.realizedPnlCents, true
  );
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

  // Observation-only exchange feed. Not connected to the order execution path.
  let exchangeMarket: Kalshi15MMarket | null = null;
  let exchangeBook: KalshiOrderBook | null = null;
  const coinbaseProxy = new CoinbaseProxyFeed();
  const pythonBridge = new PythonPaperBridge();
  const settlementObserver = new KalshiSettlementObserver(observation => {
    // Immutable ledger of official outcomes, not a trading instruction.
    dbEngine.recordOfficialSettlement(observation);
  });
  const publicFeed = new KalshiPublicFeed((market, book) => {
    exchangeMarket = market;
    exchangeBook = book;
    broadcastExchange();
  }, ticker => settlementObserver.track(ticker));

  const app = express();
  app.use(express.json({ limit: '16kb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Exchange REST updates never authorize trading or settlement.
  const displayMarket = () => exchangeMarket;
  const displayBook = () => exchangeBook && Date.now() - exchangeBook.timestamp < 12000
    ? exchangeBook : {
      ...tradingEngine.currentBook,
      // Suppress fabricated ladder liquidity when there is no verified exchange book.
      yesBids: [], yesAsks: [], noBids: [], noAsks: [], spread: 0,
      midPrice: 0, microImbalance: 0, isEmpty: true, isStale: true,
    };
  const broadcastExchange = () => {
    const packet = JSON.stringify({ type: 'KALSHI_OBSERVATION', market: displayMarket(),
      book: displayBook(), feed: publicFeed.status() });
    for (const client of connectedClients) if (client.readyState === WebSocket.OPEN) client.send(packet);
  };

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
      market: displayMarket(),
      book: displayBook(),
      positions: tradingEngine.positions,
      orders: tradingEngine.orders,
      isAutoTrading: tradingEngine.isAutoTrading,
      autoTradingMode: tradingEngine.autoTradingMode,
      wallet: dbEngine.getWallet('PAPER'),
      riskPortfolios: tradingEngine.riskManager.getAllPortfolios(),
      candles: tradingEngine.candles,
      spotHistory: tradingEngine.spotHistory,
      feed: publicFeed.status(),
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
      market: displayMarket(),
      book: displayBook(),
      positions: tradingEngine.positions,
      orders: tradingEngine.orders,
      positionsCount: tradingEngine.positions.length,
      ordersCount: tradingEngine.orders.length,
      isAutoTrading: tradingEngine.isAutoTrading,
      autoTradingMode: tradingEngine.autoTradingMode,
      wallet: dbEngine.getWallet('PAPER'),
      riskPortfolios: tradingEngine.riskManager.getAllPortfolios(),
      candles: tradingEngine.candles,
      spotHistory: tradingEngine.spotHistory,
      feed: publicFeed.status(),
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
    publicFeed.start();
    coinbaseProxy.start();
    pythonBridge.start();
    settlementObserver.start();
    tradingEngine.subscribe(() => {
      broadcastState();
    });
    tradingEngine.subscribe(persist);
    persist();
    // The in-process service only checks status. Deployment is handled by systemd.
    githubUpdater.startAutoCheck();
  }

  app.get('/api/kalshi/settlements', (_req: Request, res: Response) => {
    res.json({settlements:settlementObserver.list(), confirmedHistory:dbEngine.listOfficialSettlements(), observationOnly:true, payoutsApplied:false});
  });

  app.get('/api/research/direction', (_req: Request, res: Response) => {
    const feed=coinbaseProxy.snapshot();
    res.json({signal:evaluateWindowDirection(exchangeMarket,feed.samples),proxyFeed:{error:feed.error,lastSeen:feed.lastSeen},observationOnly:true,ordersEnabled:false});
  });

  // Read-only go/no-go report. Never unlock execution from this endpoint.
  app.get('/api/paper/readiness', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const python = pythonBridge.status();
    const feed = publicFeed.status();
    const bookFresh = !!exchangeBook && exchangeBook.source === 'KALSHI_REST'
      && !exchangeBook.isEmpty && Date.now() - exchangeBook.timestamp < 12000;
    const pythonSnapshot = python.connected ? python.snapshot : null;
    const py = pythonSnapshot as Record<string, any> | null;
    const checks = [
      {id:'database',pass:isPrimary,detail:isPrimary?'Single primary writer':'No primary writer'},
      {id:'paper_mode',pass:tradingEngine.mode === 'PAPER',detail:tradingEngine.mode},
      {id:'live_disarmed',pass:tradingEngine.mode !== 'LIVE',detail:'LIVE not enabled'},
      {id:'quant_auto_disabled',pass:!tradingEngine.isAutoTrading,detail:'QuantScale automated orders must remain disabled'},
      {id:'python_bridge_fresh',pass:python.connected,detail:python.connected?'Read-only snapshot current':python.error},
      {id:'python_paper_identity',pass:!!py && typeof py.executionId === 'string'
        && typeof py.paper?.equity === 'number',detail:'Independent Python paper ledger'},
      {id:'kalshi_active_market',pass:!!exchangeMarket,detail:exchangeMarket?.ticker ?? 'No active contract'},
      {id:'kalshi_fresh_book',pass:bookFresh,detail:bookFresh?'Fresh REST book':'Unavailable or stale'},
      {id:'official_reference',pass:feed.referencePriceVerified === true,detail:'QuantScale official reference not independently verified'},
      {id:'calibrated_model',pass:false,detail:'QuantScale calibration requires official out-of-sample outcomes'},
      {id:'settlement_reconciled',pass:false,detail:'No verified end-to-end QuantScale settlement reconciliation'},
    ];
    const prerequisites = checks.filter(check=>!check.pass).map(check=>check.id);
    res.json({status:'BLOCKED_FOR_QUANTSCALE_AUTOMATION',pythonPaperObservationReady:python.connected
      && !!py && typeof py.paper?.equity === 'number',
      quantScaleAutoTradingAllowed:false,liveTradingAllowed:false,
      checks,blockingPrerequisites:prerequisites,feedState:feed.marketState,
      asOf:new Date().toISOString(),walletsSeparate:true});
  });

  // Sanitized, bounded read-only history from the Python dashboard.
  app.get('/api/python-paper/operations', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control','no-store');
    const bridge = pythonBridge.status();
    if (!bridge.connected || !bridge.snapshot) {
      res.status(503).json({connected:false,error:'Python paper heartbeat unavailable',readOnly:true});
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const upstream = await fetch('http://127.0.0.1:8765/api/status', {
        signal:controller.signal, headers:{Accept:'application/json',Host:'127.0.0.1:8765'}
      });
      if (!upstream.ok) throw new Error('Python status unavailable');
      const raw = await upstream.text();
      if (raw.length > 2500000) throw new Error('Python status exceeds limit');
      const source = JSON.parse(raw);
      const snapshot = bridge.snapshot as Record<string,unknown>;
      if (source.execution_id !== snapshot.executionId) throw new Error('Paper wallet identity mismatch');
      const number = (v:unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
      const label = (v:unknown) => typeof v === 'string' ? v.slice(0,120) : null;
      const object = (v:unknown):Record<string,any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,any> : {};
      const execution = object(source.execution);
      const feed = object(source.feed);
      const market = object(source.market);
      const marketQuote = object(market.quote);
      const brtiRef = object(snapshot.brti);
      const totals = object(execution.totals);
      const trades = Array.isArray(execution.trades) ? execution.trades.slice(0,30) : [];
      const positions = Array.isArray(execution.positions) ? execution.positions.slice(0,20) : [];
      res.json({
        reconciliation:paperConsistency({execution,totals,quoteFresh:feed.quote_fresh===true}),
        connected:true,readOnly:true,walletsSeparate:true,paperOnly:source.paper_only===true,
        executionId:source.execution_id,asOf:number(source.server_time),
        marketTicker:label(market.ticker),strategy:label(source.strategy),paused:source.paused===true,
        brti:{price:number(brtiRef.price),ageSeconds:number(brtiRef.ageSeconds),status:label(brtiRef.status)},
        quote:{yesBid:feed.quote_fresh===true?number(marketQuote.yes_bid):null,
          yesAsk:feed.quote_fresh===true?number(marketQuote.yes_ask):null,
          bidSize:feed.quote_fresh===true?number(marketQuote.bid_size):null,
          askSize:feed.quote_fresh===true?number(marketQuote.ask_size):null,
          source:feed.quote_fresh===true?label(marketQuote.source):null},
        feed:{status:label(feed.status),heartbeatAge:number(feed.heartbeat_age),quoteAge:number(feed.quote_age),
          quoteFresh:feed.quote_fresh===true,heartbeatFresh:feed.heartbeat_fresh===true},
        wallet:{initial:number(execution.initial),cash:number(execution.cash),equity:number(execution.equity),
          totalPnl:number(execution.total_pnl),unrealizedNet:number(execution.unrealized_net),
          dailyPnl:number(execution.daily_pnl),dailyHalt:execution.daily_halt===true,drawdownHalt:execution.drawdown_halt===true},
        totals:{closedTrades:number(totals.closed_trades),realizedNet:number(totals.realized_net),
          closedFees:number(totals.closed_fees),wins:number(totals.wins)},
        strategies:Array.isArray(execution.strategy_totals)?execution.strategy_totals.slice(0,8).map((x:unknown)=>{
          const row=object(x);return {name:label(row.strategy),closedTrades:number(row.closed_trades),
            net:number(row.net),fees:number(row.fees)};
        }):[],
        positions:positions.map((x:unknown)=>{const p=object(x);return {ticker:label(p.ticker),
          side:label(p.side),strategy:label(p.strategy),qty:number(p.qty),entry:number(p.entry),
          unrealizedPnl:number(p.unrealized_pnl)};}),
        trades:trades.map((x:unknown)=>{const t=object(x);return {id:number(t.id),ts:number(t.ts),
          ticker:label(t.ticker),strategy:label(t.strategy),side:label(t.side),
          qty:number(t.qty),entry:number(t.entry),exit:number(t.exit),net:number(t.net),
          gross:number(t.gross),fees:number(t.fees),reason:label(t.reason)};})
      });
    } catch (_error) {
      res.status(503).json({connected:false,error:'Python paper operations unavailable or stale',readOnly:true});
    } finally {clearTimeout(timeout);}
  });

  app.get('/api/python-paper/status', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control','no-store');
    res.json(pythonBridge.status());
  });

  app.get('/api/research/calibration', (_req: Request, res: Response) => {
    // This endpoint deliberately does not fabricate historical predictions from settlement outcomes.
    res.json({calibration:evaluateCalibration([]),observationOnly:true,ordersEnabled:false});
  });

  app.get('/api/research/quotes', (_req: Request, res: Response) => {
    const proxy=coinbaseProxy.snapshot();
    const direction=evaluateWindowDirection(exchangeMarket,proxy.samples);
    res.json({research:evaluateQuoteResearch(direction,exchangeBook),observationOnly:true,
      paperOrdersPlaced:0,feesEstimatedOnly:true,walletUnchanged:true});
  });

  app.get('/api/kalshi/observation', (_req: Request, res: Response) => {
    res.json({ market: exchangeMarket, book: displayBook(), feed: publicFeed.status(),
      paperExecutionEnabled: false });
  });

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
      market: displayMarket(),
      book: displayBook(),
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

    const paper = dbEngine.getWallet('PAPER');
    tradingEngine.riskManager.synchronizePaperWallet(paper.balanceCents, paper.reservedCents, paper.realizedPnlCents);
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

    const paper = dbEngine.getWallet('PAPER');
    tradingEngine.riskManager.synchronizePaperWallet(paper.balanceCents, paper.reservedCents, paper.realizedPnlCents);
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
    const paper = dbEngine.getWallet('PAPER');
    tradingEngine.riskManager.synchronizePaperWallet(paper.balanceCents, paper.reservedCents, paper.realizedPnlCents, true);
    res.json({ success: true, wallet: dbEngine.getWallet('PAPER') });
  });

  // Read-only operator state, sourced exclusively from the Raspberry Pi backend.
  app.get('/api/paper/control', (_req: Request, res: Response) => {
    res.json({
      mode: tradingEngine.mode,
      isAutoTrading: tradingEngine.isAutoTrading,
      profile: tradingEngine.autoTradingMode,
      isPaused: tradingEngine.riskManager.isPaused(),
      marketReady: tradingEngine.currentBook.source === 'KALSHI_WS' &&
        !tradingEngine.currentBook.isStale &&
        Date.now() - tradingEngine.currentBook.timestamp <= tradingEngine.riskManager.getLimits().maxDataAgeMs,
    });
  });

  // Administrative control must never be reachable without the secret header.
  app.post('/api/paper/control', authenticateAdmin, (req: Request, res: Response) => {
    const command = req.body?.command;
    if (command === 'pause') {
      tradingEngine.toggleAutoTrading(false);
    } else if (command === 'profile') {
      const profile = req.body?.profile;
      if (!['ACTIVE', 'BALANCED', 'CONSERVATIVE'].includes(profile)) {
        res.status(400).json({ error: 'Invalid profile' });
        return;
      }
      tradingEngine.setAutoTradingMode(profile);
    } else if (command === 'resume') {
      // Audit gate: the current fixed-strike engine is not contract-compatible with KXBTC15M.
      // Read-only exchange quotes cannot authorize automated PAPER execution.
      res.status(409).json({error:'Automated PAPER trading disabled until directional contract pricing and settlement reconciliation are validated.'});
      return;
    } else {
      res.status(400).json({ error: 'Unknown command' });
      return;
    }
    persist();
    broadcastState();
    res.json({ success: true, isAutoTrading: tradingEngine.isAutoTrading, profile: tradingEngine.autoTradingMode });
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
    if (tradingEngine.positions.some(p => p.status === 'OPEN')) {
      res.status(409).json({ error: 'Cannot switch modes with open positions.' });
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
    publicFeed.stop();
    coinbaseProxy.stop();
    pythonBridge.stop();
    settlementObserver.stop();
    githubUpdater.stopAutoCheck();
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
