/**
 * Chronological Walk-Forward Backtest & Evaluation Tab
 *
 * Implements strict leak-free chronological evaluation:
 * - Historical data range selector & strategy logic switcher
 * - Detailed performance report comparing active strategy against passive benchmark
 * - Recharts equity curve comparison & out-of-sample stress testing
 */

import React, { useState } from 'react';
import {
  backtester,
  BacktestSummary,
  CandidateQualificationReport,
  BacktestStrategyId,
} from '../quant/backtesting';
import { Play, ShieldCheck, CheckCircle2, Sliders, TrendingUp, Award, BarChart2 } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

export const BacktestTab: React.FC = () => {
  const [sessions, setSessions] = useState(120);
  const [slippage, setSlippage] = useState(0.5);
  const [strategyId, setStrategyId] = useState<BacktestStrategyId>('SETTLEMENT-SKEW-DIR');
  const [isSimulating, setIsSimulating] = useState(false);

  const [result, setResult] = useState<{
    trainSummary: BacktestSummary;
    outOfSampleSummary: BacktestSummary;
    benchmarkSummary: BacktestSummary;
    qualification: CandidateQualificationReport;
  }>(() => backtester.runSimulation(120, 0.5, 'SETTLEMENT-SKEW-DIR'));

  const handleRunBacktest = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const res = backtester.runSimulation(sessions, slippage, strategyId);
      setResult(res);
      setIsSimulating(false);
    }, 250);
  };

  const oos = result.outOfSampleSummary;
  const train = result.trainSummary;
  const bench = result.benchmarkSummary;
  const qual = result.qualification;

  // Merge equity curves for Recharts comparison
  const maxLen = Math.max(oos.equityCurve.length, bench.equityCurve.length);
  const mergedEquityCurve = Array.from({ length: maxLen }, (_, i) => {
    const stratPoint = oos.equityCurve[i];
    const benchPoint = bench.equityCurve[i];
    return {
      step: i + 1,
      Strategy: stratPoint ? stratPoint.cumulativeNetPnl : oos.equityCurve[oos.equityCurve.length - 1]?.cumulativeNetPnl || 0,
      'Passive Benchmark': benchPoint ? benchPoint.cumulativeNetPnl : bench.equityCurve[bench.equityCurve.length - 1]?.cumulativeNetPnl || 0,
    };
  });

  return (
    <div className="space-y-6 text-xs text-neutral-300">
      {/* 1. Header & Configuration Controls */}
      <div className="p-5 bg-neutral-900/80 rounded-2xl border border-neutral-800 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-cyan-400" />
              <span>Systematic Walk-Forward Backtesting Engine</span>
            </h2>
            <p className="mt-1 text-xs text-neutral-400 max-w-3xl leading-relaxed">
              Run leak-free chronological simulations over historical 15-minute prediction market sessions. Test specific quantitative strategy logic against a passive buy-and-hold benchmark with full fee and slippage friction modeling.
            </p>
          </div>

          <button
            onClick={handleRunBacktest}
            disabled={isSimulating}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-cyan-950/40"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isSimulating ? 'Executing Simulation...' : 'Run Backtest Simulation'}</span>
          </button>
        </div>

        {/* Configuration Parameter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {/* Strategy Logic Selector */}
          <div>
            <label className="block text-neutral-400 text-[11px] mb-1.5 font-semibold uppercase tracking-wider">
              Strategy Logic
            </label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value as BacktestStrategyId)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="SETTLEMENT-SKEW-DIR">Settlement Skew Directional</option>
              <option value="BTC-LEADLAG-SCALP">Lead-Lag Micro Scalp</option>
              <option value="VOL-RANGE-REVERSAL">Volatility Range Reversal</option>
            </select>
          </div>

          {/* Historical Data Range */}
          <div>
            <label className="block text-neutral-400 text-[11px] mb-1.5 font-semibold uppercase tracking-wider">
              Historical Session Range
            </label>
            <select
              value={sessions}
              onChange={(e) => setSessions(parseInt(e.target.value) || 120)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="50">50 Sessions (~12.5 Hours)</option>
              <option value="120">120 Sessions (~30 Hours)</option>
              <option value="250">250 Sessions (~2.5 Days)</option>
              <option value="500">500 Sessions (~5.2 Days)</option>
            </select>
          </div>

          {/* Stress Slippage */}
          <div>
            <label className="block text-neutral-400 text-[11px] mb-1.5 font-semibold uppercase tracking-wider">
              Execution Stress Slippage
            </label>
            <select
              value={slippage}
              onChange={(e) => setSlippage(parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="0.0">0.0¢ (Zero Friction)</option>
              <option value="0.5">0.5¢ (Nominal Taker)</option>
              <option value="1.0">1.0¢ (Adverse Impact)</option>
              <option value="2.0">2.0¢ (Severe Vol Shock)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Side-by-Side Performance Comparison Report (Strategy vs Benchmark) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Strategy Card (Out-of-Sample) */}
        <div className="p-5 bg-neutral-900/80 rounded-2xl border border-cyan-800/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-bold text-white text-sm">{oos.strategyName}</span>
            </div>
            <span className="font-mono text-xs text-neutral-400">{oos.totalTrades} Trades Executed</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net P&L (after $0.03/ct fees)</span>
              <span className="font-mono tabular-nums font-bold text-emerald-400 text-base">
                ${oos.netPnlDollars.toFixed(2)}
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net Expectancy</span>
              <span className="font-mono tabular-nums font-bold text-cyan-300 text-base">
                +{oos.netExpectancyPerTradeCents}¢ / ct
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Win Rate</span>
              <span className="font-mono tabular-nums text-white font-semibold text-sm">
                {oos.winRatePct}%
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Profit Factor</span>
              <span className="font-mono tabular-nums text-white font-semibold text-sm">
                {oos.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Max Drawdown</span>
              <span className="font-mono tabular-nums text-rose-400 font-semibold text-sm">
                -{oos.maxDrawdownPct}%
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Brier Score (Calibration)</span>
              <span className="font-mono tabular-nums text-emerald-400 font-bold text-sm">
                {oos.brierScore.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Passive Benchmark Card */}
        <div className="p-5 bg-neutral-900/60 rounded-2xl border border-neutral-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-500" />
              <span className="font-bold text-neutral-300 text-sm">Passive Buy & Hold Benchmark</span>
            </div>
            <span className="font-mono text-xs text-neutral-400">{bench.totalTrades} Trades Executed</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net P&L (after fees)</span>
              <span className={`font-mono tabular-nums font-bold text-base ${bench.netPnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${bench.netPnlDollars.toFixed(2)}
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net Expectancy</span>
              <span className="font-mono tabular-nums font-bold text-neutral-300 text-base">
                {bench.netExpectancyPerTradeCents >= 0 ? '+' : ''}{bench.netExpectancyPerTradeCents}¢ / ct
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Win Rate</span>
              <span className="font-mono tabular-nums text-neutral-300 font-semibold text-sm">
                {bench.winRatePct}%
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Profit Factor</span>
              <span className="font-mono tabular-nums text-neutral-300 font-semibold text-sm">
                {bench.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Max Drawdown</span>
              <span className="font-mono tabular-nums text-rose-400/80 font-semibold text-sm">
                -{bench.maxDrawdownPct}%
              </span>
            </div>
            <div className="p-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Alpha vs Benchmark</span>
              <span className="font-mono tabular-nums text-cyan-400 font-bold text-sm">
                +{(oos.netPnlDollars - bench.netPnlDollars).toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Equity Curve Comparison Recharts Chart */}
      <div className="p-5 bg-neutral-900/80 rounded-2xl border border-neutral-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-white text-xs uppercase tracking-wider">
              Cumulative Equity Curve ($ Net P&L): Strategy vs. Passive Benchmark
            </span>
          </div>
          <span className="text-[11px] font-mono text-neutral-400">Chronological Progression</span>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mergedEquityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#26262a" />
              <XAxis dataKey="step" stroke="#737373" fontSize={11} tickLine={false} />
              <YAxis stroke="#737373" fontSize={11} tickLine={false} unit="$" />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0c', borderColor: '#26262a', borderRadius: '0.75rem', color: '#fff', fontSize: '11px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="Strategy" stroke="#06b6d4" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Passive Benchmark" stroke="#737373" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Candidate Qualification Gates */}
      <div className="p-5 bg-neutral-900/80 rounded-2xl border border-neutral-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-white text-xs uppercase tracking-wider">
              Candidate Qualification Gatekeeper Report ({qual.candidateVersion})
            </span>
          </div>
          <span
            className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg border ${
              qual.isQualifiedForDeployment
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                : 'bg-rose-950/80 border-rose-600 text-rose-300'
            }`}
          >
            {qual.isQualifiedForDeployment ? 'PASSED ALL DEPLOYMENT GATES' : 'GATE FAILED - REQUIRES TUNING'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {qual.gateChecks.map((gate, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2 ${
                gate.passed
                  ? 'bg-neutral-950/90 border-neutral-800'
                  : 'bg-rose-950/20 border-rose-900/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-white">{gate.rule}</span>
                {gate.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <span className="text-rose-400 text-[10px] font-mono font-bold">FAILED</span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 font-mono leading-relaxed">
                {gate.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
