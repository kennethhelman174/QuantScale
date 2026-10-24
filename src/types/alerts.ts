/**
 * Volatility & Price-Action Alert System Type Definitions
 * For quantitative monitoring of Bitcoin volatility regimes and market micro-shocks.
 */

export type VolatilityMetric =
  | 'REALIZED_15M'
  | 'PARKINSON_HL'
  | 'GARMAN_KLASS_OHLC'
  | 'SPOT_PRICE_SURGE';

export type AlertCondition =
  | 'ABOVE'          // Current value > threshold
  | 'BELOW'          // Current value < threshold
  | 'CHANGE_PCT_5M'  // 5m volatility jump % > threshold
  | 'ABSOLUTE_SURGE'; // Spot absolute price surge (+$)

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface VolatilityAlertRule {
  id: string;
  name: string;
  metric: VolatilityMetric;
  condition: AlertCondition;
  threshold: number; // e.g. 65 for 65% vol, or 350 for $350 spot move
  severity: AlertSeverity;
  isEnabled: boolean;
  cooldownSec: number; // seconds between trigger notifications (e.g. 30s)
  lastTriggeredAt?: number;
  triggerCount: number;
  description?: string;
  soundEnabled?: boolean;
}

export interface VolatilityNotification {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: VolatilityMetric;
  metricLabel: string;
  currentValue: number;
  threshold: number;
  condition: AlertCondition;
  severity: AlertSeverity;
  timestamp: number;
  message: string;
  isDismissed: boolean;
}

export interface VolatilitySnapshot {
  realizedVol15m: number;     // Percentage (e.g. 52.4%)
  parkinsonVol: number;       // Percentage (e.g. 54.1%)
  garmanKlassVol: number;     // Percentage (e.g. 50.8%)
  spotPrice: number;          // USD (e.g. 68450.00)
  spot5mDelta: number;        // USD delta over 5 mins (e.g. +145.20)
  spot5mDeltaPct: number;     // % delta over 5 mins (e.g. +0.21%)
  timestamp: number;
}
