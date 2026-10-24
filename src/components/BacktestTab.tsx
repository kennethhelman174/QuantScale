/**
 * Chronological Walk-Forward Backtest & Evaluation Tab
 *
 * Implements strict leak-free chronological evaluation:
 * - Train vs Untouched Out-of-Sample evaluation splits
 * - Friction stress tests (slippage & fees)
 * - Calibration metrics & Brier score
 */

import React, { useState } from 'react';
import { backtester, BacktestSummary, CandidateQualificationReport } from '../quant/backtesting';
import { Play, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const BacktestTab: React.FC = () => {
  const [sessions, setSessions] = useState(120);
  const [slippage, setSlippage] = useState(0.5);
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<{
    trainSummary: BacktestSummary;
    outOfSampleSummary: BacktestSummary;
    qualification: CandidateQualificationReport;
  }>(() => backtester.runSimulation(120, 0.5));

  const handleRunBacktest = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const res = backtester.runSimulation(sessions, slippage);
      setResult(res);
      setIsSimulating(false);
    }, 200);
  };

  const oos = result.outOfSampleSummary;
  const train = result.trainSummary;

  return (
    <div className="space-y-6">
      {/* 1. Header & Controls */}
      <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800/80 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white">
            Chronological Walk-Forward Backtester & Validator
          </h2>
          <p className="mt-1 text-xs text-neutral-400 max-w-2xl leading-relaxed">
            Evaluates prediction market strategies without future lookahead. The final 30% of chronological sessions are kept completely untouched as out-of-sample data with full fee and slippage modeling.
          </p>
        </div>

        {/* Parameter adjustments */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <label className="block text-neutral-400 text-[11px] mb-1 font-medium">
              15-Min Sessions
            </label>
            <input
              type="number"
              min="30"
              max="500"
              step="30"
              value={sessions}
              onChange={(e) => setSessions(parseInt(e.target.value) || 120)}
              className="w-24 px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-white"
            />
          </div>

          <div>
            <label className="block text-neutral-400 text-[11px] mb-1 font-medium">
              Stress Slippage (cents)
            </label>
            <select
              value={slippage}
              onChange={(e) => setSlippage(parseFloat(e.target.value))}
              className="px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded font-mono text-white text-xs"
            >
              <option value="0.0">0.0¢ (Zero Slip)</option>
              <option value="0.5">0.5¢ (Nominal)</option>
              <option value="1.0">1.0¢ (Adverse)</option>
              <option value="2.0">2.0¢ (Extreme Shock)</option>
            </select>
          </div>

          <div className="self-end">
            <button
              onClick={handleRunBacktest}
              disabled={isSimulating}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded text-xs transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isSimulating ? 'Simulating...' : 'Run Simulation'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Side-by-side In-Sample vs Out-of-Sample Performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* In-Sample Training Card */}
        <div className="p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800 text-xs">
            <span className="font-semibold text-neutral-200">
              In-Sample Training (First 70% Chronological)
            </span>
            <span className="font-mono text-neutral-400">{train.totalTrades} trades</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net P&L (after fees)</span>
              <span className="font-mono tabular-nums font-bold text-emerald-400 text-sm">
                ${train.netPnlDollars.toFixed(2)}
              </span>
            </div>
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net Expectancy</span>
              <span className="font-mono tabular-nums font-bold text-neutral-200 text-sm">
                +{train.netExpectancyPerTradeCents}¢ / contract
              </span>
            </div>
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Win Rate</span>
              <span className="font-mono tabular-nums text-neutral-200">
                {train.winRatePct}%
              </span>
            </div>
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Profit Factor</span>
              <span className="font-mono tabular-nums text-neutral-200">
                {train.profitFactor.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Untouched Out-of-Sample Test Card */}
        <div className="p-4 bg-neutral-900/70 rounded-xl border border-cyan-800/80 shadow-md shadow-cyan-950/10">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800 text-xs">
            <span className="font-semibold text-cyan-400">
              Untouched Out-of-Sample (Last 30% Unseen)
            </span>
            <span className="font-mono text-neutral-400">{oos.totalTrades} trades</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net P&L (after fees)</span>
              <span className="font-mono tabular-nums font-bold text-emerald-400 text-sm">
                ${oos.netPnlDollars.toFixed(2)}
              </span>
            </div>
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Net Expectancy</span>
              <span className="font-mono tabular-nums font-bold text-cyan-400 text-sm">
                +{oos.netExpectancyPerTradeCents}¢ / contract
              </span>
            </div>
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Win Rate</span>
              <span className="font-mono tabular-nums text-neutral-200">{oos.winRatePct}%</span>
            </div>
            <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800">
              <span className="text-neutral-500 block text-[11px]">Brier Score</span>
              <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                {oos.brierScore.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Out-of-Sample Trade Ledger */}
      <div className="p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 text-xs">
          <span className="font-semibold text-white">Out-of-Sample Simulated Executions</span>
          <span className="text-neutral-400 font-mono text-[11px]">
            Stress Slippage: {slippage}¢ · Taker Fee: $0.03/ct
          </span>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 font-medium text-[11px]">
                <th className="py-2 px-2">Trade ID</th>
                <th className="py-2 px-2">Side</th>
                <th className="py-2 px-2 text-right">Entry Price</th>
                <th className="py-2 px-2 text-right">Settlement Price</th>
                <th className="py-2 px-2 text-right">Model P(Win)</th>
                <th className="py-2 px-2 text-right">Outcome</th>
                <th className="py-2 px-2 text-right">Fees Paid</th>
                <th className="py-2 px-2 text-right">Net PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono text-[11px]">
              {oos.trades.slice(0, 10).map((t) => (
                <tr key={t.tradeId} className="hover:bg-neutral-800/30">
                  <td className="py-2 px-2 text-neutral-300">{t.tradeId}</td>
                  <td className="py-2 px-2">
                    <span className={t.side === 'YES' ? 'text-emerald-400' : 'text-rose-400'}>
                      {t.side}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right text-neutral-200">{t.entryPriceCents}¢</td>
                  <td className="py-2 px-2 text-right text-neutral-200">{t.exitPriceCents}¢</td>
                  <td className="py-2 px-2 text-right text-neutral-300">
                    {(t.predictedProbability * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span
                      className={`font-semibold ${
                        t.actualSettlementOutcome === 1 ? 'text-emerald-400' : 'text-neutral-500'
                      }`}
                    >
                      {t.actualSettlementOutcome === 1 ? 'WIN' : 'LOSS'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right text-neutral-400">${t.feePaidDollars.toFixed(2)}</td>
                  <td
                    className={`py-2 px-2 text-right font-semibold ${
                      t.netPnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ${t.netPnlDollars.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
