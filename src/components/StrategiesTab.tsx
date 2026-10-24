/**
 * Quantitative Strategies & Decision Engine Settings
 *
 * Provides:
 * 1. Strategy Decision Logic Settings: Interactive toggle between 15-minute rolling realized volatility,
 *    Parkinson extreme-value high-low volatility, and Garman-Klass minimum-variance OHLC volatility.
 * 2. Real-time Volatility Estimator Comparison Strip with live metrics and mathematical descriptions.
 * 3. Strategy Hypotheses Catalog detailing economic rationale, pre-conditions, execution gates, fee drag,
 *    and invalidation conditions.
 */

import React from 'react';
import { STRATEGY_CATALOG } from '../quant/strategies/strategyDefinitions';
import { DecisionVolMetric } from '../quant/strategies/evaluator';
import { calculateRealizedVol, calculateParkinsonVol, calculateGarmanKlassVol } from '../quant/binaryPricing';
import { Candle } from '../types/market';
import { Cpu, Sliders, Activity, Zap, CheckCircle2, Info, ArrowRight } from 'lucide-react';

interface StrategiesTabProps {
  decisionVolMetric?: DecisionVolMetric;
  onSetDecisionVolMetric?: (metric: DecisionVolMetric) => void;
  spotHistory?: number[];
  candles?: Candle[];
  currentSpotPrice?: number;
  autoTradingMode?: 'ACTIVE' | 'BALANCED' | 'CONSERVATIVE';
  onSetAutoTradingMode?: (mode: 'ACTIVE' | 'BALANCED' | 'CONSERVATIVE') => void;
}

export const StrategiesTab: React.FC<StrategiesTabProps> = ({
  decisionVolMetric = 'REALIZED_15M',
  onSetDecisionVolMetric,
  spotHistory = [],
  candles = [],
  currentSpotPrice = 68450,
  autoTradingMode = 'ACTIVE',
  onSetAutoTradingMode,
}) => {
  const strategies = Object.values(STRATEGY_CATALOG);

  // Compute live readings for each volatility metric
  const recent30Spot = spotHistory.slice(-30);
  const realizedVol15m = Math.round(calculateRealizedVol(recent30Spot) * 1000) / 10;

  const recent30Candles = candles.slice(-30);
  const parkinsonVol = Math.round(calculateParkinsonVol(recent30Candles) * 1000) / 10;
  const garmanKlassVol = Math.round(calculateGarmanKlassVol(recent30Candles) * 1000) / 10;

  const currentActiveVol =
    decisionVolMetric === 'PARKINSON_HL'
      ? parkinsonVol
      : decisionVolMetric === 'GARMAN_KLASS_OHLC'
      ? garmanKlassVol
      : realizedVol15m;

  return (
    <div className="space-y-6">
      {/* 1. Strategy Settings & Decision Logic Volatility Metric Selector */}
      <div className="p-5 bg-neutral-900/80 rounded-2xl border border-neutral-800 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Strategy Decision Logic & Parameter Configuration</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded">
                  Active
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Configure the volatility estimator model governing Black-Scholes fair pricing and momentum z-score hurdles.
              </p>
            </div>
          </div>

          {/* Quick Stats: Current Volatility Driving Decision Logic */}
          <div className="flex items-center gap-3 px-3.5 py-2 bg-neutral-950/80 rounded-xl border border-neutral-800">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <div className="text-xs">
              <span className="text-neutral-400">Decision Engine Vol:</span>{' '}
              <span className="font-mono font-bold text-cyan-300 text-sm">{currentActiveVol.toFixed(1)}%</span>{' '}
              <span className="text-neutral-500 font-mono text-[10px]">
                ({decisionVolMetric === 'PARKINSON_HL'
                  ? 'Parkinson'
                  : decisionVolMetric === 'GARMAN_KLASS_OHLC'
                  ? 'Garman-Klass'
                  : 'Realized 15m'})
              </span>
            </div>
          </div>
        </div>

        {/* Volatility Metric Toggle Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>Decision Logic Volatility Metric</span>
              <span className="text-neutral-500 text-[11px] font-normal lowercase">(governs options pricer & micro-scalp z-scores)</span>
            </label>
            <span className="text-[11px] font-mono text-neutral-400">
              Live BTC Spot: <span className="text-white font-bold">${currentSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. 15-Minute Rolling Realized Volatility */}
            <button
              type="button"
              onClick={() => onSetDecisionVolMetric?.('REALIZED_15M')}
              className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                decisionVolMetric === 'REALIZED_15M'
                  ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-950/20'
                  : 'bg-neutral-950/70 border-neutral-800 hover:border-neutral-700 text-neutral-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-1.5">
                    <span>15m Rolling Realized Vol</span>
                  </span>
                  {decisionVolMetric === 'REALIZED_15M' && (
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-700/60">
                      <CheckCircle2 className="w-3 h-3" /> ACTIVE
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-neutral-400 mt-1">
                  Formula: <span className="text-cyan-300">σ_CC</span> (Close-to-Close)
                </div>
                <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
                  Evaluates annualized standard deviation of 1-minute logarithmic returns over a 15-minute rolling window.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                <span className="text-neutral-500">Live Reading:</span>
                <span className="font-mono font-bold text-cyan-300 text-sm">{realizedVol15m.toFixed(1)}%</span>
              </div>
            </button>

            {/* 2. Parkinson High-Low Volatility */}
            <button
              type="button"
              onClick={() => onSetDecisionVolMetric?.('PARKINSON_HL')}
              className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                decisionVolMetric === 'PARKINSON_HL'
                  ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-950/20'
                  : 'bg-neutral-950/70 border-neutral-800 hover:border-neutral-700 text-neutral-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-1.5">
                    <span>Parkinson High-Low Vol</span>
                  </span>
                  {decisionVolMetric === 'PARKINSON_HL' && (
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-700/60">
                      <CheckCircle2 className="w-3 h-3" /> ACTIVE
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-neutral-400 mt-1">
                  Formula: <span className="text-purple-300">σ_P</span> (~5x Variance Efficiency)
                </div>
                <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
                  Extreme-value estimator utilizing candle high/low extrema. Responds instantaneously to intraday range expansions.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                <span className="text-neutral-500">Live Reading:</span>
                <span className="font-mono font-bold text-purple-300 text-sm">{parkinsonVol.toFixed(1)}%</span>
              </div>
            </button>

            {/* 3. Garman-Klass OHLC Volatility */}
            <button
              type="button"
              onClick={() => onSetDecisionVolMetric?.('GARMAN_KLASS_OHLC')}
              className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                decisionVolMetric === 'GARMAN_KLASS_OHLC'
                  ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-950/20'
                  : 'bg-neutral-950/70 border-neutral-800 hover:border-neutral-700 text-neutral-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-1.5">
                    <span>Garman-Klass OHLC Vol</span>
                  </span>
                  {decisionVolMetric === 'GARMAN_KLASS_OHLC' && (
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-700/60">
                      <CheckCircle2 className="w-3 h-3" /> ACTIVE
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-neutral-400 mt-1">
                  Formula: <span className="text-emerald-300">σ_GK</span> (~7.4x Variance Efficiency)
                </div>
                <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
                  Minimum-variance continuous Brownian motion estimator incorporating Open, High, Low, and Close bar jumps.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                <span className="text-neutral-500">Live Reading:</span>
                <span className="font-mono font-bold text-emerald-300 text-sm">{garmanKlassVol.toFixed(1)}%</span>
              </div>
            </button>
          </div>
        </div>

        {/* Mathematical Application & Profile Ribbon */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4 border-t border-neutral-800/80 text-xs">
          {/* Decision Impact Box */}
          <div className="lg:col-span-2 p-3.5 bg-neutral-950/60 rounded-xl border border-neutral-800/80 space-y-2">
            <div className="flex items-center gap-1.5 text-neutral-300 font-semibold text-[11px] uppercase tracking-wider">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>How this selection impacts decision logic</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-neutral-400">
              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800/60">
                <span className="text-neutral-200 font-semibold block mb-0.5">Black-Scholes Binary Pricer</span>
                <span className="font-mono text-cyan-300 text-[10px]">d2 = ln(S/K)/(σ√T) - 0.5σ√T</span>
                <p className="mt-1 text-neutral-400">
                  Higher active σ compresses out-of-the-money contract probabilities towards 50¢, reducing directional overconfidence.
                </p>
              </div>
              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800/60">
                <span className="text-neutral-200 font-semibold block mb-0.5">Momentum Z-Score Hurdle</span>
                <span className="font-mono text-cyan-300 text-[10px]">z = R_30s / (σ * √(Δt))</span>
                <p className="mt-1 text-neutral-400">
                  Normalizes spot price velocity by current volatility regime to filter noise whipsaws during high-turbulence periods.
                </p>
              </div>
            </div>
          </div>

          {/* Execution Sensitivity Profile Control */}
          <div className="p-3.5 bg-neutral-950/60 rounded-xl border border-neutral-800/80 flex flex-col justify-between">
            <div>
              <div className="text-neutral-300 font-semibold text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Execution Sensitivity Profile</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed mb-3">
                Sets the alpha threshold and z-score trigger sensitivity for the autonomous bot.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800">
              {(['ACTIVE', 'BALANCED', 'CONSERVATIVE'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSetAutoTradingMode?.(mode)}
                  className={`py-1.5 px-2 text-[11px] font-mono font-semibold rounded transition-colors text-center ${
                    autoTradingMode === mode
                      ? mode === 'ACTIVE'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        : mode === 'BALANCED'
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                        : 'bg-purple-950 text-purple-300 border border-purple-700'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {mode === 'ACTIVE' ? 'Active' : mode === 'BALANCED' ? 'Balanced' : 'Conserv.'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Hypotheses & Market Inefficiencies Catalog Header */}
      <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
        <h2 className="text-base font-bold text-white">
          Quantitative Hypotheses & Market Inefficiencies
        </h2>
        <p className="mt-1 text-xs text-neutral-400 max-w-4xl leading-relaxed">
          In prediction markets, trading strategies cannot rely on vague indicators or ungrounded machine learning. Every deployed strategy begins with a documented structural hypothesis explaining why an opportunity exists, the exact frictions required to capture it, and explicit conditions that invalidate the thesis.
        </p>
      </div>

      {/* 3. Strategy Cards */}
      <div className="space-y-6">
        {strategies.map((strat) => (
          <div
            key={strat.strategyId}
            className="p-5 bg-neutral-900/50 rounded-xl border border-neutral-800 space-y-4"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <span className="font-mono text-cyan-400 font-bold text-sm">
                  {strat.strategyId}
                </span>
                <span className="text-neutral-600">·</span>
                <span className="text-sm font-semibold text-white">{strat.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 font-mono">Horizon: {strat.expectedDuration}</span>
                <span className="text-neutral-700">·</span>
                <span
                  className={`text-xs font-mono font-semibold ${
                    strat.isActive ? 'text-emerald-400' : 'text-neutral-500'
                  }`}
                >
                  {strat.isActive ? '[ACTIVE RESEARCH]' : '[BENCHMARK ONLY]'}
                </span>
              </div>
            </div>

            {/* Scientific Rationale */}
            <div>
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                1. Why the Opportunity Exists (Economic & Microstructure Rationale)
              </div>
              <p className="mt-1 text-xs text-neutral-300 leading-relaxed bg-neutral-950/60 p-3 rounded border border-neutral-800/60">
                {strat.rationale}
              </p>
            </div>

            {/* Grid of Specifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Information Required */}
              <div className="p-3 bg-neutral-950/40 rounded border border-neutral-800/60">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  2. Information Available Before Decision
                </div>
                <ul className="space-y-1 text-neutral-300 list-disc list-inside">
                  {strat.informationRequired.map((info, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {info}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Execution Constraints */}
              <div className="p-3 bg-neutral-950/40 rounded border border-neutral-800/60">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  3. Required Execution Conditions (Gates)
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Max Spread:</span>
                    <span className="text-neutral-200">{strat.executionConditions.maxSpreadCents}¢</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Min Top Depth:</span>
                    <span className="text-neutral-200">{strat.executionConditions.minTopDepthContracts} contracts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Time-to-Expiry Window:</span>
                    <span className="text-neutral-200">
                      {strat.executionConditions.minTimeToExpirySec}s – {strat.executionConditions.maxTimeToExpirySec}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Min Alpha Edge (after fees):</span>
                    <span className="text-emerald-400">+{strat.executionConditions.minAlphaEdgeCents}¢</span>
                  </div>
                </div>
              </div>

              {/* Costs & Downside */}
              <div className="p-3 bg-neutral-950/40 rounded border border-neutral-800/60">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  4. Expected Costs & Downside Risks
                </div>
                <p className="text-neutral-300 leading-relaxed text-[11px]">
                  {strat.expectedCostsAndDownside}
                </p>
              </div>

              {/* Evidence Needed */}
              <div className="p-3 bg-neutral-950/40 rounded border border-neutral-800/60">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  5. Qualification Evidence Required for Deployment
                </div>
                <p className="text-neutral-300 leading-relaxed text-[11px]">
                  {strat.evidenceNeeded}
                </p>
              </div>
            </div>

            {/* Invalidation Conditions */}
            <div className="p-3 bg-rose-950/20 rounded border border-rose-900/40">
              <div className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider mb-1">
                6. Thesis Invalidation Triggers (Immediate Exit / Halt)
              </div>
              <ul className="space-y-1 text-neutral-300 text-[11px] list-disc list-inside">
                {strat.invalidationConditions.map((inv, idx) => (
                  <li key={idx} className="leading-relaxed text-rose-200/90">
                    {inv}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
