import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseKalshiBook } from '../services/kalshiPublicFeed';

describe('Kalshi real REST book parser', () => {
  it('derives each ASK from the opposing exchange bid, never synthesizes size', () => {
    const book = parseKalshiBook('KXBTC15M-TEST', {orderbook_fp:{
      yes_dollars:[['0.4200','12.00'],['0.4000','5.00']],
      no_dollars:[['0.5500','8.00'],['0.5100','3.00']],
    }}, 1700000000000);
    assert.equal(book.source,'KALSHI_REST');
    assert.equal(book.yesBids[0].price,42);
    assert.equal(book.yesAsks[0].price,45);
    assert.equal(book.noAsks[0].price,58);
    assert.equal(book.yesAsks[0].quantity,8);
    assert.equal(book.spread,3);
    assert.equal(book.isStale,false);
  });
  it('fails closed on malformed or empty exchange data', () => {
    assert.throws(()=>parseKalshiBook('X',{}));
    const empty=parseKalshiBook('X',{orderbook_fp:{yes_dollars:[],no_dollars:[]}});
    assert.equal(empty.isStale,true);
    assert.equal(empty.isEmpty,true);
    assert.throws(()=>parseKalshiBook('X',{orderbook_fp:{yes_dollars:[['1.5','3']],no_dollars:[]}}));
  });
});
