/** Paper wallet is a view of the authoritative backend, never localStorage. */
import React, { useEffect, useState } from 'react';
import type { WalletRecord } from '../db/database';

export const PaperWalletTab: React.FC = () => {
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/wallet', { cache: 'no-store' });
        if (!response.ok) throw new Error('Wallet API unavailable');
        const body = await response.json();
        if (mounted) { setWallet(body.wallet); setError(''); }
      } catch (reason) {
        if (mounted) { setWallet(null); setError(String(reason)); }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  const value = (cents: number) => '$' + (cents / 100).toFixed(2);
  return (
    <section className="p-6 rounded-xl bg-neutral-900 text-white space-y-4">
      <h2 className="text-xl font-semibold">Paper Wallet — Server Ledger</h2>
      <p className="text-sm text-amber-300">During safe deployment validation, browser wallet deposits, withdrawals and resets are disabled. The figures below come from the server.</p>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      {!wallet && !error && <p>Loading server wallet…</p>}
      {wallet && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>Cash Balance<strong className="block text-lg">{value(wallet.balanceCents)}</strong></div>
          <div>Reserved Collateral<strong className="block text-lg">{value(wallet.reservedCents)}</strong></div>
          <div>Equity<strong className="block text-lg">{value(wallet.equityCents)}</strong></div>
          <div>Realized P&amp;L<strong className="block text-lg">{value(wallet.realizedPnlCents)}</strong></div>
        </div>
      )}
    </section>
  );
};
