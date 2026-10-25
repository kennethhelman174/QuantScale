/**
 * Overview Cockpit Tab
 * Real-time monitoring of BTC spot, 15m strike markets, order book depth,
 * strategy gating decisions with explicit abstention explanations, and portfolio risk status.
 */

import React, { useState } from 'react';
import {
  Kalshi15MMarket,
  KalshiOrderBook,
  Candle,
  Position,
  PortfolioRiskState,
  StrategyDecision,
} from '../types/market';
import { ChartCanvas } from './ChartCanvas';
import { OrderBookLadder } from './OrderBookLadder';
import { ArrowUpRight, ArrowDownRight, Activity, Zap, Bot, Cpu } from 'lucide-react';

interface OverviewTabProps {
  market: Kalshi15MMarket;
  book: KalshiOrderBook;
  spotPrice: number;
  candles: Candle[];
  positions: Position[];
  riskState: PortfolioRiskState;
  decisions: StrategyDecision[];
  onManualOrder: (side: 'YES' | 'NO', price: number, contracts: number) => void;
  isAutoTrading: boolean;
  onToggleAutoTrading: () => void;
  autoTradingMode: 'ACTIVE' | 'BALANCED' | 'CONSERVATIVE';
  onSetAutoTradingMode: (mode: 'ACTIVE' | 'BALANCED' | 'CONSERVATIVE') => void;
  autoTradeCount: number;
  lastAutoTradeSummary: string;
  onTriggerAutoTrade: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  market,
  book,
  spotPrice,
  candles,
  positions,
  riskState,
  decisions,
  onManualOrder,
  isAutoTrading,
  onToggleAutoTrading,
  autoTradingMode,
  onSetAutoTradingMode,
  autoTradeCount,
  lastAutoTradeSummary,
  onTriggerAutoTrade,
}) => {
  const [orderSide, setOrderSide] = useState<'YES' | 'NO'>('YES');
  const [orderPrice, setOrderPrice] = useState<number>(50);
  const [orderContracts, setOrderContracts] = useState<number>(10);

  const fairPriceYesCents = Math.round(
    decisions[0]?.theoreticalProbability ? decisions[0].theoreticalProbability * 100 : 50
  );

  const activeScalpDecision = decisions.find(
    (d) => d.strategyId === 'BTC-LEADLAG-SCALP'
  );
  const activeSkewDecision = decisions.find(
    (d) => d.strategyId === 'SETTLEMENT-SKEW-DIR'
  );

  const handleQuickBookClick = (side: 'YES' | 'NO', price: number) => {
    setOrderSide(side);
    setOrderPrice(price);
  };

  return (
    <div className="space-y-6">
      <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/50 p-3 text-sm text-amber-100">QuantScale auto-paper orders are locked pending contract and settlement verification. This overview contains legacy illustrative market values; use the Python paper status above for independently labeled live observations.</div>
      {/* 1. Top High-Density Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Equity */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
          <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
            Total Equity
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-white mt-1">
            ${riskState.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Cash: ${riskState.cashBalance.toFixed(2)}
          </div>
        </div>

        {/* Realized PnL */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
          <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
            Realized P&L
          </div>
          <div
            className={`text-lg font-bold font-mono tabular-nums mt-1 flex items-center gap-1 ${
              riskState.dailyRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {riskState.dailyRealizedPnl >= 0 ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
            ${riskState.dailyRealizedPnl.toFixed(2)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Today (after fees)</div>
        </div>

        {/* Unrealized PnL */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
          <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
            Unrealized P&L
          </div>
          {(() => {
            const openPos = positions.filter((p) => p.status === 'OPEN');
            const totalUnrealized = openPos.reduce((sum, p) => sum + p.unrealizedPnl, 0);
            return (
              <>
                <div
                  className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                    totalUnrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  ${totalUnrealized.toFixed(2)}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {openPos.length} open position{openPos.length === 1 ? '' : 's'}
                </div>
              </>
            );
          })()}
        </div>

        {/* Reserved Capital */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
          <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
            Reserved Capital
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-neutral-200 mt-1">
            ${riskState.reservedCapital.toFixed(2)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Headroom: ${riskState.usableHeadroom.toFixed(2)}
          </div>
        </div>

        {/* Directional Delta */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
          <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
            Net Delta
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-cyan-400 mt-1">
            {riskState.netDirectionalDelta > 0
              ? `+${riskState.netDirectionalDelta} YES`
              : riskState.netDirectionalDelta < 0
              ? `${riskState.netDirectionalDelta} NO`
              : '0 FLAT'}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Gross: ${riskState.grossExposure.toFixed(2)}</div>
        </div>

        {/* Drawdown */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
          <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
            Current Drawdown
          </div>
          <div
            className={`text-lg font-bold font-mono tabular-nums mt-1 ${
              riskState.currentDrawdownPct > 5 ? 'text-amber-400' : 'text-neutral-200'
            }`}
          >
            {riskState.currentDrawdownPct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Max limit: 15.0%</div>
        </div>

        {/* Daily Risk Budget */}
        <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
          <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
            Risk Budget
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-emerald-400 mt-1">
            ${riskState.riskBudgetRemaining.toFixed(2)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Loss cap: $150/day</div>
        </div>
      </div>

      {/* Autonomous Trading Engine Control & Execution Cockpit */}
      <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Autonomous Trading Bot
              </span>
            </div>
            <span className="text-neutral-700">|</span>
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  isAutoTrading ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                }`}
              />
              <span
                className={`font-mono font-semibold ${
                  isAutoTrading ? 'text-emerald-400' : 'text-neutral-400'
                }`}
              >
                {isAutoTrading ? 'UNEXPECTED AUTO STATE' : 'EXECUTION LOCKED — RESEARCH ONLY'}
              </span>
            </div>
          </div>

          {/* Bot Profile Selector & Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-400 font-medium mr-1">Profile:</span>
            <div className="flex rounded-lg overflow-hidden border border-neutral-800 p-0.5 bg-neutral-950">
              <button
                type="button"
                onClick={() => onSetAutoTradingMode('ACTIVE')}
                className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-colors ${
                  autoTradingMode === 'ACTIVE'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Active Scalper: Higher frequency, evaluates micro-lag >= 1.0¢ edge"
              >
                Active Scalper
              </button>
              <button
                type="button"
                onClick={() => onSetAutoTradingMode('BALANCED')}
                className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-colors ${
                  autoTradingMode === 'BALANCED'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/60'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Balanced: Evaluates momentum z >= 1.35 and >= 1.5¢ edge"
              >
                Balanced
              </button>
              <button
                type="button"
                onClick={() => onSetAutoTradingMode('CONSERVATIVE')}
                className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-colors ${
                  autoTradingMode === 'CONSERVATIVE'
                    ? 'bg-purple-950/80 text-purple-300 border border-purple-700/60'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Conservative: High-conviction setups only (edge >= 2.5¢)"
              >
                Conservative
              </button>
            </div>

            {/* Direct Trigger Action for User Testing */}
            <button
              disabled aria-disabled="true" onClick={onTriggerAutoTrade}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 rounded transition-colors whitespace-nowrap"
              title="Immediately evaluate current book & execute an automated strategy ticket"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>Auto Trade Unavailable</span>
            </button>

            {/* Toggle Switch */}
            <button
              disabled aria-disabled="true" onClick={onToggleAutoTrading}
              className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap ${
                isAutoTrading
                  ? 'text-neutral-300 bg-neutral-800 border-neutral-700 hover:bg-neutral-700'
                  : 'text-emerald-300 bg-emerald-950/80 border-emerald-700 hover:bg-emerald-900/80'
              }`}
            >
              {'Auto Trading Locked'}
            </button>
          </div>
        </div>

        {/* Live Execution Telemetry Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-neutral-800/80 text-xs">
          <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-950/70 rounded-lg border border-neutral-800/60">
            <span className="text-neutral-400">Automated Trades Today:</span>
            <span className="font-mono text-white font-bold tabular-nums">
              {autoTradeCount} trades
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-950/70 rounded-lg border border-neutral-800/60">
            <span className="text-neutral-400">Execution Cadence:</span>
            <span className="font-mono text-cyan-400 font-semibold" title="Strictly evaluated on quantitative signal thresholds and mathematical edge without artificial time throttling">
              Signal-Driven (Zero Time Throttle)
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-950/70 rounded-lg border border-neutral-800/60 truncate">
            <span className="text-neutral-400 shrink-0 mr-2">Latest Action:</span>
            <span className="font-mono text-neutral-200 truncate" title={lastAutoTradeSummary}>
              {lastAutoTradeSummary}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Active 15-Minute Contract Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-neutral-900/40 rounded-xl border border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-white tracking-wide">{market.ticker}</span>
          <span className="text-neutral-600">·</span>
          <span className="text-xs text-neutral-300">{market.title}</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span>{market.contractType === 'INDEX_DIRECTION_15M' ? 'Contract:' : 'Strike:'}</span>
            <span className="font-mono text-amber-400 font-semibold">
              {market.contractType === 'INDEX_DIRECTION_15M' ? 'CF BRTI up/down' : `${market.strikePrice.toLocaleString()}`}
            </span>
          </div>
          <span className="text-neutral-700">·</span>
          {market.contractType !== 'INDEX_DIRECTION_15M' && <div className="flex items-center gap-1.5 text-neutral-400">
            <span>Distance to Strike:</span>
            <span
              className={`font-mono font-semibold ${
                spotPrice >= market.strikePrice ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {spotPrice >= market.strikePrice ? '+' : ''}
              {(spotPrice - market.strikePrice).toFixed(1)} USD
            </span>
          </div>}
          <span className="text-neutral-700">·</span>
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span>Time Left:</span>
            <span className="font-mono text-cyan-400 font-bold">
              {Math.floor(market.settlementTimerSec / 60)}m {market.settlementTimerSec % 60}s
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Split View: Chart (2/3) + Order Book Depth Ladder (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCanvas
            candles={candles}
            spotPrice={spotPrice}
            strikePrice={market.strikePrice}
            positions={positions}
            timeRemainingSec={market.settlementTimerSec}
            fairPriceYesCents={fairPriceYesCents}
          />
        </div>
        <div>
          <OrderBookLadder book={book} onQuickOrder={handleQuickBookClick} />
        </div>
      </div>

      {/* 4. Strategy Gate & Decision Inspector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scalp Strategy Card */}
        <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800 text-xs">
              <span className="font-semibold text-neutral-200">
                Strategy 1: BTC Lead-Lag Scalp
              </span>
              <span
                className={`font-mono font-semibold ${
                  activeScalpDecision?.action.startsWith('ENTER')
                    ? 'text-emerald-400'
                    : activeScalpDecision?.action === 'HOLD'
                    ? 'text-cyan-400'
                    : 'text-neutral-400'
                }`}
              >
                [{activeScalpDecision?.action || 'ABSTAIN'}]
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between text-neutral-400">
                <span>Active Gate:</span>
                <span className="font-mono text-neutral-300">
                  {activeScalpDecision?.blockedGate || 'GATE_CLEARED_READY'}
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-400">
                <span>Theoretical vs Market:</span>
                <span className="font-mono tabular-nums text-neutral-200">
                  {Math.round((activeScalpDecision?.theoreticalProbability || 0.5) * 100)}¢ vs{' '}
                  {Math.round((activeScalpDecision?.marketProbability || 0.5) * 100)}¢
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-400">
                <span>Calculated Net EV:</span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    (activeScalpDecision?.expectedNetValue || 0) > 0
                      ? 'text-emerald-400'
                      : 'text-neutral-400'
                  }`}
                >
                  ${(activeScalpDecision?.expectedNetValue || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-3 p-2.5 bg-neutral-950/70 rounded border border-neutral-800 text-xs text-neutral-300 leading-relaxed font-sans">
              {activeScalpDecision?.rationale || 'Evaluating incoming ticks...'}
            </div>
          </div>
        </div>

        {/* Directional Settlement Skew Card */}
        <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800 text-xs">
              <span className="font-semibold text-neutral-200">
                Strategy 2: Settlement Skew & Moneyness
              </span>
              <span
                className={`font-mono font-semibold ${
                  activeSkewDecision?.action.startsWith('ENTER')
                    ? 'text-emerald-400'
                    : activeSkewDecision?.action === 'HOLD'
                    ? 'text-cyan-400'
                    : 'text-neutral-400'
                }`}
              >
                [{activeSkewDecision?.action || 'ABSTAIN'}]
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between text-neutral-400">
                <span>Active Gate:</span>
                <span className="font-mono text-neutral-300">
                  {activeSkewDecision?.blockedGate || 'GATE_CLEARED_READY'}
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-400">
                <span>Model P(Win):</span>
                <span className="font-mono tabular-nums text-neutral-200">
                  {(
                    (activeSkewDecision?.theoreticalProbability || 0.5) * 100
                  ).toFixed(1)}
                  % (d2 model)
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-400">
                <span>Alpha Edge:</span>
                <span className="font-mono tabular-nums text-neutral-200">
                  {activeSkewDecision?.edgeCents
                    ? `${activeSkewDecision.edgeCents > 0 ? '+' : ''}${activeSkewDecision.edgeCents}¢`
                    : '0.0¢'}
                </span>
              </div>
            </div>

            <div className="mt-3 p-2.5 bg-neutral-950/70 rounded border border-neutral-800 text-xs text-neutral-300 leading-relaxed font-sans">
              {activeSkewDecision?.rationale || 'Evaluating black-scholes fair curve...'}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Paper Order Entry Console (10 contracts default) */}
      <div className="p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800 text-xs">
          <span className="font-semibold text-neutral-200">
            Manual Research Order Ticket (Default: 10 contracts)
          </span>
          <span className="text-neutral-500 font-mono">
            Full simulator with queue delay & slippage
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Side Selector */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1 font-medium">Side</label>
            <div className="flex rounded-lg overflow-hidden border border-neutral-800">
              <button
                type="button"
                onClick={() => setOrderSide('YES')}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                  orderSide === 'YES'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white'
                }`}
              >
                Buy YES ↑
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('NO')}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                  orderSide === 'NO'
                    ? 'bg-rose-600 text-white'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white'
                }`}
              >
                Buy NO ↓
              </button>
            </div>
          </div>

          {/* Limit Price */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1 font-medium">
              Limit Price (cents: 1-99)
            </label>
            <input
              type="number"
              min="1"
              max="99"
              value={orderPrice}
              onChange={(e) => setOrderPrice(Math.max(1, Math.min(99, parseInt(e.target.value) || 50)))}
              className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs text-neutral-400 mb-1 font-medium">
              Contracts (Default: 10)
            </label>
            <input
              type="number"
              min="1"
              max="25"
              value={orderContracts}
              onChange={(e) => setOrderContracts(Math.max(1, Math.min(25, parseInt(e.target.value) || 10)))}
              className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Submit Button */}
          <div>
            <button
              onClick={() => onManualOrder(orderSide, orderPrice, orderContracts)}
              className="w-full py-2 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
            >
              Submit Simulator Order ({orderContracts}ct @ {orderPrice}¢)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
