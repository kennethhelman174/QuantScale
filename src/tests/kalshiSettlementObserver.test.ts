import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficialSettlement,KalshiSettlementObserver } from '../services/kalshiSettlementObserver';

describe('Exchange-confirmed settlement observer',()=>{
 const ticker='KXBTC15M-26OCT24-T1630';
 it('never treats a closed or pending market as officially settled',()=>{
   assert.equal(parseOfficialSettlement(ticker,{market:{ticker,status:'closed',result:'yes'}}).state,'PENDING');
   assert.equal(parseOfficialSettlement(ticker,{market:{ticker,status:'settled',result:''}}).state,'PENDING');
 });
 it('accepts exchange-final yes or no only on the exact matching ticker',()=>{
   const result=parseOfficialSettlement(ticker,{market:{ticker,status:'settled',result:'yes'}});
   assert.equal(result.state,'CONFIRMED');
   assert.equal(result.result,'yes');
   assert.throws(()=>parseOfficialSettlement(ticker,{market:{ticker:'WRONG',status:'settled',result:'yes'}}));
 });
 it('does not manufacture payouts or account balance changes',()=>{
   const observer=new KalshiSettlementObserver();
   observer.track(ticker);
   const state=observer.list()[0];
   assert.equal(state.state,'PENDING');
   assert.equal(state.result,null);
 });
});
