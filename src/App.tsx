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
import { OverviewTab } from './components/OverviewTab';
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

  // Subscribe to real-time engine state changes
  const [, setTick] = useState(0);
  useEffect(() => {
    // Start trading engine
    tradingEngine.start();
    const unsubscribe = tradingEngine.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const primaryRisk = tradingEngine.riskManager.getPortfolio('PRIMARY')!;
  const allPortfolios = tradingEngine.riskManager.getAllPortfolios();

  const handleManualOrder = (side: 'YES' | 'NO', price: number, contracts: number) => {
    const action = side === 'YES' ? 'ENTER_YES' : 'ENTER_NO';
    tradingEngine['submitStrategyOrder']('PRIMARY', {
      strategyId: 'BTC-LEADLAG-SCALP',
      timestamp: Date.now(),
      marketTicker: tradingEngine.currentMarket.ticker,
      action,
      suggestedPrice: price,
      suggestedQuantity: contracts,
      theoreticalProbability: price / 100,
      marketProbability: price / 100,
      edgeCents: 1.5,
      expectedNetValue: 0.15,
      uncertaintyEstimate: 0.05,
      rationale: `Manual simulator ticket: Buy ${side} @ ${price}¢ (${contracts} contracts)`,
    });
  };

  const handleClosePosition = (pos: Position) => {
    const exitPrice =
      pos.side === 'YES'
        ? tradingEngine.currentBook.yesBids[0]?.price || pos.entryPrice
        : tradingEngine.currentBook.noBids[0]?.price || (100 - pos.entryPrice);
    tradingEngine.closePosition(pos, exitPrice, 'Manual User Close', Date.now());
  };

  const handleCancelOrder = (orderId: string) => {
    const ord = tradingEngine.orders.find((o) => o.id === orderId);
    if (ord) {
      ord.state = 'CANCELED';
      ord.canceledAt = Date.now();
      tradingEngine.logDiagnostic('INFO', 'ORDER_ROUTING', `Canceled order #${orderId}`);
    }
  };

  const handleToggleEngine = () => {
    if (tradingEngine.getIsRunning()) {
      tradingEngine.stop();
    } else {
      tradingEngine.start();
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${theme === 'light' ? 'theme-light bg-slate-50 text-slate-900' : 'bg-[#0a0a0c] text-neutral-100'} flex flex-col font-sans selection:bg-cyan-500 selection:text-black ${isKiosk ? 'p-2' : ''}`}>
      {/* Top Bar Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mode={tradingEngine.mode}
        isRunning={tradingEngine.getIsRunning()}
        onToggleEngine={handleToggleEngine}
        isAutoTrading={tradingEngine.isAutoTrading}
        onToggleAutoTrading={() => tradingEngine.toggleAutoTrading()}
        onOpenSafeguards={(tab = 'safeguards') => {
          setSafeguardsTab(tab);
          setIsSafeguardsOpen(true);
        }}
        onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
        isKiosk={isKiosk}
        onToggleKiosk={() => setIsKiosk(!isKiosk)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
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
        {activeTab === 'overview' && (
          <OverviewTab
            market={tradingEngine.currentMarket}
            book={tradingEngine.currentBook}
            spotPrice={tradingEngine.currentSpotPrice}
            candles={tradingEngine.candles}
            positions={tradingEngine.positions}
            riskState={primaryRisk}
            decisions={tradingEngine.decisionsLog}
            onManualOrder={handleManualOrder}
            isAutoTrading={tradingEngine.isAutoTrading}
            onToggleAutoTrading={() => tradingEngine.toggleAutoTrading()}
            autoTradingMode={tradingEngine.autoTradingMode}
            onSetAutoTradingMode={(m) => tradingEngine.setAutoTradingMode(m)}
            autoTradeCount={tradingEngine.autoTradeCount}
            lastAutoTradeSummary={tradingEngine.lastAutoTradeSummary}
            onTriggerAutoTrade={() => tradingEngine.triggerAutonomousTrade()}
          />
        )}

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
            onSetDecisionVolMetric={(m) => tradingEngine.setDecisionVolMetric(m)}
            spotHistory={tradingEngine.spotHistory}
            candles={tradingEngine.candles}
            currentSpotPrice={tradingEngine.currentSpotPrice}
            autoTradingMode={tradingEngine.autoTradingMode}
            onSetAutoTradingMode={(m) => tradingEngine.setAutoTradingMode(m)}
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
        onTogglePause={() => {
          tradingEngine.riskManager.setEmergencyPause(!tradingEngine.riskManager.isPaused());
        }}
        onCancelAllOrders={() => tradingEngine.manualCancelAllOrders('PRIMARY')}
        onFlattenPositions={() => tradingEngine.manualFlattenPositions('PRIMARY')}
        onSetExecutionMode={(m) => {
          tradingEngine.mode = m;
          tradingEngine.logDiagnostic('WARN', 'ORDER_ROUTING', `Execution environment switched to [${m}]`);
        }}
        onUpdateRiskLimits={(limits) => {
          tradingEngine.riskManager.updateLimits(limits);
          tradingEngine.logDiagnostic('INFO', 'RISK_GATE', 'Updated portfolio financial limits');
        }}
      />

      {/* Kalshi API Setup Wizard Modal */}
      <KalshiSetupWizard
        isOpen={isSetupWizardOpen}
        onClose={() => setIsSetupWizardOpen(false)}
        currentCredentials={tradingEngine.dataCollector.getCredentials()}
        onSaveCredentials={async (creds: KalshiApiCredentials) => {
          tradingEngine.dataCollector.setCredentials(creds);
          if (creds.environment !== 'PAPER') {
            tradingEngine.mode = creds.environment === 'LIVE' ? 'LIVE' : 'DEMO';
          }
          const res = await tradingEngine.dataCollector.testConnectivity();
          tradingEngine.logDiagnostic(
            res.isSuccess ? 'INFO' : 'WARN',
            'MARKET_DATA',
            `API Setup Wizard tested credentials against Kalshi gateway: ${res.message}`
          );
          return res;
        }}
      />
    </div>
  );
}
