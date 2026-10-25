import type { PriceSample } from './directionResearch';
/** Unauthenticated BTC/USD observation. No settlement or order decisions. */
export class CoinbaseProxyFeed {
 private samples:PriceSample[]=[];
 private timer:ReturnType<typeof setInterval>|null=null;
 private inFlight=false;
 private error:string|null=null;
 start(){if(this.timer)return;void this.poll();this.timer=setInterval(()=>void this.poll(),10000);}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
 snapshot(){return {samples:[...this.samples],error:this.error,lastSeen:this.samples.at(-1)?.timestamp??null};}
 async poll(){
  if(this.inFlight)return;
  this.inFlight=true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  try {
   const r=await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot',{signal:controller.signal,headers:{accept:'application/json'}});
   if(!r.ok)throw Error('Coinbase HTTP '+r.status);
   const payload=await r.json() as {data?:{base?:string;currency?:string;amount?:string}};
   if(payload.data?.base!=='BTC'||payload.data?.currency!=='USD')throw Error('Unexpected spot market');
   const price=Number(payload.data.amount);
   if(!Number.isFinite(price)||price<=0)throw Error('Invalid spot price');
   const timestamp=Date.now();
   this.samples.push({timestamp,price});
   this.samples=this.samples.filter(s=>s.timestamp>=timestamp-3600000);
   this.error=null;
  }catch(e){this.error=String(e);}
  finally{clearTimeout(timeout);this.inFlight=false;}
 }
}
