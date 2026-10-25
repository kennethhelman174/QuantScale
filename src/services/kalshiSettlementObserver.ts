/**
 * Read-only, exchange-confirmed market settlement observer.
 * Never changes positions, payouts, balances or simulated market results.
 */
export interface SettlementObservation {
  ticker: string;
  state: 'PENDING' | 'CONFIRMED' | 'ERROR';
  result: 'yes' | 'no' | null;
  exchangeStatus: string | null;
  observedAt: number;
  message: string;
}
export function parseOfficialSettlement(ticker:string, payload:unknown, timestamp=Date.now()):SettlementObservation {
  if(!payload || typeof payload!=='object' || !('market' in payload)) throw Error('Missing exchange market payload');
  const market=(payload as {market:Record<string,unknown>}).market;
  if(!market || market.ticker!==ticker) throw Error('Exchange ticker mismatch');
  const exchangeStatus=typeof market.status==='string'?market.status:null;
  const result=market.result;
  const isFinal=exchangeStatus==='settled' || exchangeStatus==='finalized';
  if(isFinal && (result==='yes'||result==='no')) {
    return {ticker,state:'CONFIRMED',result,exchangeStatus,observedAt:timestamp,message:'Exchange published final result'};
  }
  return {ticker,state:'PENDING',result:null,exchangeStatus,observedAt:timestamp,message:'Awaiting exchange-confirmed final result'};
}
export class KalshiSettlementObserver {
  private observations=new Map<string,SettlementObservation>();
  private pending=new Set<string>();
  private busy=false;
  private timer:ReturnType<typeof setInterval>|null=null;
  constructor(private readonly onConfirmed?: (observation: SettlementObservation) => void) {}
  public track(ticker:string) {
    if(!/^KXBTC15M-[A-Za-z0-9-]+$/.test(ticker)) throw Error('Invalid ticker');
    if(!this.observations.has(ticker)) {
      this.observations.set(ticker,{ticker,state:'PENDING',result:null,exchangeStatus:null,observedAt:Date.now(),message:'Awaiting final result'});
    }
    this.pending.add(ticker);
  }
  public list(){return [...this.observations.values()].slice(-60);}
  public start(){if(this.timer)return;this.timer=setInterval(()=>void this.poll(),30000);}
  public stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  public async poll(){
    if(this.busy)return;
    this.busy=true;
    try{
      for(const ticker of [...this.pending].slice(0,10)) {
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),7000);
        try{
          const res=await fetch('https://external-api.kalshi.com/trade-api/v2/markets/'+encodeURIComponent(ticker),
            {headers:{accept:'application/json'},signal:controller.signal});
          if(!res.ok)throw Error('Exchange returned HTTP '+res.status);
          const observation=parseOfficialSettlement(ticker,await res.json());
          if(observation.state==='CONFIRMED') {
            // Do not mark processed until the durable storage callback commits.
            this.onConfirmed?.(observation);
            this.pending.delete(ticker);
          }
          this.observations.set(ticker,observation);
        }catch(e){
          this.observations.set(ticker,{ticker,state:'ERROR',result:null,exchangeStatus:null,
            observedAt:Date.now(),message:String(e)});
        }finally{clearTimeout(timer);}
      }
    }finally{this.busy=false;}
  }
}
