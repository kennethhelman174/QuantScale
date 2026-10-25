/** Isolated, read-only localhost bridge to the existing Python Kalshi paper dashboard.
 * Never use this transport for order routing, settlement or wallet mutation.
 */
export class PythonPaperBridge {
 private snapshot:Record<string,unknown>|null=null;
 private checkedAt=0;
 private error:string|null='Not checked';
 private fetching=false;
 private timer:ReturnType<typeof setInterval>|null=null;
 start(){if(this.timer)return;void this.poll();this.timer=setInterval(()=>void this.poll(),3000);}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
 async poll(){
  if(this.fetching)return;
  this.fetching=true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),1600);
  try{
   const response=await fetch('http://127.0.0.1:8765/api/live',{signal:controller.signal,
    headers:{Accept:'application/json',Host:'127.0.0.1:8765','Sec-Fetch-Site':'same-origin'}});
   if(!response.ok)throw new Error('Python dashboard HTTP '+response.status);
   const length=Number(response.headers.get('content-length')||'0');
   if(length>110000)throw new Error('Oversized Python snapshot');
   const raw=await response.text();
   if(raw.length>110000)throw new Error('Oversized Python snapshot');
   const data=JSON.parse(raw) as Record<string,unknown>;
   if(!data||typeof data!=='object'||typeof data.execution_id!=='string')throw new Error('Invalid Python execution identity');
   const wall=Number(data.wall_time);
   if(!Number.isFinite(wall)||Math.abs(Date.now()/1000-wall)>12)throw new Error('Python snapshot stale');
   const execution=data.execution;
   const reference=data.reference;
   const metrics=data.metrics;
   const strategic=data.strategy;
   const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
   const wallet=obj(execution);
   const ref=obj(reference);
   const sources=obj(ref.sources);
   const source=obj(sources.kalshi_brti_5hz);
   const counts=obj(obj(metrics).counts);
   const market=obj(data.market);
   const strategy=obj(data.hybrid_manager);
   const allowed={
    timestamp:wall,ticker:typeof data.ticker==='string'?data.ticker:(typeof market.ticker==='string'?market.ticker:null),
    engineMode:typeof data.mode==='string'?data.mode:(data.running===true?'STREAMING PAPER':null),
    modelId:typeof data.model_id==='string'?data.model_id:null,
    strategy:typeof strategic==='string'?strategic:(typeof strategy.policy==='string'?strategy.policy:null),
    executionId:data.execution_id,
    paper:{cash:typeof wallet.cash==='number'?wallet.cash:null,equity:typeof wallet.equity==='number'?wallet.equity:null,
      openPositions:Array.isArray(wallet.positions)?wallet.positions.length:null,dailyHalt:wallet.daily_halt===true},
    brti:{status:typeof source.status==='string'?source.status:null,
      ageSeconds:typeof source.age_seconds==='number'?source.age_seconds:null,
      price:typeof source.price==='number'?source.price:null},
    bookEvents:typeof counts.book_events==='number'?counts.book_events:null,
    staleMessages:typeof counts.stale_messages==='number'?counts.stale_messages:null,
    reconnects:typeof counts.reconnects==='number'?counts.reconnects:null
   };
   this.snapshot=allowed;this.checkedAt=Date.now();this.error=null;
  }catch(e){this.snapshot=null;this.error=String(e);}
  finally{clearTimeout(timeout);this.fetching=false;}
 }
 status(){
  const age=Date.now()-this.checkedAt;
  return {connected:!!this.snapshot&&age<10000,readOnly:true,walletsSeparate:true,
    fresh:!!this.snapshot&&age<10000,ageMs:this.checkedAt?age:null,
    error:this.error,snapshot:this.snapshot&&age<10000?this.snapshot:null};
 }
}
