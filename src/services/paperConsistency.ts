type Check = {id:string; status:'PASS'|'FAIL'|'UNAVAILABLE'|'STALE'; detail:string; differenceUsd?:number};
const valid = (v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function paperConsistency(input:{execution:Record<string,unknown>;totals:Record<string,unknown>;quoteFresh:boolean}){
 const {execution,totals,quoteFresh}=input;
 const diff=valid(execution.equity)&&valid(execution.initial)&&valid(execution.total_pnl)
  ?Math.round((execution.equity-execution.initial-execution.total_pnl)*10000)/10000:null;
 const checks:Check[]=[
  {id:'equity_vs_pnl',status:diff===null?'UNAVAILABLE':Math.abs(diff)<=0.02?'PASS':'FAIL',
   detail:'Equity minus initial funding matches total reported P&L',...(diff!==null?{differenceUsd:diff}:{})},
  {id:'wallet_fields',status:[execution.cash,execution.equity,execution.initial,execution.total_pnl].every(valid)?'PASS':'UNAVAILABLE',
   detail:'All four core wallet values are available'},
  {id:'closed_summary',status:valid(totals.closed_trades)&&valid(totals.realized_net)?'PASS':'UNAVAILABLE',
   detail:'Closed trade count and realized net reported; not independently audited'},
  {id:'fresh_quotes',status:quoteFresh?'PASS':'STALE',detail:'Latest Python quote freshness check'}
 ];
 return {status:checks.some(x=>x.status==='FAIL')?'ATTENTION':checks.every(x=>x.status==='PASS')?'CONSISTENT':'INCOMPLETE',
  scope:'Single Python status snapshot; not an independent SQLite ledger audit',checks};
}
