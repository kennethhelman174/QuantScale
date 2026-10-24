import type { Kalshi15MMarket, KalshiOrderBook, OrderBookLevel } from '../types/market';

const BASE = 'https://external-api.kalshi.com/trade-api/v2';
type Market = { ticker: string; title?:string; close_time?:string; open_time?:string; status?:string; floor_strike?:number; cap_strike?:number; open_interest_fp?:string; volume_fp?:string; };
type BookPayload = {orderbook_fp?:{yes_dollars?:[string,string][];no_dollars?:[string,string][]}};
async function getJson(url:string, signal?:AbortSignal): Promise<any> {
  const res = await fetch(url, {signal,headers:{accept:'application/json'}});
  if(!res.ok) throw Error('Kalshi read-only API returned HTTP '+res.status);
  return res.json();
}
/** Actual Kalshi REST data. No simulated or locally invented orders. */
export function parseKalshiBook(ticker:string, payload:BookPayload, timestamp=Date.now()):KalshiOrderBook {
  const raw = payload?.orderbook_fp;
  if(!raw || !Array.isArray(raw.yes_dollars) || !Array.isArray(raw.no_dollars)) throw Error('Missing Kalshi orderbook_fp');
  const levels=(rows:[string,string][]):OrderBookLevel[]=>rows.map(([p,q])=>{
    const price=Number(p)*100, quantity=Number(q);
    if(!Number.isFinite(price)||price<1||price>99||!Number.isFinite(quantity)||quantity<=0) throw Error('Invalid Kalshi orderbook level');
    return {price:Math.round(price*100)/100,quantity};
  }).sort((a,b)=>b.price-a.price);
  const yesBids=levels(raw.yes_dollars),noBids=levels(raw.no_dollars);
  const yesAsks=noBids.map(x=>({price:Math.round((100-x.price)*100)/100,quantity:x.quantity})).sort((a,b)=>a.price-b.price);
  const noAsks=yesBids.map(x=>({price:Math.round((100-x.price)*100)/100,quantity:x.quantity})).sort((a,b)=>a.price-b.price);
  const bid=yesBids[0]?.price, ask=yesAsks[0]?.price;
  const empty=bid===undefined||ask===undefined;
  const spread=empty?0:ask-bid;
  const bidQty=yesBids[0]?.quantity||0,askQty=yesAsks[0]?.quantity||0;
  return {ticker,timestamp,sequence:timestamp,yesBids,yesAsks,noBids,noAsks,spread,
    midPrice:empty?0:(bid+ask)/2,microImbalance:bidQty+askQty?(bidQty-askQty)/(bidQty+askQty):0,
    isCrossed:!empty&&spread<=0,isEmpty:empty,isStale:empty||spread<=0,source:'KALSHI_REST'};
}
export class KalshiPublicFeed {
  private activeMarket:Kalshi15MMarket|null=null;
  private lastBook:KalshiOrderBook|null=null;
  private lastError:string|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private running=false;
  private inFlight=false;
  constructor(private onUpdate:(market:Kalshi15MMarket,book:KalshiOrderBook)=>void){}
  status(){return {market:this.activeMarket?.ticker||null, bookAgeMs:this.lastBook?Date.now()-this.lastBook.timestamp:null, source:this.lastBook?.source||null, error:this.lastError};}
  start(){if(this.timer)return;void this.poll();this.timer=setInterval(()=>void this.poll(),4000);}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;this.activeMarket=null;this.lastBook=null;}
  async poll(){
    if(this.inFlight)return;
    this.inFlight=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),4500);
    try{
      const now=Date.now();
      if(!this.activeMarket||this.activeMarket.closeTimestamp<=now+5000){
        const url=BASE+'/markets?series_ticker=KXBTC15M&status=open&limit=100';
        const json=await getJson(url,controller.signal);
        if(!Array.isArray(json.markets))throw Error('Malformed markets response');
        const candidates=(json.markets as Market[]).filter(m=>
          m.status==='active'||m.status==='open'||!m.status
        ).map(m=>({m,close:Date.parse(m.close_time||'')})).filter(x=>
          x.m.ticker.startsWith('KXBTC15M-')&&Number.isFinite(x.close)&&x.close>now+5000
        ).sort((a,b)=>a.close-b.close);
        const match=candidates[0]?.m;
        if(!match){this.activeMarket=null;this.lastBook=null;throw Error('No open KXBTC15M market returned by exchange');}
        const close=Date.parse(match.close_time!);
        const strike=Number(match.floor_strike??match.cap_strike);
        if(!Number.isFinite(strike)||strike<=0)throw Error('No exchange strike provided');
        this.activeMarket={ticker:match.ticker,title:match.title||match.ticker,strikePrice:strike,
          openTimestamp:Date.parse(match.open_time||'')||now,closeTimestamp:close,
          settlementTimerSec:Math.max(0,Math.floor((close-now)/1000)),status:'OPEN',
          openInterest:Number(match.open_interest_fp||0),volume:Number(match.volume_fp||0)};
      }
      const ticker=this.activeMarket.ticker;
      const book= parseKalshiBook(ticker,await getJson(BASE+'/markets/'+encodeURIComponent(ticker)+'/orderbook',controller.signal));
      this.lastBook=book;this.lastError=null;
      this.activeMarket.settlementTimerSec=Math.max(0,Math.floor((this.activeMarket.closeTimestamp-Date.now())/1000));
      this.onUpdate({...this.activeMarket},book);
    }catch(e){this.lastError=String(e);this.lastBook=null;}
    finally{clearTimeout(timeout);this.inFlight=false;}
  }
}
