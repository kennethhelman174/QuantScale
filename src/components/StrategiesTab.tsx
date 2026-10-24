/**
 * Quantitative Strategies & Hypotheses Catalog
 * Documents the scientific rationale, pre-requisite information, execution conditions,
 * fee drag, invalidation triggers, and evidence criteria for each strategy.
 */

import React from 'react';
import { STRATEGY_CATALOG } from '../quant/strategies/strategyDefinitions';

export const StrategiesTab: React.FC = () => {
  const strategies = Object.values(STRATEGY_CATALOG);

  return (
    <div className="space-y-6">
      <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
        <h2 className="text-base font-bold text-white">
          Quantitative Hypotheses & Market Inefficiencies
        </h2>
        <p className="mt-1 text-xs text-neutral-400 max-w-4xl leading-relaxed">
          In prediction markets, trading strategies cannot rely on vague indicators or ungrounded machine learning. Every deployed strategy begins with a documented structural hypothesis explaining why an opportunity exists, the exact frictions required to capture it, and explicit conditions that invalidate the thesis.
        </p>
      </div>

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
