/**
 * Shared Portfolio Risk Management Layer
 *
 * Enforces pre-submission risk checks, capital reservation, max directional delta,
 * daily loss circuit breakers, and isolates independent experimental portfolios.
 */

import {
  PortfolioRiskState,
  Position,
  Order,
  RiskLimitsConfig,
  StrategyId,
} from '../types/market';

export interface StrategyAllocationRule {
  strategyId: StrategyId;
  maxCapitalAllocation: number; // USD
  maxConcurrentContracts: number;
  maxDrawdownBudget: number; // USD
}

export const DEFAULT_RISK_LIMITS: RiskLimitsConfig = {
  maxPositionContracts: 10,
  maxPortfolioContracts: 50,
  maxGrossCapitalAtRisk: 1000.0, // USD
  maxDailyLoss: 150.0, // USD circuit breaker
  maxDrawdownPct: 15.0, // 15% circuit breaker
  maxDataAgeMs: 2500, // Stale feed threshold
  maxSlippageCents: 2.0,
  reconciliationFailThreshold: 1,
};

export const STRATEGY_ALLOCATIONS: Record<StrategyId, StrategyAllocationRule> = {
  'BTC-LEADLAG-SCALP': {
    strategyId: 'BTC-LEADLAG-SCALP',
    maxCapitalAllocation: 400.0,
    maxConcurrentContracts: 20,
    maxDrawdownBudget: 60.0,
  },
  'SETTLEMENT-SKEW-DIR': {
    strategyId: 'SETTLEMENT-SKEW-DIR',
    maxCapitalAllocation: 600.0,
    maxConcurrentContracts: 30,
    maxDrawdownBudget: 90.0,
  },
  'VOL-RANGE-REVERSAL': {
    strategyId: 'VOL-RANGE-REVERSAL',
    maxCapitalAllocation: 300.0,
    maxConcurrentContracts: 15,
    maxDrawdownBudget: 45.0,
  },
  'PASSIVE-MAKER-BENCHMARK': {
    strategyId: 'PASSIVE-MAKER-BENCHMARK',
    maxCapitalAllocation: 200.0,
    maxConcurrentContracts: 10,
    maxDrawdownBudget: 30.0,
  },
};

export interface RiskCheckResult {
  isApproved: boolean;
  blockedReason?: string;
  gateName?: string;
  adjustedQuantity?: number;
}

export class PortfolioRiskManager {
  private limits: RiskLimitsConfig;
  private portfolios: Map<string, PortfolioRiskState> = new Map();
  private isEmergencyPaused = false;

  constructor(initialLimits: RiskLimitsConfig = DEFAULT_RISK_LIMITS) {
    this.limits = { ...initialLimits };

    // Initialize Primary Portfolio
    this.portfolios.set('PRIMARY', {
      portfolioId: 'PRIMARY',
      name: 'Primary Trading Portfolio',
      isPrimary: true,
      cashBalance: 2500.0,
      equity: 2500.0,
      reservedCapital: 0.0,
      usableHeadroom: 2500.0,
      netDirectionalDelta: 0,
      grossExposure: 0.0,
      dailyRealizedPnl: 0.0,
      dailyPeakEquity: 2500.0,
      currentDrawdownPct: 0.0,
      riskBudgetRemaining: initialLimits.maxDailyLoss,
      openPositionsCount: 0,
      openOrdersCount: 0,
    });

    // Initialize Independent Research Paper Portfolios
    this.portfolios.set('EXP_SCALP_V1', {
      portfolioId: 'EXP_SCALP_V1',
      name: 'Research: BTC Lead-Lag Scalper (v1.2)',
      isPrimary: false,
      cashBalance: 1000.0,
      equity: 1000.0,
      reservedCapital: 0.0,
      usableHeadroom: 1000.0,
      netDirectionalDelta: 0,
      grossExposure: 0.0,
      dailyRealizedPnl: 0.0,
      dailyPeakEquity: 1000.0,
      currentDrawdownPct: 0.0,
      riskBudgetRemaining: 75.0,
      openPositionsCount: 0,
      openOrdersCount: 0,
    });

    this.portfolios.set('EXP_SKEW_V2', {
      portfolioId: 'EXP_SKEW_V2',
      name: 'Research: Settlement Skew Hold (v2.0)',
      isPrimary: false,
      cashBalance: 1000.0,
      equity: 1000.0,
      reservedCapital: 0.0,
      usableHeadroom: 1000.0,
      netDirectionalDelta: 0,
      grossExposure: 0.0,
      dailyRealizedPnl: 0.0,
      dailyPeakEquity: 1000.0,
      currentDrawdownPct: 0.0,
      riskBudgetRemaining: 75.0,
      openPositionsCount: 0,
      openOrdersCount: 0,
    });

    this.portfolios.set('BENCHMARK_MAKER', {
      portfolioId: 'BENCHMARK_MAKER',
      name: 'Benchmark: Passive Inside-Spread Maker',
      isPrimary: false,
      cashBalance: 1000.0,
      equity: 1000.0,
      reservedCapital: 0.0,
      usableHeadroom: 1000.0,
      netDirectionalDelta: 0,
      grossExposure: 0.0,
      dailyRealizedPnl: 0.0,
      dailyPeakEquity: 1000.0,
      currentDrawdownPct: 0.0,
      riskBudgetRemaining: 50.0,
      openPositionsCount: 0,
      openOrdersCount: 0,
    });
  }

  public getLimits(): RiskLimitsConfig {
    return { ...this.limits };
  }

  public updateLimits(newLimits: Partial<RiskLimitsConfig>) {
    this.limits = { ...this.limits, ...newLimits };
  }

  public getPortfolio(portfolioId: string): PortfolioRiskState | undefined {
    return this.portfolios.get(portfolioId);
  }

  public getAllPortfolios(): PortfolioRiskState[] {
    return Array.from(this.portfolios.values());
  }

  public setEmergencyPause(paused: boolean) {
    this.isEmergencyPaused = paused;
  }

  public isPaused(): boolean {
    return this.isEmergencyPaused;
  }

  /**
   * Pre-submission Risk Check Gatekeeper
   */
  public checkPreSubmissionRisk(
    portfolioId: string,
    strategyId: StrategyId,
    side: 'YES' | 'NO',
    action: 'BUY' | 'SELL',
    priceCents: number,
    quantity: number,
    openPositions: Position[],
    openOrders: Order[]
  ): RiskCheckResult {
    // Gate 0: Global Emergency Pause
    if (this.isEmergencyPaused) {
      return {
        isApproved: false,
        gateName: 'GATE_EMERGENCY_HALT',
        blockedReason: 'Trading is paused by system emergency halt control.',
      };
    }

    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) {
      return {
        isApproved: false,
        gateName: 'GATE_PORTFOLIO_NOT_FOUND',
        blockedReason: `Portfolio ${portfolioId} does not exist.`,
      };
    }

    // If SELL (reducing or closing exposure), always permit unless paused
    if (action === 'SELL') {
      return { isApproved: true };
    }

    // Gate 1: Daily Loss Circuit Breaker
    if (portfolio.dailyRealizedPnl <= -this.limits.maxDailyLoss) {
      return {
        isApproved: false,
        gateName: 'GATE_DAILY_LOSS_BREACHED',
        blockedReason: `Daily loss (-$${Math.abs(portfolio.dailyRealizedPnl).toFixed(2)}) has breached circuit breaker limit ($${this.limits.maxDailyLoss.toFixed(2)}). All new entries halted for the day.`,
      };
    }

    // Gate 2: Maximum Drawdown Limit
    if (portfolio.currentDrawdownPct >= this.limits.maxDrawdownPct) {
      return {
        isApproved: false,
        gateName: 'GATE_MAX_DRAWDOWN_BREACHED',
        blockedReason: `Portfolio drawdown (${portfolio.currentDrawdownPct.toFixed(1)}%) exceeds maximum limit (${this.limits.maxDrawdownPct}%).`,
      };
    }

    // Gate 3: Position Size Limit (Default 10 contracts)
    const effectiveQty = Math.min(quantity, this.limits.maxPositionContracts);
    if (effectiveQty <= 0) {
      return {
        isApproved: false,
        gateName: 'GATE_ZERO_QUANTITY',
        blockedReason: 'Approved contract quantity is 0.',
      };
    }

    // Gate 4: Capital Reservation and Margin
    const capitalRequired = (priceCents / 100) * effectiveQty;
    if (capitalRequired > portfolio.usableHeadroom) {
      return {
        isApproved: false,
        gateName: 'GATE_INSUFFICIENT_HEADROOM',
        blockedReason: `Capital required ($${capitalRequired.toFixed(2)}) exceeds usable risk headroom ($${portfolio.usableHeadroom.toFixed(2)}).`,
      };
    }

    // Gate 5: Directional Delta Limit (Prevent over-concentration in same direction)
    const deltaImpact = side === 'YES' ? effectiveQty : -effectiveQty;
    const prospectiveDelta = portfolio.netDirectionalDelta + deltaImpact;
    if (Math.abs(prospectiveDelta) > this.limits.maxPortfolioContracts) {
      return {
        isApproved: false,
        gateName: 'GATE_MAX_DIRECTIONAL_DELTA',
        blockedReason: `Prospective directional delta (${prospectiveDelta} contracts) exceeds maximum portfolio delta limit (${this.limits.maxPortfolioContracts}).`,
      };
    }

    // Gate 6: Maximum Gross Capital at Risk
    if (portfolio.grossExposure + capitalRequired > this.limits.maxGrossCapitalAtRisk) {
      return {
        isApproved: false,
        gateName: 'GATE_MAX_GROSS_EXPOSURE',
        blockedReason: `Gross capital at risk ($${(portfolio.grossExposure + capitalRequired).toFixed(2)}) exceeds maximum limit ($${this.limits.maxGrossCapitalAtRisk.toFixed(2)}).`,
      };
    }

    // Gate 7: Concurrent Strategy Allocation Guard
    const strategyRule = STRATEGY_ALLOCATIONS[strategyId];
    if (strategyRule) {
      const strategyOpenPositions = openPositions.filter(
        (p) => p.portfolioId === portfolioId && p.strategyId === strategyId && p.status === 'OPEN'
      );
      const strategyCurrentContracts = strategyOpenPositions.reduce((sum, p) => sum + p.contracts, 0);
      if (strategyCurrentContracts + effectiveQty > strategyRule.maxConcurrentContracts) {
        return {
          isApproved: false,
          gateName: 'GATE_STRATEGY_CONTRACT_LIMIT',
          blockedReason: `Strategy ${strategyId} would exceed its concurrent contract ceiling (${strategyRule.maxConcurrentContracts} contracts). Current: ${strategyCurrentContracts}.`,
        };
      }
    }

    return {
      isApproved: true,
      adjustedQuantity: effectiveQty,
    };
  }

  /**
   * Reconcile portfolio risk state after trade or mark-to-market update
   */
  public updatePortfolioState(
    portfolioId: string,
    positions: Position[],
    orders: Order[]
  ) {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) return;

    const openPositions = positions.filter(
      (p) => p.portfolioId === portfolioId && p.status === 'OPEN'
    );
    const openOrders = orders.filter(
      (o) =>
        o.portfolioId === portfolioId &&
        (o.state === 'SUBMITTED' || o.state === 'QUEUED' || o.state === 'PARTIALLY_FILLED')
    );

    // Calculate gross exposure and unrealized PnL
    let grossExposure = 0;
    let unrealizedPnlTotal = 0;
    let netDelta = 0;

    for (const p of openPositions) {
      const posValue = (p.currentPrice / 100) * p.contracts;
      grossExposure += posValue;
      unrealizedPnlTotal += p.unrealizedPnl;
      netDelta += p.side === 'YES' ? p.contracts : -p.contracts;
    }

    // Reserved capital locked in open resting buy orders
    let reservedCapital = 0;
    for (const o of openOrders) {
      if (o.action === 'BUY') {
        const remainingQty = o.quantity - o.filledQuantity;
        reservedCapital += (o.price / 100) * remainingQty;
      }
    }

    const currentEquity = portfolio.cashBalance + grossExposure + unrealizedPnlTotal;
    const peakEquity = Math.max(portfolio.dailyPeakEquity, currentEquity);
    const drawdownPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
    const usableHeadroom = Math.max(0, portfolio.cashBalance - reservedCapital);

    const updated: PortfolioRiskState = {
      ...portfolio,
      equity: Math.round(currentEquity * 100) / 100,
      reservedCapital: Math.round(reservedCapital * 100) / 100,
      usableHeadroom: Math.round(usableHeadroom * 100) / 100,
      netDirectionalDelta: netDelta,
      grossExposure: Math.round(grossExposure * 100) / 100,
      dailyPeakEquity: Math.round(peakEquity * 100) / 100,
      currentDrawdownPct: Math.round(drawdownPct * 10) / 10,
      riskBudgetRemaining: Math.max(0, this.limits.maxDailyLoss + portfolio.dailyRealizedPnl),
      openPositionsCount: openPositions.length,
      openOrdersCount: openOrders.length,
    };

    this.portfolios.set(portfolioId, updated);
  }

  /**
   * Record realized PnL from position closure
   */
  public recordRealizedTrade(portfolioId: string, netPnlDollars: number) {
    const p = this.portfolios.get(portfolioId);
    if (!p) return;

    const newCash = p.cashBalance + netPnlDollars;
    const newDailyPnl = p.dailyRealizedPnl + netPnlDollars;

    this.portfolios.set(portfolioId, {
      ...p,
      cashBalance: Math.round(newCash * 100) / 100,
      dailyRealizedPnl: Math.round(newDailyPnl * 100) / 100,
    });
  }
}
