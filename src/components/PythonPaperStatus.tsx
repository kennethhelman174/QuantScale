import { useEffect, useState } from 'react';

type Status = { connected: boolean; snapshot: {
  ticker: string | null;
  paper: { cash: number | null; equity: number | null };
  brti: { price: number | null };
} | null };

export function PythonPaperStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch('/api/python-paper/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Bridge unavailable');
        const value: Status = await response.json();
        if (active) setStatus(value);
      } catch {
        if (active) setStatus({ connected: false, snapshot: null });
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const current = status?.connected ? status.snapshot : null;
  return <div role="status" className="p-2 text-xs bg-slate-900 text-slate-100 text-center">
    Python research/paper engine (separate wallet, read-only):
    {' '}{current ? 'Connected' : 'Offline or stale'}
    {current && <span>
      {current.ticker ? ' | Market: '+current.ticker : ''}
      {' | '}BRTI: {typeof current.brti.price==='number'?current.brti.price.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable'}
      {' | '}Paper equity: {typeof current.paper.equity==='number'?current.paper.equity.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable'}
    </span>}
  </div>;
}
