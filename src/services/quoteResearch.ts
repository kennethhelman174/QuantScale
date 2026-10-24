import type { KalshiOrderBook } from '../types/market';
type Signal={ticker:string|null;state:string;direction:string;referencePriceVerified:boolean;executionReady:boolean};
type Quote={side:'YES'|'NO';askCents:number;availableContracts:number;grossWinUsd:number;grossLossUsd:number;breakEvenProbability:number;assumedFeeUsd:number;netWinUsd:number;netLossUsd:number};
export function evaluateQuoteResearch(signal:Signal,book:KalshiOrderBook|null,now=Date.now(),feeRate=0.07){
 const base={status:'UNAVAILABLE',reason:'',source:'KALSHI_REST',referenceVerified:false,executionReady:false,
   executable:false,feeModel:'ILLUSTRATIVE ceiling(0.07 * p * (1-p)) per contract in USD; verify Kalshi schedule',
   quantity:1,quotes:[] as Quote[],probabilityEstimate:null as number|null,expectedValueUsd:null as number|null};
 if(!book||book.source!=='KALSHI_REST'||book.isStale||book.isEmpty||now-book.timestamp>12000)
   return {...base,reason:'No fresh, verified exchange REST order book'};
 if(!signal.ticker||signal.ticker!==book.ticker||signal.state!=='OBSERVING')
   return {...base,reason:'Market and proxy research are not synchronized'};
 const quotes:Quote[]=[];
 for(const side of ['YES','NO'] as const){
  const ask=(side==='YES'?book.yesAsks:book.noAsks)[0];
  if(!ask||!Number.isFinite(ask.price)||ask.price<=0||ask.price>=100||ask.quantity<1)continue;
  const price=ask.price/100;
  const fee=Math.ceil(100*feeRate*price*(1-price))/100;
  const total=price+fee;
  if(total>=1)continue;
  quotes.push({side,askCents:ask.price,availableContracts:ask.quantity,
    grossWinUsd:1-price,grossLossUsd:price,assumedFeeUsd:fee,
    netWinUsd:Math.round((1-total)*10000)/10000,
    netLossUsd:Math.round(total*10000)/10000,
    breakEvenProbability:Math.round(total*10000)/10000});
 }
 if(!quotes.length)return {...base,reason:'No usable ask liquidity in both-sided exchange book'};
 return {...base,status:'QUOTED',reason:'Read-only entry quotes; direction proxy is not a calibrated probability',
   referenceVerified:false,executionReady:false,executable:false,quotes};
}
