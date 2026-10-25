import { useEffect, useState } from 'react';

type Num = number | null;
type Trade = {id:Num;ts:Num;ticker:string|null;strategy:string|null;side:string|null;qty:Num;entry:Num;exit:Num;net:Num;fees:Num;reason:string|null};
type Operations = {
 connected:boolean;readOnly:boolean;paperOnly:boolean;executionId:string;
 marketTicker:string|null;strategy:string|null;
 feed:{status:string|null;heartbeatAge:Num;quoteAge:Num;quoteFresh:boolean;heartbeatFresh:boolean};
 wallet:{initial:Num;cash:Num;equity:Num;totalPnl:Num;unrealizedNet:Num;dailyPnl:Num;dailyHalt:boolean;drawdownHalt:boolean};
 totals:{closedTrades:Num;realizedNet:Num;closedFees:Num;wins:Num};
 positions:{ticker:string|null;side:string|null;strategy:string|null;qty:Num;entry:Num;unrealizedPnl:Num}[];
 trades:Trade[];
 strategies:{name:string|null;closedTrades:Num;net:Num;fees:Num}[];
};
const money=(n:Num|undefined)=>typeof n==='number'?'$'+n.toFixed(2):'—';
const num=(n:Num|undefined)=>typeof n==='number'?n.toLocaleString():'—';

export function PythonPaperOperations(){
 const [data,setData]=useState<Operations|null>(null);
 const [error,setError]=useState('Loading paper history');
 useEffect(()=>{
  let mounted=true;
  const refresh=async()=>{
   try{
    const response=await fetch('/api/python-paper/operations',{cache:'no-store'});
    if(!response.ok)throw new Error('Paper history unavailable');
    const payload:Operations=await response.json();
    if(!payload.connected||!payload.paperOnly)throw new Error('Paper engine not ready');
    if(mounted){setData(payload);setError('');}
   }catch(e){if(mounted){setData(null);setError(e instanceof Error?e.message:'Unavailable');}}
  };
  void refresh();
  const timer=setInterval(()=>void refresh(),5000);
  return ()=>{mounted=false;clearInterval(timer);};
 },[]);
 return <section className="space-y-5 min-w-0">
   <div className="rounded-xl border border-cyan-900 p-4 bg-slate-900/70">
    <h2 className="text-lg font-bold">Python Paper Operations</h2>
    <p className="text-xs text-slate-400">Live paper-only observation. Separate wallet. No execution controls or orders available in QuantScale.</p>
    <p role="status" className="mt-2 text-sm">{data?'Connected to Python paper ledger':error}</p>
   </div>
   {data && <>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[['Paper Equity',money(data.wallet.equity)],['Cash',money(data.wallet.cash)],['Net P&L',money(data.wallet.totalPnl)],['Closed Trades',num(data.totals.closedTrades)],
        ['Realized Net',money(data.totals.realizedNet)],['Closed Fees',money(data.totals.closedFees)],['Open Positions',num(data.positions.length)],['Market',data.marketTicker??'Unavailable']].map(([name,value])=>
        <div key={name} className="rounded-xl border border-slate-800 bg-slate-900 p-3 min-w-0">
          <div className="text-xs text-slate-400">{name}</div><div className="font-mono font-bold text-lg break-words">{value}</div>
        </div>)}
    </div>
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-1 text-sm">
      <h3 className="font-semibold">Feed and Risk Checks</h3>
      <p>Market feed: {data.feed.status??'Unknown'} · Heartbeat: {data.feed.heartbeatFresh?'Fresh':'STALE'} · Quote: {data.feed.quoteFresh?'Fresh':'STALE'}</p>
      <p>Daily halt: {data.wallet.dailyHalt?'ACTIVE':'Inactive'} · Drawdown halt: {data.wallet.drawdownHalt?'ACTIVE':'Inactive'} · Strategy: {data.strategy??'Unknown'}</p>
    </div>
    <div className="space-y-2">
      <h3 className="font-semibold">Open Paper Positions</h3>
      {data.positions.length===0?<p className="text-sm text-slate-400">No open paper positions.</p>:
      <div className="overflow-x-auto"><table className="min-w-full text-xs text-left">
        <thead><tr>{['Market','Side','Strategy','Qty','Entry','Unrealized'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{data.positions.map((p,i)=><tr key={i} className="border-t border-slate-800">
          <td className="p-2">{p.ticker??'—'}</td><td className="p-2">{p.side??'—'}</td><td className="p-2">{p.strategy??'—'}</td>
          <td className="p-2">{num(p.qty)}</td><td className="p-2">{p.entry??'—'}</td><td className="p-2">{money(p.unrealizedPnl)}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    <div className="space-y-2">
      <h3 className="font-semibold">Recent Closed Paper Trades (last 30)</h3>
      {data.trades.length===0?<p className="text-sm text-slate-400">No closed paper trades recorded.</p>:
      <div className="overflow-x-auto"><table className="min-w-full text-xs text-left">
        <thead><tr>{['Time','Market','Strategy','Side','Qty','Entry','Exit','Fees','Net','Reason'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{data.trades.map((t,i)=><tr key={t.id??i} className="border-t border-slate-800">
         <td className="p-2 whitespace-nowrap">{typeof t.ts==='number'?new Date(t.ts*1000).toLocaleString():'—'}</td>
         <td className="p-2">{t.ticker??'—'}</td><td className="p-2">{t.strategy??'—'}</td><td className="p-2">{t.side??'—'}</td>
         <td className="p-2">{num(t.qty)}</td><td className="p-2">{t.entry??'—'}</td><td className="p-2">{t.exit??'—'}</td>
         <td className="p-2">{money(t.fees)}</td><td className="p-2">{money(t.net)}</td><td className="p-2">{t.reason??'—'}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
   </>}
 </section>;
}
