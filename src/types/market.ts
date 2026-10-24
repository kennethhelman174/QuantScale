/**
 * Type definitions for Kalshi Bitcoin 15-Minute Prediction Market Trading Platform
 * Designed for institutional quantitative research, realistic paper trading, and real-money execution.
 */

export type ExecutionMode = 'PAPER' | 'DEMO' | 'LIVE';

export type ContractSide = 'YES' | 'NO';

export type OrderType = 'LIMIT' | 'MARKET';

export type OrderAction = 'BUY' | 'SELL';

export type OrderState =
  | 'PENDING_SUBMIT'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'QUEUED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'UNCERTAIN';

export type StrategyId =
  | 'BTC-LEADLAG-SCALP'
  | 'SETTLEMENT-SKEW-DIR'
  | 'VOL-RANGE-REVERSAL'
  | 'PASSIVE-MAKER-BENCHMARK';

export type StrategyPurpose = 'SCALP' | 'SETTLEMENT_HOLD';

export interface OrderBookLevel {
  price: number; // in cents (1 to 99)
  quantity: number; // number of contracts
  ordersCount?: number;
}

export interface KalshiOrderBook {
  ticker: string;
  timestamp: number;
  sequence: number;
  yesBids: OrderBookLevel[];
  yesAsks: OrderBookLevel[];
  noBids: OrderBookLevel[];
  noAsks: OrderBookLevel[];
  spread: number; // cents
  midPrice: number; // cents
  microImbalance: number; // -1.0 to +1.0
  isCrossed: boolean;
  isEmpty: boolean;
  isStale: boolean;
  source: 'KALSHI_WS' | 'SIMULATOR';
}

export interface BTCSpotObservation {
  timestamp: number;
  price: number;
  source: 'COINBASE' | 'BINANCE' | 'KRAKEN' | 'COMPOSITE';
  volume24h: number;
  return10s: number;
  return30s: number;
  return1m: number;
  return5m: number;
  realizedVol15m: number; // annualized or 15m basis
}

export interface Kalshi15MMarket {
  ticker: string; // e.g. "KXBTC15M-26OCT23-68500"
  title: string;
  strikePrice: number; // USD
  openTimestamp: number;
  closeTimestamp: number; // Expiration
  settlementTimerSec: number;
  status: 'OPEN' | 'CLOSED' | 'SETTLED';
  settlementIndexPrice?: number;
  settlementResult?: 'YES' | 'NO';
  openInterest: number;
  volume: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Order {
  id: string;
  clientOrderId: string;
  marketTicker: string;
  portfolioId: string;
  strategyId: StrategyId;
  side: ContractSide;
  action: OrderAction;
  type: OrderType;
  price: number; // cents (1-99)
  quantity: number; // contract count
  filledQuantity: number;
  avgFillPrice: number;
  feePaid: number; // USD
  state: OrderState;
  createdAt: number;
  submittedAt?: number;
  acknowledgedAt?: number;
  filledAt?: number;
  canceledAt?: number;
  rejectReason?: string;
  latencyBreakdown?: {
    localComputeMs: number;
    networkAckMs: number;
    queueDelayMs: number;
    fillLatencyMs: number;
  };
}

export interface OrderBookL2Snapshot {
  bestBidPrice: number; // cents
  bestBidQuantity: number; // contracts
  bestAskPrice: number; // cents
  bestAskQuantity: number; // contracts
  spreadCents: number;
  top5BidDepth: number; // sum of contracts in top 5 bid levels
  top5AskDepth: number; // sum of contracts in top 5 ask levels
  bookImbalanceRatio: number; // (bidDepth - askDepth) / (bidDepth + askDepth) (-1.0 to 1.0)
}

export interface Position {
  id: string;
  portfolioId: string;
  marketTicker: string;
  strikePrice: number;
  strategyId: StrategyId;
  purpose: StrategyPurpose;
  side: ContractSide;
  contracts: number;
  entryPrice: number; // cents
  currentPrice: number; // cents (mark to market)
  unrealizedPnl: number; // USD
  realizedPnl: number; // USD
  totalFees: number; // USD
  entryTimestamp: number;
  targetProfitPrice?: number;
  stopLossPrice?: number;
  trailingStopPrice?: number;
  maxFavorableExcursion: number; // cents
  maxAdverseExcursion: number; // cents
  thesisInvalidationCondition: string;
  status: 'OPEN' | 'CLOSED' | 'SETTLED';
  exitTimestamp?: number;
  exitPrice?: number;
  exitReason?: string;
  l2SnapshotAtFill?: OrderBookL2Snapshot;
}

export interface StrategyHypothesis {
  strategyId: StrategyId;
  name: string;
  rationale: string;
  informationRequired: string[];
  expectedDuration: string;
  executionConditions: {
    maxSpreadCents: number;
    minTopDepthContracts: number;
    minTimeToExpirySec: number;
    maxTimeToExpirySec: number;
    minAlphaEdgeCents: number;
  };
  expectedCostsAndDownside: string;
  invalidationConditions: string[];
  evidenceNeeded: string;
  isActive: boolean;
}

export interface StrategyDecision {
  strategyId: StrategyId;
  timestamp: number;
  marketTicker: string;
  action: 'ENTER_YES' | 'ENTER_NO' | 'EXIT' | 'HOLD' | 'ABSTAIN';
  suggestedPrice: number; // cents
  suggestedQuantity: number;
  theoreticalProbability: number; // 0 to 1
  marketProbability: number; // 0 to 1
  edgeCents: number; // cents
  expectedNetValue: number; // EV after fees & slippage
  uncertaintyEstimate: number; // standard error of EV
  blockedGate?: string; // If ABSTAIN, exact blocking gate
  rationale: string;
}

export interface PortfolioRiskState {
  portfolioId: string;
  name: string;
  isPrimary: boolean;
  cashBalance: number; // USD
  equity: number; // USD
  reservedCapital: number; // capital locked in open resting orders & margin
  usableHeadroom: number; // available margin
  netDirectionalDelta: number; // signed contract delta (+YES, -NO)
  grossExposure: number; // total capital at risk
  dailyRealizedPnl: number;
  dailyPeakEquity: number;
  currentDrawdownPct: number;
  riskBudgetRemaining: number;
  openPositionsCount: number;
  openOrdersCount: number;
}

export interface RiskLimitsConfig {
  maxPositionContracts: number; // default 10
  maxPortfolioContracts: number;
  maxGrossCapitalAtRisk: number; // USD
  maxDailyLoss: number; // USD circuit breaker
  maxDrawdownPct: number; // % circuit breaker
  maxDataAgeMs: number; // stale data threshold (e.g. 2500ms)
  maxSlippageCents: number;
  reconciliationFailThreshold: number;
}

export interface ModelQualificationMetric {
  version: string;
  trainedThrough: string;
  brierScore: number; // lower is better (0 to 1)
  expectedCalibrationError: number;
  sampleSize: number;
  winRatePct: number;
  netExpectancyPerTrade: number; // cents
  profitFactor: number;
  maxDrawdownCents: number;
  turnoverRatio: number;
  feeBurdenPct: number;
  isQualified: boolean;
  status: 'COLLECTING' | 'TESTING' | 'DEPLOYED' | 'DEGRADED' | 'ROLLED_BACK';
  qualificationNotes: string;
}

export interface DiagnosticLogEntry {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DECISION' | 'EXECUTION';
  category: 'MARKET_DATA' | 'ORDER_ROUTING' | 'RISK_GATE' | 'POSITION' | 'RECONCILIATION';
  message: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticBundle {
  exportTimestamp: number;
  appVersion: string;
  environment: ExecutionMode;
  systemHealth: {
    feedFreshnessMs: number;
    clockOffsetMs: number;
    isReconciled: boolean;
    consecutiveErrors: number;
    uptimeSeconds: number;
  };
  marketObservationsCount: number;
  flatPeriodsRecordedCount: number;
  decisionsLog: StrategyDecision[];
  orderTransitions: Order[];
  closedPositions: Position[];
  riskSnapshots: PortfolioRiskState[];
  modelMetrics: ModelQualificationMetric[];
  diagnostics: DiagnosticLogEntry[];
}
