import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCalibration} from '../services/probabilityCalibration';
describe('Probability calibration safety gate',()=>{
 it('does not claim readiness without historical labeled predictions',()=>{
  const r=evaluateCalibration([]);
  assert.equal(r.sampleCount,0);
  assert.equal(r.probabilityEstimate,null);
  assert.equal(r.modelReady,false);
  assert.equal(r.brierScore,null);
 });
 it('scores only unique official exchange-labeled predictions',()=>{
  const row={ticker:'KXBTC15M-T1',predictedYes:0.8,outcome:'yes' as const,timestamp:1,source:'OFFICIAL_KALSHI' as const};
  const r=evaluateCalibration([row,row]);
  assert.equal(r.sampleCount,1);
  assert.ok(Math.abs((r.brierScore??0)-0.04)<1e-10);
  assert.equal(r.modelReady,false);
 });
});
