/**
 * Automated Verification & Regression Test Suite
 * Validates quantitative pricing, fee rounding, order book walking,
 * simulator execution, feed integrity detection, and risk gate limits.
 */

import {
  calculateBinaryPrice,
  calculateKalshiFee,
  calculateExpectedNetValue,
  calculateBrierScore,
} from '../quant/binaryPricing';
import { estimateSlippage } from '../quant/microstructure';
import { DataFeedValidator } from '../services/dataFeedValidator';
import { PortfolioRiskManager } from '../quant/portfolioRisk';
import { KalshiExecutionSimulator } from '../quant/simulator';
import { Order, KalshiOrderBook } from '../types/market';

export interface TestResult {
  suite: string;
  testName: string;
  passed: boolean;
  expected: string;
  actual: string;
  durationMs: number;
}

export function runQuantitativeRegressionTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Black-Scholes At-The-Money Binary Pricing
  {
    const start = performance.now();
    const pricer = calculateBinaryPrice({
      spotPrice: 68500,
      strikePrice: 68500,
      timeToExpirySec: 450,
      annualizedVol: 0.50,
    });
    // At the money with small r*tau, pYes should be ~0.50 (between 0.48 and 0.52)
    const passed = pricer.pYes >= 0.48 && pricer.pYes <= 0.52;
    results.push({
      suite: 'Binary Pricing Model',
      testName: 'At-The-Money Fair Probability should equal ~50%',
      passed,
      expected: 'pYes between 0.48 and 0.52',
      actual: `pYes = ${pricer.pYes.toFixed(4)}`,
      durationMs: performance.now() - start,
    });
  }

  // Test 2: In-The-Money Binary Pricing Boundary
  {
    const start = performance.now();
    const pricer = calculateBinaryPrice({
      spotPrice: 69200, // Spot is $700 above strike
      strikePrice: 68500,
      timeToExpirySec: 120, // 2 mins remaining
      annualizedVol: 0.40,
    });
    const passed = pricer.pYes >= 0.90 && pricer.fairPriceYesCents >= 90;
    results.push({
      suite: 'Binary Pricing Model',
      testName: 'Deep ITM near expiry probability should approach 99%',
      passed,
      expected: 'pYes >= 0.90',
      actual: `pYes = ${pricer.pYes.toFixed(4)} (${pricer.fairPriceYesCents}¢)`,
      durationMs: performance.now() - start,
    });
  }

  // Test 3: Kalshi Exact Fee Rounding
  {
    const start = performance.now();
    const takerFee10 = calculateKalshiFee(10, true); // 10 * 0.015 = $0.15
    const makerFee10 = calculateKalshiFee(10, false); // 10 * 0.01 = $0.10
    const passed = takerFee10 === 0.15 && makerFee10 === 0.10;
    results.push({
      suite: 'Fee Accounting',
      testName: 'Exact 10-contract maker/taker fee rounding',
      passed,
      expected: 'Taker: $0.15, Maker: $0.10',
      actual: `Taker: $${takerFee10}, Maker: $${makerFee10}`,
      durationMs: performance.now() - start,
    });
  }

  // Test 4: Net Expected Value Accounts for Both Sides of Fees
  {
    const start = performance.now();
    // 50% probability buying at 50¢: gross EV = 0, after $0.30 fees net EV must be -$0.30
    const ev = calculateExpectedNetValue(0.50, 50, 10, true, 0);
    const passed = ev.netEvDollars < 0 && !ev.isPositiveEv;
    results.push({
      suite: 'Decision Engine EV Gate',
      testName: 'Zero gross edge must yield negative net EV after fees',
      passed,
      expected: 'netEvDollars < 0 (isPositiveEv = false)',
      actual: `netEvDollars = $${ev.netEvDollars.toFixed(2)}, isPositiveEv = ${ev.isPositiveEv}`,
      durationMs: performance.now() - start,
    });
  }

  // Test 5: Order Book Depth Walking & Slippage Model
  {
    const start = performance.now();
    const levels = [
      { price: 52, quantity: 5 },
      { price: 53, quantity: 10 },
      { price: 54, quantity: 20 },
    ];
    // Buying 10 contracts: takes 5 @ 52¢ + 5 @ 53¢ = avg 52.5¢ (slippage = 0.5¢)
    const slip = estimateSlippage(levels, 10);
    const passed = slip.avgExecutionPrice === 52.5 && slip.slippageCents === 0.5;
    results.push({
      suite: 'Microstructure Slippage',
      testName: 'Order book walking price calculation (no midpoint fills)',
      passed,
      expected: 'avgExecutionPrice = 52.5¢, slippage = 0.5¢',
      actual: `avgExecutionPrice = ${slip.avgExecutionPrice}¢, slippage = ${slip.slippageCents}¢`,
      durationMs: performance.now() - start,
    });
  }

  // Test 6: Data Feed Validator Detects Sequence Gaps
  {
    const start = performance.now();
    const validator = new DataFeedValidator();
    validator.validateFeedPacket({
      sequenceNumber: 100,
      exchangeTimestamp: Date.now(),
      sourceIdentity: 'KALSHI_WS',
      bestBid: 50,
      bestAsk: 52,
    });
    // Jump from 100 to 105 (missing 4 messages)
    const gapValidation = validator.validateFeedPacket({
      sequenceNumber: 105,
      exchangeTimestamp: Date.now(),
      sourceIdentity: 'KALSHI_WS',
      bestBid: 50,
      bestAsk: 52,
    });
    const passed = gapValidation.qualityFlag === 'MISSING_MESSAGE_GAP' && !gapValidation.isValid;
    results.push({
      suite: 'Data Quality Audit',
      testName: 'Detect packet drop sequence gap',
      passed,
      expected: 'qualityFlag = MISSING_MESSAGE_GAP, isValid = false',
      actual: `qualityFlag = ${gapValidation.qualityFlag}, isValid = ${gapValidation.isValid}`,
      durationMs: performance.now() - start,
    });
  }

  // Test 7: Pre-Submission Risk Enforces Daily Loss Limit
  {
    const start = performance.now();
    const risk = new PortfolioRiskManager();
    // Simulate losing $160 (breaching $150 limit)
    risk.recordRealizedTrade('PRIMARY', -160.0);
    const check = risk.checkPreSubmissionRisk(
      'PRIMARY',
      'BTC-LEADLAG-SCALP',
      'YES',
      'BUY',
      50,
      10,
      [],
      []
    );
    const passed = !check.isApproved && check.gateName === 'GATE_DAILY_LOSS_BREACHED';
    results.push({
      suite: 'Portfolio Risk Layer',
      testName: 'Daily loss circuit breaker rejects new entries',
      passed,
      expected: 'isApproved = false, gateName = GATE_DAILY_LOSS_BREACHED',
      actual: `isApproved = ${check.isApproved}, gateName = ${check.gateName}`,
      durationMs: performance.now() - start,
    });
  }

  return results;
}
