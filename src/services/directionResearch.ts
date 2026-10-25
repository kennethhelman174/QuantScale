/** Research-only BTC/USD proxy. NOT CF Benchmarks BRTI or a trade recommendation. */
export type PriceSample={timestamp:number;price:number};
export function evaluateWindowDirection(market:{ticker:string;openTimestamp:number;closeTimestamp:number;contractType?:string}|null,samples:PriceSample[],now:number=Date.now()){
 const base={ticker:market?.ticker??null,source:'SPOT_PROXY_NOT_BRTI',referencePriceVerified:false,
   executionReady:false,settlementReady:false,state:'INSUFFICIENT_DATA',direction:'UNAVAILABLE',
   openingPrice:null as number|null,currentPrice:null as number|null,changeUsd:null as number|null};
 if(!market||market.contractType!=='INDEX_DIRECTION_15M')return base;
 if(now<market.openTimestamp||now>=market.closeTimestamp)return {...base,state:'OUTSIDE_WINDOW'};
 const valid=samples.filter(s=>Number.isFinite(s.price)&&s.price>0&&Number.isFinite(s.timestamp)&&s.timestamp<=now);
 const opening=valid.find(s=>Math.abs(s.timestamp-market.openTimestamp)<=15000);
 const latest=valid.at(-1);
 if(!opening||!latest||valid.length<3||now-latest.timestamp>15000)return base;
 const change=Math.round((latest.price-opening.price)*100)/100;
 return {...base,state:'OBSERVING',openingPrice:opening.price,currentPrice:latest.price,
   changeUsd:change,direction:change>0?'UP':change<0?'DOWN':'FLAT'};
}
