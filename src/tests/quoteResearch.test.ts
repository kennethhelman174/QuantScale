import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateQuoteResearch} from '../services/quoteResearch';
import {parseKalshiBook} from '../services/kalshiPublicFeed';
const ticker='KXBTC15M-TEST';
const signal={ticker,state:'OBSERVING',direction:'UP',referencePriceVerified:false,executionReady:false};
const time=1800000000000;
const book=parseKalshiBook(ticker,{orderbook_fp:{yes_dollars:[['0.42','5']],no_dollars:[['0.55','8']]}},time);
describe('Read-only Kalshi quote research',()=>{
 it('rejects stale, simulated, or mismatched books',()=>{
  assert.equal(evaluateQuoteResearch(signal,book,time+13000).status,'UNAVAILABLE');
  assert.equal(evaluateQuoteResearch({...signal,ticker:'BAD'},book,time).status,'UNAVAILABLE');
  assert.equal(evaluateQuoteResearch(signal,{...book,source:'SIMULATOR'},time).status,'UNAVAILABLE');
 });
 it('calculates break-even without a fabricated predictive probability',()=>{
  const r=evaluateQuoteResearch(signal,book,time);
  assert.equal(r.status,'QUOTED');
  assert.equal(r.quotes[0].side,'YES');
  assert.equal(r.quotes[0].askCents,45);
  assert.equal(r.quotes[0].assumedFeeUsd,0.02);
  assert.equal(r.quotes[0].breakEvenProbability,0.47);
  assert.equal(r.probabilityEstimate,null);
  assert.equal(r.expectedValueUsd,null);
  assert.equal(r.executionReady,false);
 });
});
