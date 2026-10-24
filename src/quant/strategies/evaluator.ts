/**
 * Quantitative Strategy Decision Engine
 * Evaluates current market state against documented hypotheses, applies mathematical models,
 * checks all pre-conditions and execution gates, and outputs actionable decisions or explicit abstentions.
 */

import {
  Kalshi15MMarket,
  KalshiOrderBook,
  BTCSpotObservation,
  StrategyDecision,
  StrategyId,
  Position,
  PortfolioRiskState,
} from '../../types/market';
import { calculateBinaryPrice, calculateExpectedNetValue } from '../binaryPricing';
import { analyzeMicrostructure } from '../microstructure';
import { STRATEGY_CATALOG } from './strategyDefinitions';

export interface EvaluationContext {
  market: Kalshi15MMarket;
  book: KalshiOrderBook;
  spot: BTCSpotObservation;
  activePositions: Position[];
  riskState: PortfolioRiskState;
  maxDataAgeMs: number;
  profile?: 'ACTIVE' | 'BALANCED' | 'CONSERVATIVE';
}

export class StrategyEvaluator {
  /**
   * Evaluate Short-Horizon BTC Lead-Lag Scalp Strategy
   * Exploits latency in Kalshi market-maker quote updates following sharp BTC spot momentum.
   */
  public evaluateLeadLagScalp(ctx: EvaluationContext): StrategyDecision {
    const strategy = STRATEGY_CATALOG['BTC-LEADLAG-SCALP'];
    const now = Date.now();
    const timeRemainingSec = ctx.market.settlementTimerSec;
    const profile = ctx.profile || 'ACTIVE';

    const minTimeToExpirySec =
      profile === 'ACTIVE' ? 75 : profile === 'BALANCED' ? 120 : strategy.executionConditions.minTimeToExpirySec;
    const maxSpreadCents =
      profile === 'ACTIVE' ? 2.5 : strategy.executionConditions.maxSpreadCents;

    // Default abstention baseline
    const baseDecision: StrategyDecision = {
      strategyId: 'BTC-LEADLAG-SCALP',
      timestamp: now,
      marketTicker: ctx.market.ticker,
      action: 'ABSTAIN',
      suggestedPrice: 0,
      suggestedQuantity: 0,
      theoreticalProbability: 0.5,
      marketProbability: 0.5,
      edgeCents: 0,
      expectedNetValue: 0,
      uncertaintyEstimate: 0.1,
      rationale: '',
    };

    // Gate 1: Check feed freshness & data quality
    const bookAgeMs = now - ctx.book.timestamp;
    if (bookAgeMs > ctx.maxDataAgeMs) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_DATA_STALE',
        rationale: `Abstain: Kalshi order book age (${bookAgeMs}ms) exceeds max freshness threshold (${ctx.maxDataAgeMs}ms). Stale quotes invalidate latency-sensitive lead-lag scalp.`,
      };
    }

    if (ctx.book.isCrossed || ctx.book.isEmpty) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_BOOK_ANOMALY',
        rationale: 'Abstain: Kalshi order book is crossed or empty. Precluding execution until market maker quotes stabilize.',
      };
    }

    // Gate 2: Expiry window constraints
    if (timeRemainingSec < minTimeToExpirySec) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_TIME_TO_EXPIRY_TOO_SHORT',
        rationale: `Abstain: Contract time to expiry (${timeRemainingSec}s) is below ${minTimeToExpirySec}s minimum. Gamma risk and zero-spread liquidity dry-up prevent clean scalping.`,
      };
    }

    if (timeRemainingSec > strategy.executionConditions.maxTimeToExpirySec) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_TIME_TO_EXPIRY_TOO_LONG',
        rationale: `Abstain: Market just opened (${timeRemainingSec}s remaining). Insufficient price discovery for micro-scalp.`,
      };
    }

    // Gate 3: Microstructure liquidity & spread
    const micro = analyzeMicrostructure(ctx.book, 10);
    if (micro.spreadCents > maxSpreadCents) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_SPREAD_TOO_WIDE',
        edgeCents: 0,
        rationale: `Abstain: Market spread (${micro.spreadCents}¢) exceeds maximum allowable ${maxSpreadCents}¢. Crossing a ${micro.spreadCents}¢ spread eliminates theoretical edge.`,
      };
    }

    // Gate 4: Portfolio risk limits
    if (ctx.riskState.usableHeadroom < 10) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_CAPITAL_INSUFFICIENT',
        rationale: 'Abstain: Usable risk headroom is below required margin for 10 contracts ($10.00).',
      };
    }

    const existingStrategyPosition = ctx.activePositions.find(
      (p) => p.strategyId === 'BTC-LEADLAG-SCALP' && p.status === 'OPEN'
    );
    if (existingStrategyPosition) {
      return {
        ...baseDecision,
        action: 'HOLD',
        rationale: `Hold: Position #${existingStrategyPosition.id.slice(0, 8)} already open. Scalp strategy manages a single high-conviction leg at a time.`,
      };
    }

    // Micro-momentum calculation from spot BTC
    // Return over 15-30s normalized by rolling 15m volatility
    const return30s = ctx.spot.return30s;
    const vol = Math.max(ctx.spot.realizedVol15m, 0.25);
    // 30 seconds as fraction of a year (31,557,600 s)
    const dtYear = 30 / 31557600;
    const std30s = vol * Math.sqrt(dtYear);
    const zScoreMom = return30s / (std30s || 0.0001);

    const zThresh = profile === 'ACTIVE' ? 0.9 : profile === 'BALANCED' ? 1.35 : 1.7;
    const minEdgeCents = profile === 'ACTIVE' ? 1.0 : profile === 'BALANCED' ? 1.5 : strategy.executionConditions.minAlphaEdgeCents;

    // Binary pricing calculation
    const pricer = calculateBinaryPrice({
      spotPrice: ctx.spot.price,
      strikePrice: ctx.market.strikePrice,
      timeToExpirySec: timeRemainingSec,
      annualizedVol: vol,
    });

    // Best available market prices
    const bestYesAsk = ctx.book.yesAsks[0]?.price || 99;
    const bestYesBid = ctx.book.yesBids[0]?.price || 1;
    const bestNoAsk = ctx.book.noAsks[0]?.price || (100 - bestYesBid);

    // Evaluate Long YES setup: strong positive spot momentum (z-score >= zThresh) and Yes Ask lagging fair price
    if (zScoreMom >= zThresh) {
      const fairPriceYesCents = pricer.fairPriceYesCents;
      const nominalEdge = fairPriceYesCents - bestYesAsk;

      // Net EV calculation after taker fees ($0.03 round trip) and 0.4¢ estimated slippage
      const ev = calculateExpectedNetValue(pricer.pYes, bestYesAsk, 10, true, 0.4);

      if (nominalEdge >= minEdgeCents && ev.isPositiveEv) {
        return {
          strategyId: 'BTC-LEADLAG-SCALP',
          timestamp: now,
          marketTicker: ctx.market.ticker,
          action: 'ENTER_YES',
          suggestedPrice: bestYesAsk,
          suggestedQuantity: 10,
          theoreticalProbability: pricer.pYes,
          marketProbability: bestYesAsk / 100,
          edgeCents: ev.edgeCents,
          expectedNetValue: ev.netEvDollars,
          uncertaintyEstimate: pricer.uncertaintyEstimate,
          rationale: `SIGNAL: Long YES @ ${bestYesAsk}¢. Rapid spot BTC upward impulse (+${(return30s * 100).toFixed(2)}%, z=${zScoreMom.toFixed(1)}). Theoretical fair value ${fairPriceYesCents}¢ leads market ask by +${nominalEdge}¢. Net EV after fees = +$${ev.netEvDollars.toFixed(2)}.`,
        };
      } else {
        return {
          ...baseDecision,
          blockedGate: 'GATE_NET_EV_NEGATIVE',
          theoreticalProbability: pricer.pYes,
          marketProbability: bestYesAsk / 100,
          edgeCents: nominalEdge,
          expectedNetValue: ev.netEvDollars,
          rationale: `Abstain: Positive spot momentum observed, but nominal edge (+${nominalEdge}¢) is eaten by Kalshi taker fees ($0.03/contract) and spread. Net EV is non-viable ($${ev.netEvDollars.toFixed(2)}).`,
        };
      }
    }

    // Evaluate Long NO setup: strong negative spot momentum (z-score <= -zThresh)
    if (zScoreMom <= -zThresh) {
      const fairPriceNoCents = pricer.fairPriceNoCents;
      const nominalEdge = fairPriceNoCents - bestNoAsk;
      const ev = calculateExpectedNetValue(pricer.pNo, bestNoAsk, 10, true, 0.4);

      if (nominalEdge >= minEdgeCents && ev.isPositiveEv) {
        return {
          strategyId: 'BTC-LEADLAG-SCALP',
          timestamp: now,
          marketTicker: ctx.market.ticker,
          action: 'ENTER_NO',
          suggestedPrice: bestNoAsk,
          suggestedQuantity: 10,
          theoreticalProbability: pricer.pNo,
          marketProbability: bestNoAsk / 100,
          edgeCents: ev.edgeCents,
          expectedNetValue: ev.netEvDollars,
          uncertaintyEstimate: pricer.uncertaintyEstimate,
          rationale: `SIGNAL: Long NO @ ${bestNoAsk}¢. Rapid spot BTC downward impulse (${(return30s * 100).toFixed(2)}%, z=${zScoreMom.toFixed(1)}). Theoretical fair value NO ${fairPriceNoCents}¢ leads market ask by +${nominalEdge}¢. Net EV = +$${ev.netEvDollars.toFixed(2)}.`,
        };
      } else {
        return {
          ...baseDecision,
          blockedGate: 'GATE_NET_EV_NEGATIVE',
          theoreticalProbability: pricer.pNo,
          marketProbability: bestNoAsk / 100,
          edgeCents: nominalEdge,
          expectedNetValue: ev.netEvDollars,
          rationale: `Abstain: Downward spot momentum observed, but theoretical edge (+${nominalEdge}¢) does not exceed cost buffer. Net EV ($${ev.netEvDollars.toFixed(2)}) is insufficient.`,
        };
      }
    }

    // No momentum trigger
    return {
      ...baseDecision,
      blockedGate: 'GATE_MOMENTUM_THRESHOLD_UNMET',
      theoreticalProbability: pricer.pYes,
      marketProbability: (bestYesAsk + bestYesBid) / 200,
      rationale: `Abstain: BTC spot 30s momentum (z=${zScoreMom.toFixed(2)}) is within normal noise bands (|z| < ${zThresh}). No lead-lag mispricing detected.`,
    };
  }

  /**
   * Evaluate Settlement Skew & Moneyness Mispricing Strategy
   * Exploits deviations between market pricing and Black-Scholes binary settlement probability.
   */
  public evaluateSettlementSkew(ctx: EvaluationContext): StrategyDecision {
    const strategy = STRATEGY_CATALOG['SETTLEMENT-SKEW-DIR'];
    const now = Date.now();
    const timeRemainingSec = ctx.market.settlementTimerSec;
    const profile = ctx.profile || 'ACTIVE';

    const minSkewTimeToExpiry =
      profile === 'ACTIVE' ? 80 : profile === 'BALANCED' ? 150 : strategy.executionConditions.minTimeToExpirySec;
    const minSkewEdge =
      profile === 'ACTIVE' ? 1.8 : profile === 'BALANCED' ? 3.0 : strategy.executionConditions.minAlphaEdgeCents;

    const baseDecision: StrategyDecision = {
      strategyId: 'SETTLEMENT-SKEW-DIR',
      timestamp: now,
      marketTicker: ctx.market.ticker,
      action: 'ABSTAIN',
      suggestedPrice: 0,
      suggestedQuantity: 0,
      theoreticalProbability: 0.5,
      marketProbability: 0.5,
      edgeCents: 0,
      expectedNetValue: 0,
      uncertaintyEstimate: 0.1,
      rationale: '',
    };

    if (timeRemainingSec < minSkewTimeToExpiry) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_TOO_CLOSE_TO_SETTLEMENT',
        rationale: `Abstain: Remaining time (${timeRemainingSec}s) is below ${minSkewTimeToExpiry}s threshold. Directional thesis requires sufficient diffusion window.`,
      };
    }

    const micro = analyzeMicrostructure(ctx.book, 10);
    if (micro.spreadCents > strategy.executionConditions.maxSpreadCents) {
      return {
        ...baseDecision,
        blockedGate: 'GATE_SPREAD_TOO_WIDE',
        rationale: `Abstain: Order book spread (${micro.spreadCents}¢) exceeds 3¢ limit for directional positioning.`,
      };
    }

    const pricer = calculateBinaryPrice({
      spotPrice: ctx.spot.price,
      strikePrice: ctx.market.strikePrice,
      timeToExpirySec: timeRemainingSec,
      annualizedVol: ctx.spot.realizedVol15m,
    });

    const bestYesAsk = ctx.book.yesAsks[0]?.price || 99;
    const bestYesBid = ctx.book.yesBids[0]?.price || 1;
    const bestNoAsk = ctx.book.noAsks[0]?.price || (100 - bestYesBid);

    // Look for underpriced YES contract: model probability > market ask price + edge
    const yesEdge = pricer.fairPriceYesCents - bestYesAsk;
    if (yesEdge >= minSkewEdge) {
      const ev = calculateExpectedNetValue(pricer.pYes, bestYesAsk, 10, true, 0.2);
      if (ev.isPositiveEv) {
        return {
          strategyId: 'SETTLEMENT-SKEW-DIR',
          timestamp: now,
          marketTicker: ctx.market.ticker,
          action: 'ENTER_YES',
          suggestedPrice: bestYesAsk,
          suggestedQuantity: 10,
          theoreticalProbability: pricer.pYes,
          marketProbability: bestYesAsk / 100,
          edgeCents: yesEdge,
          expectedNetValue: ev.netEvDollars,
          uncertaintyEstimate: pricer.uncertaintyEstimate,
          rationale: `SIGNAL: Directional Long YES @ ${bestYesAsk}¢. Objective Black-Scholes probability is ${(pricer.pYes * 100).toFixed(1)}% (${pricer.fairPriceYesCents}¢) vs market offer ${bestYesAsk}¢. Edge: +${yesEdge}¢, Net EV: +$${ev.netEvDollars.toFixed(2)}.`,
        };
      }
    }

    // Look for underpriced NO contract
    const noEdge = pricer.fairPriceNoCents - bestNoAsk;
    if (noEdge >= minSkewEdge) {
      const ev = calculateExpectedNetValue(pricer.pNo, bestNoAsk, 10, true, 0.2);
      if (ev.isPositiveEv) {
        return {
          strategyId: 'SETTLEMENT-SKEW-DIR',
          timestamp: now,
          marketTicker: ctx.market.ticker,
          action: 'ENTER_NO',
          suggestedPrice: bestNoAsk,
          suggestedQuantity: 10,
          theoreticalProbability: pricer.pNo,
          marketProbability: bestNoAsk / 100,
          edgeCents: noEdge,
          expectedNetValue: ev.netEvDollars,
          uncertaintyEstimate: pricer.uncertaintyEstimate,
          rationale: `SIGNAL: Directional Long NO @ ${bestNoAsk}¢. Objective settlement model assigns NO ${(pricer.pNo * 100).toFixed(1)}% (${pricer.fairPriceNoCents}¢) vs market offer ${bestNoAsk}¢. Edge: +${noEdge}¢, Net EV: +$${ev.netEvDollars.toFixed(2)}.`,
        };
      }
    }

    return {
      ...baseDecision,
      blockedGate: 'GATE_EFFICIENT_MARKET_EQUILIBRIUM',
      theoreticalProbability: pricer.pYes,
      marketProbability: (bestYesAsk + bestYesBid) / 200,
      edgeCents: Math.max(yesEdge, noEdge),
      rationale: `Abstain: Market contract pricing is in equilibrium with the settlement model. Maximum discrepancy (${Math.max(yesEdge, noEdge).toFixed(1)}¢) does not exceed friction edge threshold (4.5¢).`,
    };
  }
}
