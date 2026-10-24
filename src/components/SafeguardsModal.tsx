/**
 * Emergency Safeguards & Live Execution Authorization Modal
 *
 * Implements granular, unbundled controls:
 * - Pause New Entries (stops new signals, keeps position management active)
 * - Cancel Outstanding Orders (clears resting book queue)
 * - Continue Managing Positions (ensures active stops & trailing profit locks stay live)
 * - Request Liquidation (Flatten) (orderly market exit)
 * - Explicit Two-Step Live Mode Authorization with Hard Financial Limits
 */

import React, { useState } from 'react';
import { ExecutionMode, RiskLimitsConfig } from '../types/market';
import { ShieldAlert, AlertTriangle, X, CheckCircle2, Lock } from 'lucide-react';

interface SafeguardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: ExecutionMode;
  isPaused: boolean;
  riskLimits: RiskLimitsConfig;
  onTogglePause: () => void;
  onCancelAllOrders: () => void;
  onFlattenPositions: () => void;
  onSetExecutionMode: (mode: ExecutionMode) => void;
  onUpdateRiskLimits: (limits: Partial<RiskLimitsConfig>) => void;
}

export const SafeguardsModal: React.FC<SafeguardsModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  isPaused,
  riskLimits,
  onTogglePause,
  onCancelAllOrders,
  onFlattenPositions,
  onSetExecutionMode,
  onUpdateRiskLimits,
}) => {
  const [targetMode, setTargetMode] = useState<ExecutionMode>(currentMode);
  const [liveAuthorized, setLiveAuthorized] = useState(false);
  const [authPhrase, setAuthPhrase] = useState('');
  const [dailyLossLimit, setDailyLossLimit] = useState(riskLimits.maxDailyLoss);
  const [maxPositionSize, setMaxPositionSize] = useState(riskLimits.maxPositionContracts);

  if (!isOpen) return null;

  const handleApplyLimits = () => {
    onUpdateRiskLimits({
      maxDailyLoss: dailyLossLimit,
      maxPositionContracts: maxPositionSize,
    });
  };

  const handleConfirmModeSwitch = () => {
    if (targetMode === 'LIVE') {
      if (authPhrase.trim().toUpperCase() !== 'AUTHORIZE REAL MONEY') {
        alert("To enable LIVE trading, you must type the exact phrase 'AUTHORIZE REAL MONEY'");
        return;
      }
    }
    onSetExecutionMode(targetMode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-bold text-white">System Risk Controls & Safety Safeguards</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* 1. Distinct Emergency Actions (Never hidden behind a single ambiguous button) */}
          <div>
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              Granular Emergency Actions
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Pause New Entries */}
              <button
                onClick={onTogglePause}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                  isPaused
                    ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                    : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-300'
                }`}
              >
                <span className="font-semibold">{isPaused ? 'Resume Entries' : 'Pause New Entries'}</span>
                <span className="text-[11px] text-neutral-500 mt-1">
                  {isPaused
                    ? 'Allow strategy signals to submit'
                    : 'Blocks new entries, leaves stops active'}
                </span>
              </button>

              {/* Cancel Outstanding Orders */}
              <button
                onClick={onCancelAllOrders}
                className="p-3 bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-xl text-left flex flex-col justify-between transition-colors text-neutral-300"
              >
                <span className="font-semibold text-rose-400">Cancel All Orders</span>
                <span className="text-[11px] text-neutral-500 mt-1">
                  Purges all resting queue limit orders
                </span>
              </button>

              {/* Flatten Open Positions */}
              <button
                onClick={onFlattenPositions}
                className="p-3 bg-rose-950/30 border border-rose-900/60 hover:bg-rose-950/50 rounded-xl text-left flex flex-col justify-between transition-colors text-rose-200"
              >
                <span className="font-semibold text-rose-300">Flatten Positions</span>
                <span className="text-[11px] text-rose-400/80 mt-1">
                  Market exits all open positions
                </span>
              </button>
            </div>
          </div>

          {/* 2. Configurable Financial Risk Limits */}
          <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Configurable Financial Bounds
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-400 mb-1">
                  Max Daily Loss Circuit Breaker ($)
                </label>
                <input
                  type="number"
                  value={dailyLossLimit}
                  onChange={(e) => setDailyLossLimit(parseFloat(e.target.value) || 150)}
                  className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded font-mono text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">
                  Max Position Size (Contracts)
                </label>
                <input
                  type="number"
                  value={maxPositionSize}
                  onChange={(e) => setMaxPositionSize(parseInt(e.target.value) || 10)}
                  className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded font-mono text-white text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleApplyLimits}
              className="mt-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold rounded text-xs transition-colors"
            >
              Update Risk Limits
            </button>
          </div>

          {/* 3. Execution Environment & Authorization Safety Latch */}
          <div className="p-4 bg-neutral-950/80 rounded-xl border border-neutral-800 space-y-3">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Execution Adapter & Financial Environment
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['PAPER', 'DEMO', 'LIVE'] as ExecutionMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setTargetMode(m)}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                    targetMode === m
                      ? m === 'LIVE'
                        ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                        : 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {m === 'PAPER' && 'Paper (Default)'}
                  {m === 'DEMO' && 'Kalshi Demo'}
                  {m === 'LIVE' && 'Real Money (Live)'}
                </button>
              ))}
            </div>

            {targetMode === 'LIVE' && (
              <div className="mt-3 p-4 bg-rose-950/30 border border-rose-900/60 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5 text-rose-300">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <span className="font-bold block">Explicit Real-Money Authorization Required</span>
                    <p className="text-[11px] text-rose-300/80 leading-relaxed mt-0.5">
                      Live execution involves real capital. By confirming, you acknowledge that orders will route directly to Kalshi real-money endpoints subject to the $150 daily circuit breaker.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-rose-300 mb-1 font-mono">
                    Type 'AUTHORIZE REAL MONEY' to unlock:
                  </label>
                  <input
                    type="text"
                    value={authPhrase}
                    onChange={(e) => setAuthPhrase(e.target.value)}
                    placeholder="AUTHORIZE REAL MONEY"
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-rose-800 rounded font-mono text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-800 flex items-center justify-between bg-neutral-950">
          <span className="text-[11px] text-neutral-500">
            Current Active Mode: <span className="font-mono text-white font-semibold">[{currentMode}]</span>
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmModeSwitch}
              className="px-4 py-1.5 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
            >
              Apply Safeguard Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
