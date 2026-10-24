/**
 * Strategy Hypotheses and Detailed Institutional Documentation
 * Fulfills Section 2 of requirements: every strategy explicitly states rationale,
 * information required, duration, execution constraints, costs, invalidation, and evidence needed.
 */

import { StrategyHypothesis } from '../../types/market';

export const STRATEGY_CATALOG: Record<string, StrategyHypothesis> = {
  'BTC-LEADLAG-SCALP': {
    strategyId: 'BTC-LEADLAG-SCALP',
    name: 'BTC Cross-Venue Lead-Lag Scalp',
    rationale:
      'Kalshi automated market-maker bots update binary quotes with a 1.5s to 6.0s diffusion lag following sudden spot momentum (>0.12% return in 15 seconds on Coinbase/Binance). When the underlying spot index moves rapidly, the theoretical probability moves immediately, leaving resting stale limit orders in the Kalshi book that can be lifted with positive expected value.',
    informationRequired: [
      'Sub-second BTC spot reference price stream (Coinbase/Binance composite)',
      '15s and 30s rolling spot momentum (z-score normalized)',
      'Real-time Kalshi Level 2 book (top 3 bids/asks and queue depth)',
      'Current contract strike price and remaining expiry time',
      'Historical fill latency statistics on the Kalshi execution adapter',
    ],
    expectedDuration: '30 seconds to 180 seconds (sub-3 minute scalp exit)',
    executionConditions: {
      maxSpreadCents: 2,
      minTopDepthContracts: 20,
      minTimeToExpirySec: 180, // >= 3 minutes to avoid chaotic zero-gamma boundary
      maxTimeToExpirySec: 840, // <= 14 minutes
      minAlphaEdgeCents: 2.5,
    },
    expectedCostsAndDownside:
      'Taker fee ($0.015/contract entry + $0.015 exit = $0.03 total), potential slippage of 1¢ if walking depth. Downside is immediate adverse spot reversal: hard stop-loss triggered at -3¢ or 120s time-stop.',
    invalidationConditions: [
      'Spot BTC reverses >0.08% within 15 seconds of entry',
      'Kalshi market spread widens beyond 3¢',
      'Time to expiry drops below 90 seconds without reaching profit target',
      'Order fill was delayed >350ms, eliminating the informational lead',
    ],
    evidenceNeeded:
      'Statistically significant positive expectancy (t-stat > 2.5 on net P&L after fees across >= 120 historical out-of-sample events with latency simulation).',
    isActive: true,
  },

  'SETTLEMENT-SKEW-DIR': {
    strategyId: 'SETTLEMENT-SKEW-DIR',
    name: 'Settlement Skew & Moneyness Mispricing',
    rationale:
      'Binary prediction contracts frequently suffer from behavioral pricing distortions: participants overpay for out-of-the-money lottery contracts (longshot bias) and underprice deep in-the-money drift during trending regimes. By computing the exact Black-Scholes binary option price Φ(d2) with calibrated realized volatility, we detect systematic mispricings where market prices deviate from the objective settlement probability by more than spread + fees.',
    informationRequired: [
      'Underlying BTC spot index and official Kalshi settlement definition',
      'Rolling 15m and 1h realized volatility calibrated from 1-minute close prices',
      'Precise seconds to expiration (tau)',
      'Kalshi order book bids/asks and volume profile',
      'Macro volatility regime indicator (calm vs stressed)',
    ],
    expectedDuration: '3 minutes to 15 minutes (may hold into official settlement payoff)',
    executionConditions: {
      maxSpreadCents: 3,
      minTopDepthContracts: 15,
      minTimeToExpirySec: 240, // at least 4 mins
      maxTimeToExpirySec: 880,
      minAlphaEdgeCents: 4.5,
    },
    expectedCostsAndDownside:
      'Entry taker fee $0.015/contract. If held to settlement: $0 exit fee (settlement payout $1.00 is fee-free on settlement side). Downside: contract expires worthless (100% loss of entry price). Volatility-aware stop triggers if d2 drops below -1.65.',
    invalidationConditions: [
      'Spot BTC crosses the strike price in the unfavorable direction by more than 0.25%',
      'Calculated settlement probability drops below 30% for YES or below 30% for NO',
      'Realized volatility doubles during the trade, increasing settlement dispersion beyond acceptable risk parameters',
    ],
    evidenceNeeded:
      'Walk-forward Brier score superior to market-implied probability (Brier < 0.18) and positive Sharpe ratio (> 1.4) across at least 250 forward paper sessions.',
    isActive: true,
  },

  'VOL-RANGE-REVERSAL': {
    strategyId: 'VOL-RANGE-REVERSAL',
    name: 'Near-Expiry Range Exhaustion',
    rationale:
      'In the final 5 minutes of a 15-minute contract, if spot BTC has made an extended move of >1.8 standard deviations from its 15-minute VWAP but remains outside the strike barrier, the probability of reaching the strike drops exponentially due to time decay (theta). When retail participants bid up out-of-the-money contracts expecting a last-minute breakout, selling that side or buying the defensive side captures accelerated theta decay.',
    informationRequired: [
      'Intra-market 15m VWAP and standard deviation bands',
      'Distance from spot to strike in volatility units: (Spot - Strike) / (sigma * sqrt(tau))',
      'Kalshi order book depth and recent trade prints',
      'Underlying spot order flow delta',
    ],
    expectedDuration: '2 minutes to 5 minutes',
    executionConditions: {
      maxSpreadCents: 2,
      minTopDepthContracts: 20,
      minTimeToExpirySec: 120, // 2 to 5 mins remaining
      maxTimeToExpirySec: 360,
      minAlphaEdgeCents: 3.5,
    },
    expectedCostsAndDownside:
      'Round-trip fee $0.03. Downside: unexpected late-stage gamma spike breaking the barrier. Stop loss enforced at 4¢ adverse tick move.',
    invalidationConditions: [
      'Spot BTC breaks beyond 2.2 standard deviations towards strike',
      'Accelerating volume spike on underlying spot spot exchanges (>3x 5m average)',
    ],
    evidenceNeeded:
      'Validated win rate > 68% and profit factor > 1.6 in out-of-sample paper testing with adverse selection modeling.',
    isActive: true,
  },

  'PASSIVE-MAKER-BENCHMARK': {
    strategyId: 'PASSIVE-MAKER-BENCHMARK',
    name: 'Passive Inside-Spread Market Maker (Benchmark)',
    rationale:
      'Acts as the control benchmark. Quotes inside the 1¢-2¢ spread to capture the bid-ask spread while paying maker fees ($0.01) instead of taker fees ($0.015). Demonstrates whether active quantitative strategies actually generate alpha over simple passive market making.',
    informationRequired: ['Kalshi BBO (best bid/offer)', 'Queue depth at inside price'],
    expectedDuration: '1 to 5 minutes',
    executionConditions: {
      maxSpreadCents: 3,
      minTopDepthContracts: 10,
      minTimeToExpirySec: 300,
      maxTimeToExpirySec: 850,
      minAlphaEdgeCents: 1.0,
    },
    expectedCostsAndDownside: 'Maker fee $0.01/contract. High adverse selection risk.',
    invalidationConditions: ['Inventory exceeds 20 contracts on one side'],
    evidenceNeeded: 'Used strictly as comparison baseline.',
    isActive: false,
  },
};
