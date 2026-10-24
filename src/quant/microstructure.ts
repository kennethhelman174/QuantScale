/**
 * Market Microstructure and Order Book Analytics for Kalshi BTC 15-Minute Markets
 */

import { KalshiOrderBook, OrderBookLevel } from '../types/market';

export interface MicrostructureMetrics {
  spreadCents: number;
  midCents: number;
  microPriceCents: number;
  imbalanceRatio: number; // -1 (pure ask pressure) to +1 (pure bid pressure)
  topBidQty: number;
  topAskQty: number;
  depth3LevelsBid: number;
  depth3LevelsAsk: number;
  isLiquiditySufficient: boolean;
  isSpreadTight: boolean;
  adverseSelectionRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedQueueWaitSeconds: number;
}

/**
 * Compute detailed microstructure metrics from a Kalshi order book
 */
export function analyzeMicrostructure(
  book: KalshiOrderBook,
  targetSizeContracts = 10
): MicrostructureMetrics {
  const bestBid = book.yesBids[0]?.price || 0;
  const bestAsk = book.yesAsks[0]?.price || 100;
  const spreadCents = Math.max(bestAsk - bestBid, 1);
  const midCents = (bestBid + bestAsk) / 2;

  const topBidQty = book.yesBids[0]?.quantity || 0;
  const topAskQty = book.yesAsks[0]?.quantity || 0;

  // Imbalance between top-of-book quantities
  const totalTopQty = topBidQty + topAskQty;
  const imbalanceRatio = totalTopQty > 0 ? (topBidQty - topAskQty) / totalTopQty : 0;

  // Micro-price (weighted mid-price by opposite-side depth)
  const microPriceCents =
    totalTopQty > 0
      ? (topBidQty * bestAsk + topAskQty * bestBid) / totalTopQty
      : midCents;

  // Aggregate depth across top 3 levels
  const depth3LevelsBid = book.yesBids
    .slice(0, 3)
    .reduce((sum, lvl) => sum + lvl.quantity, 0);
  const depth3LevelsAsk = book.yesAsks
    .slice(0, 3)
    .reduce((sum, lvl) => sum + lvl.quantity, 0);

  const isLiquiditySufficient =
    topBidQty >= targetSizeContracts && topAskQty >= targetSizeContracts;
  const isSpreadTight = spreadCents <= 2; // In prediction markets 1-2¢ is tight

  // Adverse selection risk is elevated when imbalance is heavily skewed against your side
  let adverseSelectionRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (Math.abs(imbalanceRatio) > 0.65) {
    adverseSelectionRisk = 'HIGH';
  } else if (Math.abs(imbalanceRatio) > 0.35) {
    adverseSelectionRisk = 'MEDIUM';
  }

  // Estimated queue wait time in seconds for maker orders (assuming ~5-15 contracts/min flow)
  const arrivalRatePerSec = 0.25; // ~15 contracts/min
  const estimatedQueueWaitSeconds = Math.round(
    Math.max(topBidQty, topAskQty) / arrivalRatePerSec
  );

  return {
    spreadCents,
    midCents: Math.round(midCents * 10) / 10,
    microPriceCents: Math.round(microPriceCents * 10) / 10,
    imbalanceRatio: Math.round(imbalanceRatio * 100) / 100,
    topBidQty,
    topAskQty,
    depth3LevelsBid,
    depth3LevelsAsk,
    isLiquiditySufficient,
    isSpreadTight,
    adverseSelectionRisk,
    estimatedQueueWaitSeconds,
  };
}

/**
 * Simulate walking the order book to estimate realistic execution price for a market/taker order
 */
export function estimateSlippage(
  levels: OrderBookLevel[],
  desiredContracts: number
): {
  avgExecutionPrice: number;
  slippageCents: number;
  isFullyFilled: boolean;
  filledContracts: number;
} {
  if (!levels || levels.length === 0) {
    return {
      avgExecutionPrice: 0,
      slippageCents: 99,
      isFullyFilled: false,
      filledContracts: 0,
    };
  }

  const topPrice = levels[0].price;
  let remaining = desiredContracts;
  let totalCost = 0;
  let filled = 0;

  for (const lvl of levels) {
    const take = Math.min(remaining, lvl.quantity);
    totalCost += take * lvl.price;
    filled += take;
    remaining -= take;
    if (remaining <= 0) break;
  }

  const avgExecutionPrice = filled > 0 ? totalCost / filled : topPrice;
  const slippageCents = Math.max(0, Math.abs(avgExecutionPrice - topPrice));

  return {
    avgExecutionPrice: Math.round(avgExecutionPrice * 100) / 100,
    slippageCents: Math.round(slippageCents * 100) / 100,
    isFullyFilled: filled >= desiredContracts,
    filledContracts: filled,
  };
}

/**
 * Validate book integrity and detect anomalies
 */
export function validateOrderBookIntegrity(book: KalshiOrderBook): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!book.yesBids || book.yesBids.length === 0) {
    errors.push('Empty YES bids ladder');
  }
  if (!book.yesAsks || book.yesAsks.length === 0) {
    errors.push('Empty YES asks ladder');
  }

  const bestBid = book.yesBids[0]?.price;
  const bestAsk = book.yesAsks[0]?.price;

  if (bestBid !== undefined && bestAsk !== undefined) {
    if (bestBid >= bestAsk) {
      errors.push(`Crossed book detected: Best Bid (${bestBid}¢) >= Best Ask (${bestAsk}¢)`);
    }
    if (bestBid < 1 || bestBid > 99) {
      errors.push(`Bid price outside valid range [1, 99]: ${bestBid}`);
    }
    if (bestAsk < 1 || bestAsk > 99) {
      errors.push(`Ask price outside valid range [1, 99]: ${bestAsk}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
