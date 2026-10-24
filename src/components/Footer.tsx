/**
 * Institutional Footer
 * Features the mandatory application version display across all views and fullscreen modes,
 * along with quantitative risk disclaimers and source code links.
 */

import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-12 border-t border-neutral-900 bg-neutral-950/80 px-6 py-6 text-xs text-neutral-500">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Product & Version */}
        <div className="flex flex-wrap items-center gap-2 text-center md:text-left">
          <span className="font-semibold text-neutral-400">
            K-Alpha Quantitative Trading Platform
          </span>
          <span aria-hidden="true" className="text-neutral-700">·</span>
          <span className="font-mono text-cyan-400 font-medium">
            Version v1.2.4-prod (Commit d7a42b9)
          </span>
          <span aria-hidden="true" className="text-neutral-700">·</span>
          <span>Target: Kalshi BTC 15-Minute Markets (KXBTC15M)</span>
        </div>

        {/* Right: Risk Disclaimer */}
        <div className="text-[11px] text-neutral-500 text-center md:text-right">
          Quantitative models do not guarantee profits. Real execution subject to fees, spread, slippage, and execution uncertainty.
        </div>
      </div>
    </footer>
  );
};
