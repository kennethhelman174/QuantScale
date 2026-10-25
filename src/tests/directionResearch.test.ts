import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateWindowDirection} from '../services/directionResearch';
const t=1800000000000;
const market={ticker:'KXBTC15M-TEST',openTimestamp:t,closeTimestamp:t+900000,contractType:'INDEX_DIRECTION_15M'};
describe('Read-only 15m spot proxy',()=>{
 it('requires an opening reference sample and a fresh current sample',()=>{
  assert.equal(evaluateWindowDirection(market,[{timestamp:t+60000,price:70000}],t+60000).state,'INSUFFICIENT_DATA');
  assert.equal(evaluateWindowDirection(market,[{timestamp:t,price:70000},{timestamp:t+10000,price:70010},{timestamp:t+20000,price:70020}],t+60000).state,'INSUFFICIENT_DATA');
 });
 it('computes only Coinbase proxy direction and never verifies settlement',()=>{
  const r=evaluateWindowDirection(market,[{timestamp:t,price:70000},{timestamp:t+10000,price:70010},{timestamp:t+20000,price:70020}],t+25000);
  assert.equal(r.direction,'UP');
  assert.equal(r.changeUsd,20);
  assert.equal(r.referencePriceVerified,false);
  assert.equal(r.executionReady,false);
  assert.equal(r.settlementReady,false);
 });
 it('rejects windows outside their exchange contract time',()=>{
  assert.equal(evaluateWindowDirection(market,[],t+900000).state,'OUTSIDE_WINDOW');
 });
});
