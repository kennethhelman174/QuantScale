/**
 * Independent Research & Experimental Portfolios
 *
 * Keeps distinct:
 * - Primary Trading Portfolio
 * - Independent Experimental Paper Portfolios
 * Generates continuous learning opportunities without risking primary wallet capital.
 */

import React from 'react';
import { PortfolioRiskState } from '../types/market';
import { Layers, TrendingUp, TrendingDown, Shield } from 'lucide-react';

interface ExperimentsTabProps {
  portfolios: PortfolioRiskState[];
}

export const ExperimentsTab: React.FC<ExperimentsTabProps> = ({ portfolios }) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Independent Experimental Research Portfolios
        </h2>
        <p className="mt-1 text-xs text-neutral-400 max-w-4xl leading-relaxed">
          The platform generates learning opportunities through segregated shadow portfolios rather than forcing the primary trading wallet to trade continuously. Each experimental portfolio operates with its own simulated capital, distinct hypothesis, and strict risk bounds.
        </p>
      </div>

      {/* Portfolio Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {portfolios.map((port) => (
          <div
            key={port.portfolioId}
            className={`p-5 rounded-xl border flex flex-col justify-between ${
              port.isPrimary
                ? 'bg-neutral-900/80 border-cyan-800/80 shadow-lg shadow-cyan-950/20'
                : 'bg-neutral-900/50 border-neutral-800'
            }`}
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{port.name}</span>
                    {port.isPrimary && (
                      <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                        PRIMARY WALLET
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500">
                    ID: {port.portfolioId}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-400">Total Equity</div>
                  <div className="text-base font-bold font-mono tabular-nums text-white">
                    ${port.equity.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3 my-4 text-xs">
                <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800/60">
                  <span className="text-neutral-500 block text-[11px]">Realized P&L</span>
                  <span
                    className={`font-mono tabular-nums font-bold text-sm ${
                      port.dailyRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {port.dailyRealizedPnl >= 0 ? '+' : ''}${port.dailyRealizedPnl.toFixed(2)}
                  </span>
                </div>

                <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800/60">
                  <span className="text-neutral-500 block text-[11px]">Usable Headroom</span>
                  <span className="font-mono tabular-nums font-bold text-sm text-neutral-200">
                    ${port.usableHeadroom.toFixed(2)}
                  </span>
                </div>

                <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800/60">
                  <span className="text-neutral-500 block text-[11px]">Directional Delta</span>
                  <span className="font-mono tabular-nums text-sm text-cyan-400">
                    {port.netDirectionalDelta !== 0
                      ? `${port.netDirectionalDelta > 0 ? '+' : ''}${port.netDirectionalDelta} contracts`
                      : '0 (Flat)'}
                  </span>
                </div>

                <div className="p-2.5 bg-neutral-950/60 rounded border border-neutral-800/60">
                  <span className="text-neutral-500 block text-[11px]">Drawdown</span>
                  <span className="font-mono tabular-nums text-sm text-neutral-300">
                    {port.currentDrawdownPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Status Info */}
              <div className="p-3 bg-neutral-950/40 rounded border border-neutral-800/50 text-[11px] text-neutral-400 space-y-1">
                <div className="flex justify-between">
                  <span>Open Positions:</span>
                  <span className="font-mono text-neutral-200">{port.openPositionsCount} active</span>
                </div>
                <div className="flex justify-between">
                  <span>Reserved Margin:</span>
                  <span className="font-mono text-neutral-200">${port.reservedCapital.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Remaining Daily Risk Budget:</span>
                  <span className="font-mono text-emerald-400">${port.riskBudgetRemaining.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Automated shadow simulator</span>
              <span className="font-mono">Isolated Risk State</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
