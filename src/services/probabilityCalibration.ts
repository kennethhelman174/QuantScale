/** A calibration gate, not a fitted forecasting model. Historical labels must be official. */
export type LabeledPrediction={ticker:string;predictedYes:number;outcome:'yes'|'no';timestamp:number;source:'OFFICIAL_KALSHI'};
export function evaluateCalibration(rows:LabeledPrediction[],minimum=100){
 const unique=new Map<string,LabeledPrediction>();
 for(const row of rows){
  if(row.source!=='OFFICIAL_KALSHI'||!Number.isFinite(row.predictedYes)||row.predictedYes<=0||row.predictedYes>=1)continue;
  if(!unique.has(row.ticker))unique.set(row.ticker,row);
 }
 const data=[...unique.values()].sort((a,b)=>a.timestamp-b.timestamp);
 const n=data.length;
 const brier=n?data.reduce((sum,x)=>sum+(x.predictedYes-(x.outcome==='yes'?1:0))**2,0)/n:null;
 const baseline=n?data.reduce((sum,x)=>sum+(0.5-(x.outcome==='yes'?1:0))**2,0)/n:null;
 return {status:n>=minimum?'SAMPLE_SIZE_MET':'INSUFFICIENT_HISTORY',modelReady:false,
  sampleCount:n,minimumSampleCount:minimum,brierScore:brier,baselineBrierScore:baseline,
  officialOutcomesOnly:true,walkForwardValidated:false,calibrated:false,
  probabilityEstimate:null,reason:'No trained, out-of-sample validated probability model yet'};
}
