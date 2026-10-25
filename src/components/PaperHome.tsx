import {useEffect,useState} from 'react';

type Num = number|null;
type Trade = {id:Num;ts:Num;ticker:string|null;side:string|null;strategy:string|null;qty:Num;net:Num;reason:string|null};
type PaperData = {
 connected:boolean; paperOnly:boolean; executionId:string;
 marketTicker:string|null; strategy:string|null; paused:boolean;
 quote:{yesBid:Num;yesAsk:Num;bidSize:Num;askSize:Num;source:string|null};
 brti:{price:Num;ageSeconds:Num;status:string|null};
 feed:{status:string|null;quoteAge:Num;quoteFresh:boolean;heartbeatFresh:boolean};
 wallet:{initial:Num;cash:Num;equity:Num;totalPnl:Num;dailyHalt:boolean;drawdownHalt:boolean};
 totals:{closedTrades:Num;closedFees:Num};
 positions:unknown[]; trades:Trade[];
};
const usd=(n:Num|undefined)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD'}):'Unavailable';
const cents=(n:Num|undefined)=>typeof n==='number'&&Number.isFinite(n)?(n*100).toFixed(1)+'¢':'—';
const count=(n:Num|undefined)=>typeof n==='number'?n.toLocaleString('en-US'):'—';

export function PaperHome({openHistory}:{openHistory:()=>void}){
 const [snapshot,setSnapshot]=useState<PaperData|null>(null);
 const [problem,setProblem]=useState<string|null>('Connecting to local Python engine');
 useEffect(()=>{
  let alive=true;
  async function refresh(){
   try{
    const response=await fetch('/api/python-paper/operations',{cache:'no-store'});
    if(!response.ok)throw Error('Python paper operations are temporarily unavailable');
    const body:PaperData=await response.json();
    if(!body.connected||!body.paperOnly)throw Error('Python paper engine has not confirmed its identity and PAPER-only state');
    if(alive){setSnapshot(body);setProblem(null);}
   }catch(error){if(alive){setSnapshot(null);setProblem(error instanceof Error?error.message:'Connection unavailable');}}
  }
  void refresh();const timer=setInterval(()=>void refresh(),5000);
  return()=>{alive=false;clearInterval(timer);};
 },[]);
 const cards:[string,string][]=[
  ['Python paper equity',usd(snapshot?.wallet.equity)],
  ['Python paper P&L',usd(snapshot?.wallet.totalPnl)],
  ['Available paper cash',usd(snapshot?.wallet.cash)],
  ['Closed paper trades',count(snapshot?.totals.closedTrades)],
  ['Open paper positions',snapshot?String(snapshot.positions.length):'—'],
  ['Recorded paper fees',usd(snapshot?.totals.closedFees)]
 ];
 const feedOkay=!!snapshot?.feed.quoteFresh&&!!snapshot?.feed.heartbeatFresh;
 return <section className="min-w-0 space-y-5">
  <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
   <div className="space-y-1 min-w-0">
    <h1 className="text-xl font-bold">Paper Trading Overview</h1>
    <p className="text-sm text-slate-300">Python Kalshi engine · separate simulated wallet · read-only monitoring</p>
    <p role="status" className={snapshot?'text-emerald-300 text-sm':'text-amber-300 text-sm'}>
      {snapshot?(feedOkay?'Paper engine connected · market observations fresh':'Paper engine connected · market feed not currently ready'):(problem??'Connection unavailable')}
    </p>
   </div>
   <button type="button" onClick={openHistory} className="shrink-0 rounded-md bg-cyan-900/70 border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-800">
    View trades & positions
   </button>
  </div>
  {snapshot&&<div className="rounded-lg border border-amber-900/80 bg-amber-950/20 p-3 text-xs text-amber-100">
   QuantScale automated execution remains locked. Python paper simulation is monitored independently; displayed gains are simulated, not evidence of executable exchange fills.
   {snapshot.paused?' Python entries are currently paused.':''}
   {(snapshot.wallet.dailyHalt||snapshot.wallet.drawdownHalt)?' A paper risk halt is active.':''}
  </div>}
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
   {cards.map(([name,value])=><div key={name} className="p-4 min-w-0 rounded-xl border border-slate-800 bg-slate-900/80">
    <p className="text-xs text-slate-400">{name}</p><p className="mt-1 text-lg sm:text-xl font-mono font-semibold break-all">{value}</p>
   </div>)}
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
   <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 min-w-0">
    <h2 className="font-semibold">Market observations</h2>
    <p className="text-sm text-slate-300 break-words">Market: {snapshot?.marketTicker??'Unavailable'}</p>
    <p className="text-sm text-slate-300">CF BRTI observation: {usd(snapshot?.brti.price)} <span className="text-xs text-slate-400">(Python feed)</span></p>
    <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-sm">
     <span>YES bid: {cents(snapshot?.quote.yesBid)}</span><span>YES ask: {cents(snapshot?.quote.yesAsk)}</span>
    </div>
    <p className="text-xs text-slate-400">Observed top-of-book prices, not a guarantee of execution. Source: {snapshot?.quote.source??'Unavailable'}</p>
   </section>
   <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
    <h2 className="font-semibold">Feed & risk health</h2>
    <p className="text-sm">Strategy: {snapshot?.strategy??'Unavailable'}</p>
    <p className="text-sm">Market feed: {snapshot?.feed.status??'Unavailable'}</p>
    <p className="text-sm">Quote: {snapshot?(snapshot.feed.quoteFresh?'Fresh':'Stale/unavailable'):'Unknown'} · Heartbeat: {snapshot?(snapshot.feed.heartbeatFresh?'Fresh':'Stale/unavailable'):'Unknown'}</p>
    <p className="text-sm">Daily loss halt: {snapshot?(snapshot.wallet.dailyHalt?'Active':'Off'):'Unknown'} · Drawdown halt: {snapshot?(snapshot.wallet.drawdownHalt?'Active':'Off'):'Unknown'}</p>
   </section>
  </div>
  <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h2 className="font-semibold">Recent closed paper trades</h2>
    <button type="button" className="text-sm text-cyan-300 hover:underline" onClick={openHistory}>Full paper operations</button>
   </div>
   {!snapshot?<p className="text-sm text-slate-400">Trade history is unavailable while the source is disconnected.</p>:
    snapshot.trades.length===0?<p className="text-sm text-slate-400">No recorded trades in this snapshot.</p>:
    <div className="overflow-x-auto"><table className="w-full text-xs text-left">
     <thead><tr>{['Market','Side','Strategy','Quantity','Net P&L'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead>
     <tbody>{snapshot.trades.slice(0,5).map((trade,i)=><tr key={trade.id??i} className="border-t border-slate-700">
      <td className="p-2">{trade.ticker??'—'}</td><td className="p-2">{trade.side??'—'}</td><td className="p-2">{trade.strategy??'—'}</td>
      <td className="p-2">{count(trade.qty)}</td><td className="p-2 whitespace-nowrap">{usd(trade.net)}</td>
     </tr>)}</tbody>
    </table></div>}
  </section>
 </section>;
}
