/**
 * Realistic Kalshi Order Execution Simulator
 *
 * Implements micro-structure realistic execution modeling:
 * - Real executable bid/ask prices (strictly prohibits midpoint fills)
 * - Taker book walking with volume-weighted price slippage
 * - Queue position simulation for limit/maker orders
 * - Realistic latency stages: local compute, network ack, queue dwell, fill receipt
 * - Partial fills, missed fills, rejections, and adverse selection
 * - Exact Kalshi fee calculation with rounding
 */

import {
  KalshiOrderBook,
  Order,
  OrderBookLevel,
  Position,
  StrategyPurpose,
} from '../types/market';
import { calculateKalshiFee } from './binaryPricing';

export interface SimulationResult {
  updatedOrder: Order;
  fillEvent?: {
    orderId: string;
    filledContracts: number;
    fillPriceCents: number;
    feePaidDollars: number;
    timestamp: number;
    isPartial: boolean;
  };
  newPosition?: Position;
  closedPosition?: Position;
  rejectionReason?: string;
  adverseSelectionOccurred: boolean;
  slippageIncurredCents: number;
}

export class KalshiExecutionSimulator {
  private localComputeLatencyRange = [5, 18]; // ms
  private networkAckLatencyRange = [40, 95]; // ms
  private fillProcessingLatencyRange = [20, 50]; // ms
  private adverseSelectionProb = 0.08; // 8% chance toxic flow moves price before fill
  private cancellationRaceProb = 0.05; // 5% chance order cancelled while fill in flight

  private getRandom(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Process order submission through realistic latency, book depth, and state transitions
   */
  public executeOrder(
    order: Order,
    book: KalshiOrderBook,
    existingPositions: Position[]
  ): SimulationResult {
    const now = Date.now();
    const localComputeMs = this.getRandom(
      this.localComputeLatencyRange[0],
      this.localComputeLatencyRange[1]
    );
    const networkAckMs = this.getRandom(
      this.networkAckLatencyRange[0],
      this.networkAckLatencyRange[1]
    );
    const fillLatencyMs = this.getRandom(
      this.fillProcessingLatencyRange[0],
      this.fillProcessingLatencyRange[1]
    );

    // Initial state transition
    const submittedOrder: Order = {
      ...order,
      submittedAt: now + localComputeMs,
      acknowledgedAt: now + localComputeMs + networkAckMs,
      state: 'ACKNOWLEDGED',
      latencyBreakdown: {
        localComputeMs,
        networkAckMs,
        queueDelayMs: 0,
        fillLatencyMs,
      },
    };

    // Rejection Gate 1: Stale or crossed book
    if (book.isCrossed || book.isEmpty) {
      return {
        updatedOrder: {
          ...submittedOrder,
          state: 'REJECTED',
          rejectReason: 'REJECT_MARKET_HALTED_OR_CROSSED',
        },
        rejectionReason: 'Kalshi market is crossed or book has zero liquidity',
        adverseSelectionOccurred: false,
        slippageIncurredCents: 0,
      };
    }

    // Determine relevant order book side
    // For YES BUY: buy from yesAsks
    // For YES SELL: sell to yesBids
    // For NO BUY: buy from noAsks
    // For NO SELL: sell to noBids
    let targetLevels: OrderBookLevel[] = [];
    if (order.side === 'YES') {
      targetLevels = order.action === 'BUY' ? book.yesAsks : book.yesBids;
    } else {
      targetLevels = order.action === 'BUY' ? book.noAsks : book.noBids;
    }

    if (!targetLevels || targetLevels.length === 0) {
      return {
        updatedOrder: {
          ...submittedOrder,
          state: 'REJECTED',
          rejectReason: 'REJECT_NO_LIQUIDITY',
        },
        rejectionReason: 'No opposing liquidity in order book ladder',
        adverseSelectionOccurred: false,
        slippageIncurredCents: 0,
      };
    }

    // Handle Market / Taker Order (Immediate or Cancel style)
    if (order.type === 'MARKET' || (order.type === 'LIMIT' && this.isAggressiveCrossing(order, targetLevels[0].price))) {
      return this.processTakerExecution(submittedOrder, targetLevels, now, existingPositions);
    }

    // Handle Limit / Maker Order (Passive resting order with queue uncertainty)
    return this.processMakerExecution(submittedOrder, targetLevels, now);
  }

  /**
   * Check if a limit order price crosses the current opposite touch
   */
  private isAggressiveCrossing(order: Order, bestOppositePrice: number): boolean {
    if (order.action === 'BUY') {
      return order.price >= bestOppositePrice;
    } else {
      return order.price <= bestOppositePrice;
    }
  }

  /**
   * Process Taker execution by walking the book, computing slippage and partial fills
   */
  private processTakerExecution(
    order: Order,
    levels: OrderBookLevel[],
    currentTime: number,
    existingPositions: Position[]
  ): SimulationResult {
    let desiredContracts = order.quantity - order.filledQuantity;
    const initialBestPrice = levels[0].price;

    // Check for simulated adverse selection (e.g. fast market moves 1¢ away right before your packet arrives)
    const adverseSelectionOccurred = Math.random() < this.adverseSelectionProb;
    let priceOffset = 0;
    if (adverseSelectionOccurred) {
      priceOffset = order.action === 'BUY' ? 1 : -1;
    }

    let totalCost = 0;
    let contractsFilled = 0;

    for (const lvl of levels) {
      const effectiveLevelPrice = Math.min(Math.max(lvl.price + priceOffset, 1), 99);
      // For limit orders crossing spread, respect the limit ceiling/floor
      if (order.type === 'LIMIT') {
        if (order.action === 'BUY' && effectiveLevelPrice > order.price) break;
        if (order.action === 'SELL' && effectiveLevelPrice < order.price) break;
      }

      const availableAtLevel = lvl.quantity;
      const take = Math.min(desiredContracts, availableAtLevel);
      totalCost += take * effectiveLevelPrice;
      contractsFilled += take;
      desiredContracts -= take;

      if (desiredContracts <= 0) break;
    }

    // If zero filled because market slipped past limit price
    if (contractsFilled === 0) {
      return {
        updatedOrder: {
          ...order,
          state: 'CANCELED',
          rejectReason: 'MISSED_FILL_SLIPPED_PAST_LIMIT',
        },
        rejectionReason: 'Market moved past limit price during network transit',
        adverseSelectionOccurred,
        slippageIncurredCents: 1,
      };
    }

    const avgPrice = Math.round((totalCost / contractsFilled) * 10) / 10;
    const slippageCents = Math.abs(avgPrice - initialBestPrice);
    const feePaidDollars = calculateKalshiFee(contractsFilled, true);

    const isFullFill = contractsFilled >= order.quantity;
    const finalState = isFullFill ? 'FILLED' : 'PARTIALLY_FILLED';

    const filledOrder: Order = {
      ...order,
      state: finalState,
      filledQuantity: order.filledQuantity + contractsFilled,
      avgFillPrice: avgPrice,
      feePaid: order.feePaid + feePaidDollars,
      filledAt: currentTime + (order.latencyBreakdown?.networkAckMs || 60) + (order.latencyBreakdown?.fillLatencyMs || 30),
    };

    // Update or create position
    let newPosition: Position | undefined;
    let closedPosition: Position | undefined;

    if (order.action === 'BUY') {
      const purpose: StrategyPurpose =
        order.strategyId === 'BTC-LEADLAG-SCALP' ? 'SCALP' : 'SETTLEMENT_HOLD';

      // Open new position
      newPosition = {
        id: `pos-${Math.random().toString(36).substring(2, 9)}`,
        portfolioId: order.portfolioId,
        marketTicker: order.marketTicker,
        strikePrice: 0, // will be synced with market
        strategyId: order.strategyId,
        purpose,
        side: order.side,
        contracts: contractsFilled,
        entryPrice: avgPrice,
        currentPrice: avgPrice,
        unrealizedPnl: -feePaidDollars,
        realizedPnl: 0,
        totalFees: feePaidDollars,
        entryTimestamp: currentTime,
        targetProfitPrice:
          order.side === 'YES' ? Math.min(avgPrice + 4, 99) : Math.min(avgPrice + 4, 99),
        stopLossPrice:
          order.side === 'YES' ? Math.max(avgPrice - 3, 1) : Math.max(avgPrice - 3, 1),
        trailingStopPrice: Math.max(avgPrice - 2, 1),
        maxFavorableExcursion: 0,
        maxAdverseExcursion: 0,
        thesisInvalidationCondition: 'Adverse price excursion > 3¢ or time decay threshold',
        status: 'OPEN',
      };
    } else {
      // SELL: exit existing position
      const posToClose = existingPositions.find(
        (p) =>
          p.portfolioId === order.portfolioId &&
          p.marketTicker === order.marketTicker &&
          p.side === order.side &&
          p.status === 'OPEN'
      );
      if (posToClose) {
        const grossPnl = ((avgPrice - posToClose.entryPrice) / 100) * contractsFilled;
        const netPnl = grossPnl - posToClose.totalFees - feePaidDollars;

        closedPosition = {
          ...posToClose,
          status: 'CLOSED',
          exitPrice: avgPrice,
          exitTimestamp: currentTime,
          realizedPnl: Math.round(netPnl * 100) / 100,
          totalFees: posToClose.totalFees + feePaidDollars,
          exitReason: 'Order executed exit',
        };
      }
    }

    return {
      updatedOrder: filledOrder,
      fillEvent: {
        orderId: order.id,
        filledContracts: contractsFilled,
        fillPriceCents: avgPrice,
        feePaidDollars,
        timestamp: currentTime,
        isPartial: !isFullFill,
      },
      newPosition,
      closedPosition,
      adverseSelectionOccurred,
      slippageIncurredCents: slippageCents,
    };
  }

  /**
   * Process Maker / Limit passive resting order with realistic queue position
   */
  private processMakerExecution(
    order: Order,
    levels: OrderBookLevel[],
    currentTime: number
  ): SimulationResult {
    // A maker order rests in the book. It does not fill immediately unless a trade matches it.
    // We model queue wait time based on contracts ahead.
    const contractsAhead = levels[0]?.quantity || 15;
    const queueDelayMs = Math.round(contractsAhead * 120); // ~120ms per contract flow rate

    // Simulated probability of fill for passive order touching the BBO
    const touchFillProbability = 0.65;
    const willFill = Math.random() < touchFillProbability;

    if (!willFill) {
      // Order is queued, waiting for matching flow
      return {
        updatedOrder: {
          ...order,
          state: 'QUEUED',
          latencyBreakdown: {
            ...order.latencyBreakdown!,
            queueDelayMs,
          },
        },
        adverseSelectionOccurred: false,
        slippageIncurredCents: 0,
      };
    }

    // Fill occurs after queue delay
    const feePaidDollars = calculateKalshiFee(order.quantity, false); // maker fee is lower ($0.01)
    const filledOrder: Order = {
      ...order,
      state: 'FILLED',
      filledQuantity: order.quantity,
      avgFillPrice: order.price,
      feePaid: feePaidDollars,
      filledAt: currentTime + queueDelayMs,
      latencyBreakdown: {
        ...order.latencyBreakdown!,
        queueDelayMs,
      },
    };

    return {
      updatedOrder: filledOrder,
      fillEvent: {
        orderId: order.id,
        filledContracts: order.quantity,
        fillPriceCents: order.price,
        feePaidDollars,
        timestamp: currentTime + queueDelayMs,
        isPartial: false,
      },
      adverseSelectionOccurred: false,
      slippageIncurredCents: 0,
    };
  }
}
