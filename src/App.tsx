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
import { Footer } from './components/Footer';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSafeguardsOpen, setIsSafeguardsOpen] = useState(false);
  const [isKiosk, setIsKiosk] = useState(false);

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
    <div className={`min-h-screen bg-[#0a0a0c] text-neutral-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black ${isKiosk ? 'p-2' : ''}`}>
      {/* Top Bar Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mode={tradingEngine.mode}
        isRunning={tradingEngine.getIsRunning()}
        onToggleEngine={handleToggleEngine}
        isAutoTrading={tradingEngine.isAutoTrading}
        onToggleAutoTrading={() => tradingEngine.toggleAutoTrading()}
        onOpenSafeguards={() => setIsSafeguardsOpen(true)}
        isKiosk={isKiosk}
        onToggleKiosk={() => setIsKiosk(!isKiosk)}
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

        {activeTab === 'strategies' && <StrategiesTab />}

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
      </main>

      {/* Mandatory Footer with Version Display */}
      <Footer />

      {/* Emergency Safeguards Modal */}
      <SafeguardsModal
        isOpen={isSafeguardsOpen}
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
    </div>
  );
}
