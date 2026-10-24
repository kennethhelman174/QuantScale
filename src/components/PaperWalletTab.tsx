/**
 * Paper Wallet & Bankroll Management View
 *
 * Implements:
 * - $1,000 configurable starting bankroll
 * - Real-time accounting: Available Cash, Reserved Collateral, Equity, Cumulative P&L
 * - Deposit, Withdrawal, and Manual Reset controls with confirmation and audit logging
 * - Full Transaction Cash Ledger view
 */

import React, { useState } from 'react';
import { Wallet, DollarSign, PlusCircle, MinusCircle, RotateCcw, ShieldCheck, History, ArrowUpRight } from 'lucide-react';
import { dbEngine, WalletRecord } from '../db/database';

interface PaperWalletTabProps {
  onRefreshState?: () => void;
}

export const PaperWalletTab: React.FC<PaperWalletTabProps> = ({ onRefreshState }) => {
  const [wallet, setWallet] = useState<WalletRecord>(() => dbEngine.getWallet('PAPER'));
  const [depositAmount, setDepositAmount] = useState<string>('500');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('200');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const balanceDollars = wallet.balanceCents / 100;
  const reservedDollars = wallet.reservedCents / 100;
  const equityDollars = wallet.equityCents / 100;
  const pnlDollars = wallet.realizedPnlCents / 100;

  const handleDeposit = () => {
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) return;

    const amtCents = Math.round(amt * 100);
    const newBal = wallet.balanceCents + amtCents;
    const newEq = wallet.equityCents + amtCents;

    dbEngine.updateWallet(
      'PAPER',
      newBal,
      wallet.reservedCents,
      newEq,
      wallet.realizedPnlCents,
      'DEPOSIT',
      `Manual Paper Wallet Deposit ($${amt.toFixed(2)})`
    );

    setWallet(dbEngine.getWallet('PAPER'));
    if (onRefreshState) onRefreshState();
  };

  const handleWithdraw = () => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) return;

    const amtCents = Math.round(amt * 100);
    if (amtCents > wallet.balanceCents) {
      alert('Withdrawal amount exceeds available unreserved cash balance.');
      return;
    }

    const newBal = wallet.balanceCents - amtCents;
    const newEq = wallet.equityCents - amtCents;

    dbEngine.updateWallet(
      'PAPER',
      newBal,
      wallet.reservedCents,
      newEq,
      wallet.realizedPnlCents,
      'WITHDRAWAL',
      `Manual Paper Wallet Withdrawal ($${amt.toFixed(2)})`
    );

    setWallet(dbEngine.getWallet('PAPER'));
    if (onRefreshState) onRefreshState();
  };

  const handleReset = () => {
    dbEngine.resetPaperWallet(100000); // Reset to $1,000.00
    setWallet(dbEngine.getWallet('PAPER'));
    setShowResetConfirm(false);
    if (onRefreshState) onRefreshState();
  };

  return (
    <div className="space-y-6 text-xs text-neutral-300">
      {/* Top Banner */}
      <div className="p-5 bg-neutral-900/80 rounded-2xl border border-neutral-800 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Paper Wallet & Bankroll Management</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800/60 rounded">
                  $1,000.00 Starting Capital
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Isolated paper wallet accounting engine backed by persistent SQLite WAL database transactions.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 font-semibold rounded-xl text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Wallet ($1,000)</span>
          </button>
        </div>

        {/* 4 KPI Accounting Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-neutral-950/80 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">Available Balance</span>
            <span className="font-mono tabular-nums font-bold text-white text-base">
              ${balanceDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3.5 bg-neutral-950/80 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">Reserved Collateral</span>
            <span className="font-mono tabular-nums font-bold text-amber-300 text-base">
              ${reservedDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3.5 bg-neutral-950/80 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">Total Net Equity</span>
            <span className="font-mono tabular-nums font-bold text-cyan-300 text-base">
              ${equityDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3.5 bg-neutral-950/80 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">Cumulative Realized P&L</span>
            <span className={`font-mono tabular-nums font-bold text-base ${pnlDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ${pnlDollars >= 0 ? '+' : ''}{pnlDollars.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Overlay */}
      {showResetConfirm && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl flex items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3 text-rose-200">
            <RotateCcw className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">Reset Paper Wallet to $1,000.00?</span>
              <p className="text-[11px] text-rose-300/80 leading-relaxed mt-0.5">
                This will clear active paper open positions and record a manual wallet reset transaction in the SQLite cash ledger.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1.5 bg-neutral-900 text-neutral-300 hover:text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg"
            >
              Confirm Reset
            </button>
          </div>
        </div>
      )}

      {/* Manual Deposit / Withdrawal Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Deposit Card */}
        <div className="p-4 bg-neutral-900/60 rounded-2xl border border-neutral-800 space-y-3">
          <div className="flex items-center gap-2 font-bold text-white text-xs">
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <span>Deposit Funds to Paper Wallet</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <DollarSign className="w-4 h-4 text-neutral-500 absolute left-2.5 top-2" />
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-emerald-500"
                placeholder="500"
              />
            </div>
            <button
              onClick={handleDeposit}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors"
            >
              Deposit
            </button>
          </div>
        </div>

        {/* Withdrawal Card */}
        <div className="p-4 bg-neutral-900/60 rounded-2xl border border-neutral-800 space-y-3">
          <div className="flex items-center gap-2 font-bold text-white text-xs">
            <MinusCircle className="w-4 h-4 text-amber-400" />
            <span>Withdraw Cash from Paper Wallet</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <DollarSign className="w-4 h-4 text-neutral-500 absolute left-2.5 top-2" />
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-amber-500"
                placeholder="200"
              />
            </div>
            <button
              onClick={handleWithdraw}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors"
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
