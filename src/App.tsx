/**
 * K-Alpha: Kalshi Bitcoin 15-Minute Prediction Market Trading Platform
 *
 * Senior Quantitative Research, Microstructure Analytics, Realistic Simulation,
 * and Autonomous Execution Engine for Kalshi Prediction Markets.
 */

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { tradingEngine } from './services/tradingEngine';
import { Position } from './types/market';
import { Navbar } from './components/Navbar';
import { PaperHome } from './components/PaperHome';
import { PositionsTab } from './components/PositionsTab';
import { StrategiesTab } from './components/StrategiesTab';
import { ResearchTab } from './components/ResearchTab';
import { ExperimentsTab } from './components/ExperimentsTab';
import { BacktestTab } from './components/BacktestTab';
import { DiagnosticsTab } from './components/DiagnosticsTab';
import { RunbookTab } from './components/RunbookTab';
import { SafeguardsModal } from './components/SafeguardsModal';
import { VolatilityAlertToast } from './components/VolatilityAlertToast';
import { KalshiSetupWizard } from './components/KalshiSetupWizard';
import { PaperWalletTab } from './components/PaperWalletTab';
import { KalshiApiCredentials } from './services/kalshiClient';
import { Footer } from './components/Footer';
import { PythonPaperStatus } from './components/PythonPaperStatus';
import { PythonPaperOperations } from './components/PythonPaperOperations';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSafeguardsOpen, setIsSafeguardsOpen] = useState(false);
  const [safeguardsTab, setSafeguardsTab] = useState<'safeguards' | 'alerts'>('safeguards');
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  const [isKiosk, setIsKiosk] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('quantscale_theme') as 'dark' | 'light') || 'dark';
  });

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('quantscale_theme', nextTheme);
  };

  const [backendConnected, setBackendConnected] = useState(false);
  const [backendRunning, setBackendRunning] = useState(false);
  const [exchangeState, setExchangeState] = useState<{marketState:string;quoteState:string;nextOpen:string|null;referenceVerified:boolean}|null>(null);
  const controlsUnavailable = () => alert('Only authenticated backend trading controls are allowed. Browser-local trading is disabled.');
  // Subscribe to real-time central backend engine state changes via WebSocket
  const [, setTick] = useState(0);
  useEffect(() => {
    let socket: WebSocket | null = null;
    let isConnectedToServer = false;

    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          isConnectedToServer = true;
          setBackendConnected(true);
          tradingEngine.logDiagnostic('INFO', 'ORDER_ROUTING', 'Dashboard client synced with central QuantScale backend server.');
        };

        socket.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            if (packet.type === 'TICK_UPDATE' || packet.type === 'STATE_SNAPSHOT' || packet.type === 'KALSHI_OBSERVATION') {
              if (packet.feed) {
                const feed = packet.feed;
                setExchangeState({
                  marketState:feed.marketState||'UNAVAILABLE',
                  quoteState:feed.quoteState||'UNAVAILABLE',
                  nextOpen:feed.discovery?.nextScheduledOpen||null,
                  referenceVerified:feed.referencePriceVerified===true
                });
              }
              if (Number.isFinite(packet.spotPrice)) tradingEngine.currentSpotPrice = packet.spotPrice;
              if (packet.market) tradingEngine.currentMarket = packet.market;
              if (packet.book) tradingEngine.currentBook = packet.book;
              if (Array.isArray(packet.candles)) tradingEngine.candles = packet.candles;
              if (Array.isArray(packet.spotHistory)) tradingEngine.spotHistory = packet.spotHistory;
              if (Array.isArray(packet.riskPortfolios)) tradingEngine.riskManager.hydratePortfolios(packet.riskPortfolios);
              setBackendRunning(true);
              if (packet.mode) tradingEngine.mode = packet.mode;
              if (typeof packet.isAutoTrading === 'boolean') tradingEngine.isAutoTrading = packet.isAutoTrading;
              if (packet.autoTradingMode) tradingEngine.autoTradingMode = packet.autoTradingMode;
              if (packet.positions) tradingEngine.positions = packet.positions;
              if (packet.orders) tradingEngine.orders = packet.orders;
              setTick((t) => t + 1);
            }
          } catch {
            // Ignored
          }
        };

        socket.onclose = () => { setBackendConnected(false); setBackendRunning(false); };
        socket.onerror = () => { setBackendConnected(false); setBackendRunning(false); };
      } catch { setBackendConnected(false); }
    }

    const unsubscribe = tradingEngine.subscribe(() => {
      setTick((t) => t + 1);
    });

    return () => {
      if (socket) socket.close();
      unsubscribe();
    };
  }, []);

  const allPortfolios = tradingEngine.riskManager.getAllPortfolios();

  const handleClosePosition = (_pos: Position) => controlsUnavailable();
  const handleCancelOrder = (_orderId: string) => controlsUnavailable();
  const handleToggleEngine = () => controlsUnavailable();

  return (
    <div className={`min-h-screen transition-colors duration-200 ${theme === 'light' ? 'theme-light bg-slate-50 text-slate-900' : 'bg-[#0a0a0c] text-neutral-100'} flex flex-col font-sans selection:bg-cyan-500 selection:text-black ${isKiosk ? 'p-2' : ''}`}>
      {!backendConnected && <div role="alert" className="bg-red-900 p-3 text-white text-center">Backend disconnected — NO trading will run locally.</div>}
      {backendConnected && <div role="status" className="bg-slate-950 text-slate-400 px-3 py-2 text-center text-xs">
        QuantScale direct order routing OFF · Its own Kalshi feed: {exchangeState?.marketState ?? 'CHECKING'} · Book: {exchangeState?.quoteState ?? 'CHECKING'} · Reference: {exchangeState?.referenceVerified ? 'verified' : 'not verified'} · Python PAPER simulation is monitored separately below
        {exchangeState?.nextOpen && <span className="block text-xs mt-1 font-normal">Next listed opening: {new Date(exchangeState.nextOpen).toLocaleString()} (local time; not a guarantee of active trading)</span>}
      </div>}
      <PythonPaperStatus />
      {/* Top Bar Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mode={tradingEngine.mode}
        isRunning={backendRunning}
        onToggleEngine={handleToggleEngine}
        isAutoTrading={tradingEngine.isAutoTrading}
        onToggleAutoTrading={controlsUnavailable}
        onOpenSafeguards={(tab = 'safeguards') => {
          setSafeguardsTab(tab);
          setIsSafeguardsOpen(true);
        }}
        onOpenSetupWizard={controlsUnavailable}
        isKiosk={isKiosk}
        onToggleKiosk={() => setIsKiosk(!isKiosk)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        spotPrice={tradingEngine.currentSpotPrice}
        spotHistory={tradingEngine.spotHistory}
      />

      {/* Floating Volatility & Price-Action Visual Alert Toasts */}
      <VolatilityAlertToast
        onOpenAlertSettings={() => {
          setSafeguardsTab('alerts');
          setIsSafeguardsOpen(true);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'overview' && <PaperHome openHistory={() => setActiveTab('python-paper')} />}

        {activeTab === 'python-paper' && <PythonPaperOperations />}

        {activeTab === 'positions' && (
          <PositionsTab
            positions={tradingEngine.positions}
            orders={tradingEngine.orders}
            onClosePosition={handleClosePosition}
            onCancelOrder={handleCancelOrder}
          />
        )}

        {activeTab === 'strategies' && (
          <StrategiesTab
            decisionVolMetric={tradingEngine.decisionVolMetric}
            onSetDecisionVolMetric={controlsUnavailable}
            spotHistory={tradingEngine.spotHistory}
            candles={tradingEngine.candles}
            currentSpotPrice={tradingEngine.currentSpotPrice}
            autoTradingMode={tradingEngine.autoTradingMode}
            onSetAutoTradingMode={controlsUnavailable}
          />
        )}

        {activeTab === 'research' && (
          <ResearchTab
            metrics={tradingEngine.exportDiagnosticBundle().modelMetrics}
            positions={tradingEngine.positions}
            observations={tradingEngine.dataCollector.getStoredObservations()}
            spotHistory={tradingEngine.spotHistory}
          />
        )}

        {activeTab === 'portfolios' && <ExperimentsTab portfolios={allPortfolios} />}

        {activeTab === 'backtest' && <BacktestTab />}

        {activeTab === 'diagnostics' && (
          <DiagnosticsTab logs={tradingEngine.diagnosticLogs} />
        )}

        {activeTab === 'runbook' && <RunbookTab />}

        {activeTab === 'wallet' && <PaperWalletTab />}
      </main>

      {/* Mandatory Footer with Version Display */}
      <Footer />

      {/* Emergency Safeguards & Volatility Alerts Modal */}
      <SafeguardsModal
        isOpen={isSafeguardsOpen}
        initialTab={safeguardsTab}
        onClose={() => setIsSafeguardsOpen(false)}
        currentMode={tradingEngine.mode}
        isPaused={tradingEngine.riskManager.isPaused()}
        riskLimits={tradingEngine.riskManager.getLimits()}
        onTogglePause={controlsUnavailable}
        onCancelAllOrders={controlsUnavailable}
        onFlattenPositions={controlsUnavailable}
        onSetExecutionMode={controlsUnavailable}
        onUpdateRiskLimits={controlsUnavailable}
      />

    </div>
  );
}
