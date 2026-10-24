/**
 * Institutional Top Bar Navigation
 * Adheres strictly to the 3-zone contract:
 * [Brand Wordmark] — [Nav Links with whitespace-nowrap] — [Primary Action / Status Control]
 */

import React from 'react';
import { ExecutionMode } from '../types/market';
import { ShieldAlert, Play, Pause } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mode: ExecutionMode;
  isRunning: boolean;
  onToggleEngine: () => void;
  isAutoTrading: boolean;
  onToggleAutoTrading: () => void;
  onOpenSafeguards: () => void;
  isKiosk: boolean;
  onToggleKiosk: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  mode,
  isRunning,
  onToggleEngine,
  isAutoTrading,
  onToggleAutoTrading,
  onOpenSafeguards,
  isKiosk,
  onToggleKiosk,
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'positions', label: 'Positions' },
    { id: 'strategies', label: 'Strategies' },
    { id: 'research', label: 'Research' },
    { id: 'portfolios', label: 'Portfolios' },
    { id: 'backtest', label: 'Backtester' },
    { id: 'diagnostics', label: 'Diagnostics' },
    { id: 'runbook', label: 'Runbook' },
  ];

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-8 px-6 py-3.5 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800">
      {/* Zone 1: Brand Wordmark (Single text element) */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap flex items-center gap-2"
        >
          <span className="text-cyan-400 font-mono">K-ALPHA</span>
          <span className="text-neutral-400 font-normal">Kalshi BTC 15M</span>
        </a>
        <span className="text-neutral-700">|</span>
        {/* Environment status indicator as clean unboxed text */}
        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={`font-mono font-semibold tracking-wider ${
              mode === 'LIVE'
                ? 'text-rose-400'
                : mode === 'DEMO'
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            [{mode}]
          </span>
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-400 font-mono text-[11px]">v1.2.4</span>
        </div>
      </div>

      {/* Zone 2: Navigation Links (single-line, concise) */}
      <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-400">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 relative py-1 text-xs tracking-wide uppercase ${
                isActive ? 'text-cyan-400 font-semibold' : 'text-neutral-400'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary Action & Safeguard Trigger */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Kiosk Mode Toggle */}
        <button
          onClick={onToggleKiosk}
          title="Toggle Fullscreen Pi Kiosk Display"
          className="hidden sm:inline-flex px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 rounded transition-colors whitespace-nowrap"
        >
          {isKiosk ? 'Exit Kiosk' : 'Pi Display'}
        </button>

        {/* Auto-Trading Bot Toggle */}
        <button
          onClick={onToggleAutoTrading}
          title={
            isAutoTrading
              ? 'Autonomous Bot is actively trading. Click to pause.'
              : 'Autonomous Bot is paused. Click to activate automated execution.'
          }
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap border ${
            isAutoTrading
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/60'
              : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-neutral-200'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isAutoTrading ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
            }`}
          />
          <span className="font-mono">{isAutoTrading ? 'AUTO-TRADE: ON' : 'AUTO-TRADE: OFF'}</span>
        </button>

        {/* Start / Pause Engine */}
        <button
          onClick={onToggleEngine}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
            isRunning
              ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </>
          )}
        </button>

        {/* Emergency Safeguards Button */}
        <button
          onClick={onOpenSafeguards}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded transition-colors whitespace-nowrap"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>Risk Controls</span>
        </button>
      </div>
    </header>
  );
};
