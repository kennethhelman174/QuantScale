/**
 * Institutional Volatility & Price-Action Alert Engine
 * Evaluates real-time Bitcoin volatility regimes, high-low ranges, and rapid price shocks.
 * Emits visual notifications, diagnostics logs, and Web Audio cues.
 */

import {
  VolatilityAlertRule,
  VolatilityNotification,
  VolatilitySnapshot,
  VolatilityMetric,
  AlertCondition,
  AlertSeverity,
} from '../types/alerts';
import { calculateRealizedVol, calculateParkinsonVol, calculateGarmanKlassVol } from '../quant/binaryPricing';
import { Candle } from '../types/market';

const STORAGE_KEY_RULES = 'kalpha_vol_alert_rules_v1';
const STORAGE_KEY_SOUND = 'kalpha_vol_alert_sound_v1';

export const DEFAULT_ALERT_RULES: VolatilityAlertRule[] = [
  {
    id: 'vol-high-realized-65',
    name: 'Realized Vol High Spike',
    metric: 'REALIZED_15M',
    condition: 'ABOVE',
    threshold: 65,
    severity: 'WARNING',
    isEnabled: true,
    cooldownSec: 30,
    triggerCount: 0,
    soundEnabled: true,
    description: 'Triggers when 15-minute rolling close-to-close volatility exceeds 65% annualized.',
  },
  {
    id: 'vol-extreme-shock-80',
    name: 'Extreme Vol Regime Shock',
    metric: 'REALIZED_15M',
    condition: 'ABOVE',
    threshold: 80,
    severity: 'CRITICAL',
    isEnabled: true,
    cooldownSec: 20,
    triggerCount: 0,
    soundEnabled: true,
    description: 'Triggers on extreme market turbulence exceeding 80% annualized volatility.',
  },
  {
    id: 'vol-low-compression-30',
    name: 'Vol Compression Squeeze',
    metric: 'REALIZED_15M',
    condition: 'BELOW',
    threshold: 30,
    severity: 'INFO',
    isEnabled: true,
    cooldownSec: 45,
    triggerCount: 0,
    soundEnabled: false,
    description: 'Alerts when volatility contracts below 30%, signaling potential breakout chop.',
  },
  {
    id: 'vol-parkinson-surge-68',
    name: 'Parkinson High-Low Expansion',
    metric: 'PARKINSON_HL',
    condition: 'ABOVE',
    threshold: 68,
    severity: 'WARNING',
    isEnabled: true,
    cooldownSec: 30,
    triggerCount: 0,
    soundEnabled: true,
    description: 'Alerts when intraday high-low range expansion estimator crosses 68%.',
  },
  {
    id: 'vol-garman-klass-62',
    name: 'Garman-Klass Microstructure Breakout',
    metric: 'GARMAN_KLASS_OHLC',
    condition: 'ABOVE',
    threshold: 62,
    severity: 'WARNING',
    isEnabled: true,
    cooldownSec: 30,
    triggerCount: 0,
    soundEnabled: true,
    description: 'Alerts when minimum-variance OHLC jump estimator exceeds 62% annualized.',
  },
  {
    id: 'spot-surge-350',
    name: 'BTC Spot 5M Surge',
    metric: 'SPOT_PRICE_SURGE',
    condition: 'ABSOLUTE_SURGE',
    threshold: 350,
    severity: 'WARNING',
    isEnabled: true,
    cooldownSec: 45,
    triggerCount: 0,
    soundEnabled: true,
    description: 'Alerts when absolute BTC spot price moves by more than $350 within 5 minutes.',
  },
];

class AlertManager {
  private rules: VolatilityAlertRule[] = [];
  private activeNotifications: VolatilityNotification[] = [];
  private notificationHistory: VolatilityNotification[] = [];
  private listeners: (() => void)[] = [];
  private soundEnabled: boolean = true;
  private audioCtx: AudioContext | null = null;
  private currentSnapshot: VolatilitySnapshot = {
    realizedVol15m: 50.0,
    parkinsonVol: 50.0,
    garmanKlassVol: 50.0,
    spotPrice: 68450.0,
    spot5mDelta: 0.0,
    spot5mDeltaPct: 0.0,
    timestamp: Date.now(),
  };

  constructor() {
    this.loadRules();
    this.loadSoundPref();
  }

  private loadRules() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_RULES);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.rules = parsed;
          return;
        }
      }
    } catch {
      // LocalStorage unavailable, use defaults
    }
    this.rules = [...DEFAULT_ALERT_RULES];
  }

  private saveRules() {
    try {
      localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(this.rules));
    } catch {
      // ignore
    }
  }

  private loadSoundPref() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SOUND);
      if (stored !== null) {
        this.soundEnabled = stored === 'true';
      }
    } catch {
      this.soundEnabled = true;
    }
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY_SOUND, enabled ? 'true' : 'false');
    } catch {
      // ignore
    }
    this.notify();
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    for (const cb of this.listeners) {
      cb();
    }
  }

  public getRules(): VolatilityAlertRule[] {
    return this.rules;
  }

  public getActiveNotifications(): VolatilityNotification[] {
    return this.activeNotifications;
  }

  public getNotificationHistory(): VolatilityNotification[] {
    return this.notificationHistory;
  }

  public getCurrentSnapshot(): VolatilitySnapshot {
    return this.currentSnapshot;
  }

  public addRule(ruleData: Omit<VolatilityAlertRule, 'id' | 'triggerCount'>): VolatilityAlertRule {
    const newRule: VolatilityAlertRule = {
      ...ruleData,
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      triggerCount: 0,
    };
    this.rules.push(newRule);
    this.saveRules();
    this.notify();
    return newRule;
  }

  public updateRule(id: string, updates: Partial<VolatilityAlertRule>): void {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx !== -1) {
      this.rules[idx] = { ...this.rules[idx], ...updates };
      this.saveRules();
      this.notify();
    }
  }

  public deleteRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
    this.saveRules();
    this.notify();
  }

  public toggleRule(id: string): void {
    const rule = this.rules.find((r) => r.id === id);
    if (rule) {
      rule.isEnabled = !rule.isEnabled;
      this.saveRules();
      this.notify();
    }
  }

  public resetToDefaults(): void {
    this.rules = [...DEFAULT_ALERT_RULES];
    this.saveRules();
    this.notify();
  }

  public dismissNotification(id: string): void {
    this.activeNotifications = this.activeNotifications.filter((n) => n.id !== id);
    const inHistory = this.notificationHistory.find((n) => n.id === id);
    if (inHistory) inHistory.isDismissed = true;
    this.notify();
  }

  public dismissAllNotifications(): void {
    this.activeNotifications = [];
    this.notificationHistory.forEach((n) => (n.isDismissed = true));
    this.notify();
  }

  public clearHistory(): void {
    this.notificationHistory = [];
    this.notify();
  }

  /**
   * Sound generator via Web Audio API: gentle institutional quant sound
   */
  private playAlertTone(severity: AlertSeverity) {
    if (!this.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (severity === 'CRITICAL') {
        // High alert double-beep
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now); // A5
        osc.frequency.setValueAtTime(1174, now + 0.1); // D6
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (severity === 'WARNING') {
        // Warning chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.setValueAtTime(830.61, now + 0.12); // G#5
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.38);
      } else {
        // Info soft blip
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch {
      // Audio playback prevented by browser security policy without prior interaction
    }
  }

  /**
   * Manually trigger a rule for testing and UI verification
   */
  public testTriggerRule(ruleId: string): void {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule) return;

    let testVal = rule.threshold;
    if (rule.condition === 'ABOVE' || rule.condition === 'CHANGE_PCT_5M' || rule.condition === 'ABSOLUTE_SURGE') {
      testVal = Math.round((rule.threshold * 1.08) * 10) / 10;
    } else {
      testVal = Math.round((rule.threshold * 0.92) * 10) / 10;
    }

    this.triggerRule(rule, testVal, true);
  }

  private triggerRule(rule: VolatilityAlertRule, currentValue: number, isTest = false): void {
    const now = Date.now();
    rule.lastTriggeredAt = now;
    rule.triggerCount += 1;
    this.saveRules();

    let metricUnit = '%';
    let metricLabel = '15m Realized Vol';
    if (rule.metric === 'PARKINSON_HL') {
      metricLabel = 'Parkinson High-Low Vol';
    } else if (rule.metric === 'GARMAN_KLASS_OHLC') {
      metricLabel = 'Garman-Klass Vol';
    } else if (rule.metric === 'SPOT_PRICE_SURGE') {
      metricLabel = 'BTC Spot 5m Delta';
      metricUnit = '$';
    }

    const condWord =
      rule.condition === 'ABOVE'
        ? 'crossed above'
        : rule.condition === 'BELOW'
        ? 'dropped below'
        : rule.condition === 'ABSOLUTE_SURGE'
        ? 'surged by'
        : 'jumped by';

    const testPrefix = isTest ? '[TEST ALERT] ' : '';
    const message = `${testPrefix}${metricLabel} ${condWord} ${rule.threshold}${metricUnit} (Current: ${currentValue.toFixed(1)}${metricUnit})`;

    const notification: VolatilityNotification = {
      id: `notif-${now}-${Math.random().toString(36).substring(2, 6)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      metricLabel,
      currentValue,
      threshold: rule.threshold,
      condition: rule.condition,
      severity: rule.severity,
      timestamp: now,
      message,
      isDismissed: false,
    };

    // Keep active notifications capped at 4
    this.activeNotifications = [notification, ...this.activeNotifications.slice(0, 3)];
    // History up to 100
    this.notificationHistory = [notification, ...this.notificationHistory.slice(0, 99)];

    if (rule.soundEnabled !== false) {
      this.playAlertTone(rule.severity);
    }

    this.notify();
  }

  /**
   * Evaluates current market metrics against active alert rules
   */
  public evaluate(
    spotPrice: number,
    spotHistory: number[],
    candles: Candle[]
  ): VolatilitySnapshot {
    const now = Date.now();

    // 1. Calculate Realized Volatility (annualized %)
    const recent30Spot = spotHistory.slice(-30);
    const realizedVolRaw = calculateRealizedVol(recent30Spot);
    const realizedVol15m = Math.round(realizedVolRaw * 1000) / 10; // e.g. 52.4%

    // 2. Calculate Parkinson High-Low Volatility (annualized %)
    const recent30Candles = candles.slice(-30);
    const parkinsonRaw = calculateParkinsonVol(recent30Candles);
    const parkinsonVol = Math.round(parkinsonRaw * 1000) / 10; // e.g. 54.1%

    // 3. Calculate Garman-Klass OHLC Volatility (annualized %)
    const gkRaw = calculateGarmanKlassVol(recent30Candles);
    const garmanKlassVol = Math.round(gkRaw * 1000) / 10; // e.g. 50.8%

    // 4. Calculate 5-minute spot return / surge
    const fiveMinIdx = Math.max(0, spotHistory.length - 6);
    const price5mAgo = spotHistory[fiveMinIdx] || spotPrice;
    const spot5mDelta = Math.round((spotPrice - price5mAgo) * 100) / 100;
    const spot5mDeltaPct = Math.round(((spotPrice - price5mAgo) / Math.max(price5mAgo, 1)) * 10000) / 100;

    const snapshot: VolatilitySnapshot = {
      realizedVol15m,
      parkinsonVol,
      garmanKlassVol,
      spotPrice,
      spot5mDelta,
      spot5mDeltaPct,
      timestamp: now,
    };
    this.currentSnapshot = snapshot;

    // Evaluate rules
    for (const rule of this.rules) {
      if (!rule.isEnabled) continue;

      // Check cooldown
      if (rule.lastTriggeredAt) {
        const elapsedSec = (now - rule.lastTriggeredAt) / 1000;
        if (elapsedSec < (rule.cooldownSec || 30)) {
          continue;
        }
      }

      let metricVal = 0;
      switch (rule.metric) {
        case 'REALIZED_15M':
          metricVal = realizedVol15m;
          break;
        case 'PARKINSON_HL':
          metricVal = parkinsonVol;
          break;
        case 'GARMAN_KLASS_OHLC':
          metricVal = garmanKlassVol;
          break;
        case 'SPOT_PRICE_SURGE':
          metricVal = Math.abs(spot5mDelta);
          break;
      }

      let isTriggered = false;
      if (rule.condition === 'ABOVE') {
        isTriggered = metricVal >= rule.threshold;
      } else if (rule.condition === 'BELOW') {
        isTriggered = metricVal <= rule.threshold;
      } else if (rule.condition === 'ABSOLUTE_SURGE') {
        isTriggered = Math.abs(metricVal) >= rule.threshold;
      } else if (rule.condition === 'CHANGE_PCT_5M') {
        isTriggered = Math.abs(spot5mDeltaPct) >= rule.threshold;
      }

      if (isTriggered) {
        this.triggerRule(rule, metricVal);
      }
    }

    return snapshot;
  }
}

// Global Singleton
export const alertManager = new AlertManager();
