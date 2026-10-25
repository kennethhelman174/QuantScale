import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paperConsistency } from '../services/paperConsistency';

test('paper consistency passes balanced snapshot',()=>{
 const report=paperConsistency({execution:{initial:1000,cash:1005,equity:1009,total_pnl:9},totals:{closed_trades:3,realized_net:9},quoteFresh:true});
 assert.equal(report.status,'CONSISTENT');
});
test('paper consistency detects conflicting reported P&L',()=>{
 const report=paperConsistency({execution:{initial:1000,cash:1000,equity:999,total_pnl:15},totals:{closed_trades:1,realized_net:-1},quoteFresh:true});
 assert.equal(report.status,'ATTENTION');
});
test('paper consistency does not invent unavailable accounting',()=>{
 const report=paperConsistency({execution:{initial:1000,cash:1000,equity:null,total_pnl:null},totals:{},quoteFresh:false});
 assert.equal(report.status,'INCOMPLETE');
 assert.equal(report.checks[0].status,'UNAVAILABLE');
});
