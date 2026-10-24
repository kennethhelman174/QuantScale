import type { Kalshi15MMarket, KalshiOrderBook, OrderBookLevel } from '../types/market';

const BASE = 'https://external-api.kalshi.com/trade-api/v2';
type Market = { ticker: string; title?:string; close_time?:string; open_time?:string; status?:string; floor_strike?:number; cap_strike?:number; rules_primary?:string; rules_secondary?:string; open_interest_fp?:string; volume_fp?:string; };
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
  private diagnostics={pages:0,returned:0,eligible:0,checkedAt:0,scheduled:0,nextScheduledOpen:null as string|null,filter:'open (active)'};
  private lastDiscoveryAt=0;
  private timer:ReturnType<typeof setInterval>|null=null;
  private inFlight=false;
  private lastTicker: string | null = null;
  constructor(private onUpdate:(market:Kalshi15MMarket,book:KalshiOrderBook)=>void, private onRollover?:(previousTicker:string)=>void){}
  status(){
    const now=Date.now();
    const age=this.lastBook?now-this.lastBook.timestamp:null;
    const bookFresh=age!==null && age<=12000 && !this.lastBook?.isStale;
    const marketActive=!!this.activeMarket && this.activeMarket.openTimestamp<=now && this.activeMarket.closeTimestamp>now;
    return {
      market:this.activeMarket?.ticker||null,bookAgeMs:age,source:this.lastBook?.source||null,
      error:this.lastError,discovery:this.diagnostics,
      marketState:marketActive?'ACTIVE':this.diagnostics.nextScheduledOpen?'SCHEDULED':'UNAVAILABLE',
      quoteState:bookFresh?'FRESH':'UNAVAILABLE',
      contractType:'INDEX_DIRECTION_15M',
      referenceSource:'CF Benchmarks BRTI',
      referencePriceVerified:false,
      executionReady:false,
      reason:!marketActive?'No active exchange contract':!bookFresh?'No fresh valid order book':'Official BRTI reference price and strategy model not yet validated'
    };
  }
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
        if(now-this.lastDiscoveryAt<15000)return;
        this.lastDiscoveryAt=now;
        // Kalshi lists future windows too; walk bounded pages and select the
        // actually open window using the exchange's open_time and close_time.
        const markets:Market[]=[];
        let cursor='';
        let pages=0;
        do {
          const url=new URL(BASE+'/markets');
          url.searchParams.set('series_ticker','KXBTC15M');
          url.searchParams.set('status','open');
          url.searchParams.set('limit','200');
          url.searchParams.set('min_close_ts',String(Math.floor(now/1000)-60));
          url.searchParams.set('max_close_ts',String(Math.floor(now/1000)+3600));
          if(cursor)url.searchParams.set('cursor',cursor);
          const json=await getJson(url.toString(),controller.signal);
          if(!Array.isArray(json.markets))throw Error('Malformed Kalshi markets response');
          markets.push(...json.markets as Market[]);
          cursor=typeof json.cursor==='string'?json.cursor:'';
          pages++;
        }while(cursor&&pages<5);
        const candidates=markets.map(m=>({
          m,open:Date.parse(m.open_time||''),close:Date.parse(m.close_time||'')
        })).filter(x=>x.m.ticker.startsWith('KXBTC15M-') &&
          Number.isFinite(x.open)&&Number.isFinite(x.close) &&
          x.open<=now && x.close>now+5000
        ).sort((a,b)=>a.close-b.close);
        // Initialized/unopened markets are upcoming schedules, not executable quotes.
        let scheduled=0;
        let nextScheduledOpen:string|null=null;
        if(candidates.length===0) {
          const url=new URL(BASE+'/markets');
          url.searchParams.set('series_ticker','KXBTC15M');
          url.searchParams.set('status','unopened');
          url.searchParams.set('limit','200');
          url.searchParams.set('min_close_ts',String(Math.floor(now/1000)-60));
          url.searchParams.set('max_close_ts',String(Math.floor(now/1000)+3600));
          const scheduledJson=await getJson(url.toString(),controller.signal);
          if(!Array.isArray(scheduledJson.markets))throw Error('Malformed unopened markets response');
          const upcoming=(scheduledJson.markets as Market[])
            .filter(m=>m.status==='initialized'&&m.ticker.startsWith('KXBTC15M-'))
            .map(m=>Date.parse(m.open_time||'')).filter(time=>Number.isFinite(time)&&time>now)
            .sort((a,b)=>a-b);
          scheduled=upcoming.length;
          nextScheduledOpen=upcoming.length?new Date(upcoming[0]).toISOString():null;
        }
        this.diagnostics={pages,returned:markets.length,eligible:candidates.length,
          checkedAt:now,scheduled,nextScheduledOpen,filter:'open (active)'};
        const match=candidates[0]?.m;
        if(!match){this.activeMarket=null;this.lastBook=null;throw Error('No active KXBTC15M market in current window; '+scheduled+' upcoming initialized markets in the next hour. Trading stays paused.');}
        const close=Date.parse(match.close_time!);
        // KXBTC15M settles against the CF Benchmarks RTI comparison.
        // Never invent a strike from Coinbase spot or use the fixed-strike pricer.
        const strike=0;
        if(this.lastTicker && this.lastTicker!==match.ticker) this.onRollover?.(this.lastTicker);
        this.lastTicker=match.ticker;
        this.activeMarket={ticker:match.ticker,title:match.title||match.ticker,
          contractType:'INDEX_DIRECTION_15M',referenceSource:'CF Benchmarks BRTI',
          referencePriceVerified:false,rulesPrimary:match.rules_primary,
          strikePrice:strike,
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
