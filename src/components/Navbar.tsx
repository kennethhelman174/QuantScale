/**
 * Institutional Top Bar Navigation
 * Adheres strictly to the 3-zone contract:
 * [Brand Wordmark] — [Nav Links with whitespace-nowrap] — [Primary Action / Status Control]
 */

import React, { useState, useEffect } from 'react';
import { ExecutionMode } from '../types/market';
import { ShieldAlert, Play, Pause, Bell, Sun, Moon } from 'lucide-react';
import { alertManager } from '../services/alertManager';
import { BtcSparkline } from './BtcSparkline';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mode: ExecutionMode;
  isRunning: boolean;
  onToggleEngine: () => void;
  isAutoTrading: boolean;
  onToggleAutoTrading: () => void;
  onOpenSafeguards: (initialTab?: 'safeguards' | 'alerts') => void;
  onOpenSetupWizard: () => void;
  isKiosk: boolean;
  onToggleKiosk: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  spotPrice?: number;
  spotHistory?: number[];
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
  onOpenSetupWizard,
  isKiosk,
  onToggleKiosk,
  theme = 'dark',
  onToggleTheme,
  spotPrice,
  spotHistory = [],
}) => {
  const [activeAlertsCount, setActiveAlertsCount] = useState(
    alertManager.getRules().filter((r) => r.isEnabled).length
  );
  const [hasFiringNotification, setHasFiringNotification] = useState(
    alertManager.getActiveNotifications().length > 0
  );

  useEffect(() => {
    const syncAlerts = () => {
      setActiveAlertsCount(alertManager.getRules().filter((r) => r.isEnabled).length);
      setHasFiringNotification(alertManager.getActiveNotifications().length > 0);
    };
    syncAlerts();
    return alertManager.subscribe(syncAlerts);
  }, []);
  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'positions', label: 'Positions' },
    { id: 'wallet', label: 'Paper Wallet' },
    { id: 'python-paper', label: 'Python Paper Ops' },
    { id: 'strategies', label: 'Strategies' },
    { id: 'research', label: 'Research' },
    { id: 'portfolios', label: 'Portfolios' },
    { id: 'backtest', label: 'Backtester' },
    { id: 'diagnostics', label: 'Diagnostics' },
    { id: 'runbook', label: 'Runbook' },
  ];

  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 sm:px-5 py-2.5 w-full min-w-0 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800">
      {/* Zone 1: Brand Wordmark & 1H BTC Sparkline */}
      <div className="flex items-center gap-2 min-w-0 max-w-full flex-wrap">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap flex items-center gap-2"
        >
          <span className="text-cyan-400 font-mono">K-ALPHA</span>
          <span className="text-neutral-400 font-normal hidden xl:inline">Kalshi BTC 15M</span>
        </a>
        <span className="text-neutral-700">|</span>
        {/* Environment status indicator */}
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
        </div>

        {/* 1-Hour Rolling BTC Spot Trend Sparkline */}
        {spotPrice !== undefined && (
          <>
            <span className="text-neutral-700 hidden sm:inline">|</span>
            <BtcSparkline spotPrice={spotPrice} spotHistory={spotHistory} />
          </>
        )}
      </div>

      {/* Zone 2: Navigation Links (single-line, concise) */}
      <nav className="order-3 w-full min-w-0 flex flex-wrap items-center justify-start gap-x-3 gap-y-2 text-sm font-medium text-neutral-400 border-t border-neutral-800/70 pt-2" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`hover:text-white transition-colors whitespace-nowrap relative py-1 text-xs tracking-wide uppercase ${
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
      <div className="flex flex-wrap items-center justify-end gap-2 min-w-0 max-w-full">
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
          disabled aria-disabled="true" onClick={onToggleAutoTrading}
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
          <span className="font-mono">{'AUTO-TRADE: LOCKED'}</span>
        </button>

        {/* Start / Pause Engine */}
        <button
          disabled aria-disabled="true" onClick={onToggleEngine}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
            isRunning
              ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Locked</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Locked</span>
            </>
          )}
        </button>

        {/* Volatility Alerts Button */}
        <button
          onClick={() => onOpenSafeguards('alerts')}
          title="Configure Custom BTC Volatility & Price-Action Alerts"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap border ${
            hasFiringNotification
              ? 'bg-amber-950/80 border-amber-600 text-amber-300 animate-pulse'
              : 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300 hover:bg-cyan-900/60'
          }`}
        >
          <Bell className={`w-3.5 h-3.5 ${hasFiringNotification ? 'text-amber-400' : 'text-cyan-400'}`} />
          <span>Alerts</span>
          {activeAlertsCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-cyan-900/80 text-cyan-200">
              {activeAlertsCount}
            </span>
          )}
        </button>

        {/* API Setup Wizard Button */}
        <button
          disabled aria-disabled="true" onClick={onOpenSetupWizard}
          title="Configure Kalshi API Credentials & Real-World Feed"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-800/60 rounded transition-colors whitespace-nowrap"
        >
          <span>API Setup Locked</span>
        </button>

        {/* Theme Toggle Button (Dark / Day Mode) */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Day Mode (Professional Light Theme)' : 'Switch to High-Contrast Night Mode'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap ${
              theme === 'light'
                ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono">Day Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-700" />
                <span className="font-mono">Night Mode</span>
              </>
            )}
          </button>
        )}

        {/* Emergency Safeguards Button */}
        <button
          onClick={() => onOpenSafeguards('safeguards')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded transition-colors whitespace-nowrap"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>Risk Controls</span>
        </button>
      </div>
    </header>
  );
};
