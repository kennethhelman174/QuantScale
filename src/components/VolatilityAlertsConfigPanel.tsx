/**
 * Institutional Volatility & Price-Action Alert Configuration Panel
 * Allows traders and quantitative operators to configure custom alerts
 * across Realized 15m Vol, Parkinson High-Low, Garman-Klass, and Spot Surges.
 */

import React, { useState, useEffect } from 'react';
import { alertManager, DEFAULT_ALERT_RULES } from '../services/alertManager';
import {
  VolatilityAlertRule,
  VolatilityMetric,
  AlertCondition,
  AlertSeverity,
  VolatilitySnapshot,
  VolatilityNotification,
} from '../types/alerts';
import {
  Bell,
  Plus,
  Trash2,
  Play,
  Volume2,
  VolumeX,
  RotateCcw,
  Activity,
  Flame,
  TrendingUp,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';

interface VolatilityAlertsConfigPanelProps {
  onClose?: () => void;
}

export const VolatilityAlertsConfigPanel: React.FC<VolatilityAlertsConfigPanelProps> = () => {
  const [rules, setRules] = useState<VolatilityAlertRule[]>(alertManager.getRules());
  const [history, setHistory] = useState<VolatilityNotification[]>(alertManager.getNotificationHistory());
  const [snapshot, setSnapshot] = useState<VolatilitySnapshot>(alertManager.getCurrentSnapshot());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(alertManager.isSoundEnabled());
  const [isAddingRule, setIsAddingRule] = useState<boolean>(false);
  const [viewHistory, setViewHistory] = useState<boolean>(false);

  // Form state for creating a new rule
  const [formName, setFormName] = useState('');
  const [formMetric, setFormMetric] = useState<VolatilityMetric>('REALIZED_15M');
  const [formCondition, setFormCondition] = useState<AlertCondition>('ABOVE');
  const [formThreshold, setFormThreshold] = useState<number>(65);
  const [formSeverity, setFormSeverity] = useState<AlertSeverity>('WARNING');
  const [formCooldownSec, setFormCooldownSec] = useState<number>(30);
  const [formSound, setFormSound] = useState<boolean>(true);

  // Subscribe to AlertManager state updates
  useEffect(() => {
    const handleUpdate = () => {
      setRules([...alertManager.getRules()]);
      setHistory([...alertManager.getNotificationHistory()]);
      setSnapshot(alertManager.getCurrentSnapshot());
      setSoundEnabled(alertManager.isSoundEnabled());
    };

    handleUpdate();
    const unsub = alertManager.subscribe(handleUpdate);
    return unsub;
  }, []);

  const handleToggleRule = (id: string) => {
    alertManager.toggleRule(id);
  };

  const handleDeleteRule = (id: string) => {
    alertManager.deleteRule(id);
  };

  const handleTestRule = (id: string) => {
    alertManager.testTriggerRule(id);
  };

  const handleToggleSound = () => {
    alertManager.setSoundEnabled(!soundEnabled);
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all alert rules to institutional quantitative defaults?')) {
      alertManager.resetToDefaults();
    }
  };

  const handleAddPreset = (preset: Partial<VolatilityAlertRule>) => {
    alertManager.addRule({
      name: preset.name || 'Custom Vol Alert',
      metric: preset.metric || 'REALIZED_15M',
      condition: preset.condition || 'ABOVE',
      threshold: preset.threshold || 65,
      severity: preset.severity || 'WARNING',
      isEnabled: true,
      cooldownSec: preset.cooldownSec || 30,
      soundEnabled: true,
      description: preset.description || 'Auto-generated alert rule.',
    });
  };

  const handleSubmitNewRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    alertManager.addRule({
      name: formName.trim(),
      metric: formMetric,
      condition: formCondition,
      threshold: Number(formThreshold),
      severity: formSeverity,
      isEnabled: true,
      cooldownSec: Number(formCooldownSec) || 30,
      soundEnabled: formSound,
      description: `Custom alert for ${formMetric} ${formCondition} ${formThreshold}`,
    });

    // Reset form
    setFormName('');
    setIsAddingRule(false);
  };

  // Helper to format metric values
  const getLiveMetricValue = (metric: VolatilityMetric): { val: string; isTriggering: boolean } => {
    switch (metric) {
      case 'REALIZED_15M':
        return { val: `${snapshot.realizedVol15m.toFixed(1)}%`, isTriggering: snapshot.realizedVol15m >= 65 };
      case 'PARKINSON_HL':
        return { val: `${snapshot.parkinsonVol.toFixed(1)}%`, isTriggering: snapshot.parkinsonVol >= 68 };
      case 'GARMAN_KLASS_OHLC':
        return { val: `${snapshot.garmanKlassVol.toFixed(1)}%`, isTriggering: snapshot.garmanKlassVol >= 62 };
      case 'SPOT_PRICE_SURGE':
        return {
          val: `${snapshot.spot5mDelta >= 0 ? '+' : ''}$${snapshot.spot5mDelta.toFixed(1)}`,
          isTriggering: Math.abs(snapshot.spot5mDelta) >= 350,
        };
    }
  };

  return (
    <div className="space-y-5 text-xs text-neutral-300">
      {/* 1. Live Market Volatility Gauge Bar */}
      <div className="p-3.5 bg-neutral-950/90 rounded-xl border border-neutral-800">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">
              Live BTC Volatility & Price-Action Feed
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-neutral-500">
              BTC: ${snapshot.spotPrice.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <button
              onClick={handleToggleSound}
              title={soundEnabled ? 'Mute alert sounds' : 'Enable alert sounds'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                soundEnabled
                  ? 'border-cyan-800/80 bg-cyan-950/40 text-cyan-300'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-500'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
              <span>{soundEnabled ? 'AUDIO ON' : 'MUTED'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Realized Vol */}
          <div className="p-2 bg-neutral-900/80 rounded-lg border border-neutral-800/80">
            <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
              <span>15m Realized Vol</span>
              <span className="text-cyan-400">σ_cc</span>
            </div>
            <div className="text-base font-bold font-mono text-white mt-0.5">
              {snapshot.realizedVol15m.toFixed(1)}%
            </div>
            <div className="text-[9px] text-neutral-500 font-mono mt-0.5">
              30-min rolling returns
            </div>
          </div>

          {/* Parkinson Vol */}
          <div className="p-2 bg-neutral-900/80 rounded-lg border border-neutral-800/80">
            <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
              <span>Parkinson High-Low</span>
              <span className="text-amber-400">σ_P</span>
            </div>
            <div className="text-base font-bold font-mono text-white mt-0.5">
              {snapshot.parkinsonVol.toFixed(1)}%
            </div>
            <div className="text-[9px] text-neutral-500 font-mono mt-0.5">
              5x more efficient estimator
            </div>
          </div>

          {/* Garman-Klass Vol */}
          <div className="p-2 bg-neutral-900/80 rounded-lg border border-neutral-800/80">
            <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
              <span>Garman-Klass OHLC</span>
              <span className="text-emerald-400">σ_GK</span>
            </div>
            <div className="text-base font-bold font-mono text-white mt-0.5">
              {snapshot.garmanKlassVol.toFixed(1)}%
            </div>
            <div className="text-[9px] text-neutral-500 font-mono mt-0.5">
              Continuous drift adjusted
            </div>
          </div>

          {/* Spot 5m Delta */}
          <div className="p-2 bg-neutral-900/80 rounded-lg border border-neutral-800/80">
            <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
              <span>Spot 5m Delta</span>
              <span className={snapshot.spot5mDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {snapshot.spot5mDeltaPct >= 0 ? '+' : ''}{snapshot.spot5mDeltaPct.toFixed(2)}%
              </span>
            </div>
            <div className={`text-base font-bold font-mono mt-0.5 ${snapshot.spot5mDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {snapshot.spot5mDelta >= 0 ? '+' : ''}${snapshot.spot5mDelta.toFixed(1)}
            </div>
            <div className="text-[9px] text-neutral-500 font-mono mt-0.5">
              5-minute net price impulse
            </div>
          </div>
        </div>
      </div>

      {/* 2. Quick-Add Preset Alerts */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Instant Quantitative Presets</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingRule(!isAddingRule)}
              className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-800/70 text-cyan-300 font-semibold rounded text-[11px] flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>{isAddingRule ? 'Close Form' : 'New Custom Rule'}</span>
            </button>
            <button
              onClick={() => setViewHistory(!viewHistory)}
              className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded text-[11px] flex items-center gap-1 transition-colors"
            >
              <Clock className="w-3 h-3 text-neutral-400" />
              <span>{viewHistory ? 'View Rules' : `History (${history.length})`}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            onClick={() =>
              handleAddPreset({
                name: 'Vol Surge Spike (>65%)',
                metric: 'REALIZED_15M',
                condition: 'ABOVE',
                threshold: 65,
                severity: 'WARNING',
                cooldownSec: 30,
              })
            }
            className="p-2 text-left bg-neutral-950 border border-neutral-800 hover:border-cyan-800/60 hover:bg-neutral-900/50 rounded-lg transition-colors group"
          >
            <div className="font-semibold text-white group-hover:text-cyan-300 flex items-center justify-between">
              <span>+ Vol Surge</span>
              <span className="text-[10px] font-mono text-amber-400">&gt; 65%</span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">15m realized volatility</div>
          </button>

          <button
            onClick={() =>
              handleAddPreset({
                name: 'Extreme Vol Shock (>80%)',
                metric: 'REALIZED_15M',
                condition: 'ABOVE',
                threshold: 80,
                severity: 'CRITICAL',
                cooldownSec: 20,
              })
            }
            className="p-2 text-left bg-neutral-950 border border-neutral-800 hover:border-rose-800/60 hover:bg-neutral-900/50 rounded-lg transition-colors group"
          >
            <div className="font-semibold text-white group-hover:text-rose-300 flex items-center justify-between">
              <span>+ Vol Shock</span>
              <span className="text-[10px] font-mono text-rose-400">&gt; 80%</span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Extreme regime shift</div>
          </button>

          <button
            onClick={() =>
              handleAddPreset({
                name: 'Vol Compression Squeeze (<30%)',
                metric: 'REALIZED_15M',
                condition: 'BELOW',
                threshold: 30,
                severity: 'INFO',
                cooldownSec: 45,
              })
            }
            className="p-2 text-left bg-neutral-950 border border-neutral-800 hover:border-cyan-800/60 hover:bg-neutral-900/50 rounded-lg transition-colors group"
          >
            <div className="font-semibold text-white group-hover:text-cyan-300 flex items-center justify-between">
              <span>+ Vol Squeeze</span>
              <span className="text-[10px] font-mono text-cyan-400">&lt; 30%</span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Chop regime contraction</div>
          </button>

          <button
            onClick={() =>
              handleAddPreset({
                name: 'Parkinson Range Breakout (>68%)',
                metric: 'PARKINSON_HL',
                condition: 'ABOVE',
                threshold: 68,
                severity: 'WARNING',
                cooldownSec: 30,
              })
            }
            className="p-2 text-left bg-neutral-950 border border-neutral-800 hover:border-amber-800/60 hover:bg-neutral-900/50 rounded-lg transition-colors group"
          >
            <div className="font-semibold text-white group-hover:text-amber-300 flex items-center justify-between">
              <span>+ Parkinson High-Low</span>
              <span className="text-[10px] font-mono text-amber-400">&gt; 68%</span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Intraday range expansion</div>
          </button>

          <button
            onClick={() =>
              handleAddPreset({
                name: 'Garman-Klass Micro Breakout (>62%)',
                metric: 'GARMAN_KLASS_OHLC',
                condition: 'ABOVE',
                threshold: 62,
                severity: 'WARNING',
                cooldownSec: 30,
              })
            }
            className="p-2 text-left bg-neutral-950 border border-neutral-800 hover:border-emerald-800/60 hover:bg-neutral-900/50 rounded-lg transition-colors group"
          >
            <div className="font-semibold text-white group-hover:text-emerald-300 flex items-center justify-between">
              <span>+ Garman-Klass</span>
              <span className="text-[10px] font-mono text-emerald-400">&gt; 62%</span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">OHLC micro-jump alert</div>
          </button>

          <button
            onClick={() =>
              handleAddPreset({
                name: 'BTC Spot Sudden Surge (+$350)',
                metric: 'SPOT_PRICE_SURGE',
                condition: 'ABSOLUTE_SURGE',
                threshold: 350,
                severity: 'WARNING',
                cooldownSec: 40,
              })
            }
            className="p-2 text-left bg-neutral-950 border border-neutral-800 hover:border-purple-800/60 hover:bg-neutral-900/50 rounded-lg transition-colors group"
          >
            <div className="font-semibold text-white group-hover:text-purple-300 flex items-center justify-between">
              <span>+ Spot 5m Surge</span>
              <span className="text-[10px] font-mono text-purple-400">&gt; $350</span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Rapid price dislocation</div>
          </button>
        </div>
      </div>

      {/* 3. New Rule Creator Form (Collapsible) */}
      {isAddingRule && (
        <form
          onSubmit={handleSubmitNewRule}
          className="p-4 bg-neutral-950 border border-cyan-800/60 rounded-xl space-y-3 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">
              Configure Custom Volatility Alert Rule
            </span>
            <span className="text-[10px] text-cyan-400 font-mono">Real-time evaluation active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-neutral-400 mb-1">Alert Rule Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. BTC Volatility Spike Alert"
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] text-neutral-400 mb-1">Target Volatility / Price Metric</label>
              <select
                value={formMetric}
                onChange={(e) => {
                  const m = e.target.value as VolatilityMetric;
                  setFormMetric(m);
                  if (m === 'SPOT_PRICE_SURGE') {
                    setFormThreshold(300);
                    setFormCondition('ABSOLUTE_SURGE');
                  } else {
                    setFormThreshold(65);
                    setFormCondition('ABOVE');
                  }
                }}
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="REALIZED_15M">15m Rolling Realized Vol (Close-to-Close %)</option>
                <option value="PARKINSON_HL">Parkinson High-Low Volatility (%)</option>
                <option value="GARMAN_KLASS_OHLC">Garman-Klass OHLC Volatility (%)</option>
                <option value="SPOT_PRICE_SURGE">BTC Spot 5m Absolute Surge ($)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-neutral-400 mb-1">Condition Trigger</label>
              <select
                value={formCondition}
                onChange={(e) => setFormCondition(e.target.value as AlertCondition)}
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded font-mono text-white text-xs"
              >
                {formMetric === 'SPOT_PRICE_SURGE' ? (
                  <>
                    <option value="ABSOLUTE_SURGE">Absolute Price Move &gt; ($)</option>
                    <option value="ABOVE">Net Gain &gt; (+$)</option>
                    <option value="BELOW">Net Drop &lt; (-$)</option>
                  </>
                ) : (
                  <>
                    <option value="ABOVE">Crosses Above (&gt; Threshold)</option>
                    <option value="BELOW">Drops Below (&lt; Threshold)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-neutral-400 mb-1">
                Threshold Value {formMetric === 'SPOT_PRICE_SURGE' ? '($)' : '(Annualized %)'}
              </label>
              <input
                type="number"
                step="0.5"
                value={formThreshold}
                onChange={(e) => setFormThreshold(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded font-mono text-white text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] text-neutral-400 mb-1">Severity Level</label>
              <select
                value={formSeverity}
                onChange={(e) => setFormSeverity(e.target.value as AlertSeverity)}
                className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded font-mono text-white text-xs"
              >
                <option value="INFO">INFO (Cyan notification)</option>
                <option value="WARNING">WARNING (Amber alert)</option>
                <option value="CRITICAL">CRITICAL (Crimson beacon alert)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] text-neutral-400 mb-1">
                Cooldown Window: {formCooldownSec} seconds
              </label>
              <input
                type="range"
                min="10"
                max="180"
                step="5"
                value={formCooldownSec}
                onChange={(e) => setFormCooldownSec(parseInt(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id="formSoundCheck"
                checked={formSound}
                onChange={(e) => setFormSound(e.target.checked)}
                className="rounded accent-cyan-400 w-4 h-4"
              />
              <label htmlFor="formSoundCheck" className="text-neutral-300 text-[11px] cursor-pointer">
                Play synthesized quant audio cue on trigger
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsAddingRule(false)}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
            >
              Save Custom Alert Rule
            </button>
          </div>
        </form>
      )}

      {/* 4. Active Rules List OR History Log */}
      {!viewHistory ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Active Configured Alerts ({rules.length})
            </span>
            <button
              onClick={handleResetDefaults}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-500">
              No alert rules configured. Click one of the instant presets above or create a custom rule.
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {rules.map((rule) => {
                const liveInfo = getLiveMetricValue(rule.metric);
                const isCrit = rule.severity === 'CRITICAL';
                const isWarn = rule.severity === 'WARNING';

                const badgeBg = isCrit
                  ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                  : isWarn
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                  : 'bg-cyan-950/80 text-cyan-300 border-cyan-800';

                return (
                  <div
                    key={rule.id}
                    className={`p-3 rounded-xl border transition-all ${
                      rule.isEnabled
                        ? 'bg-neutral-950/90 border-neutral-800 hover:border-neutral-700'
                        : 'bg-neutral-950/40 border-neutral-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: Toggle & Info */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={rule.isEnabled}
                          onChange={() => handleToggleRule(rule.id)}
                          title={rule.isEnabled ? 'Disable rule' : 'Enable rule'}
                          className="mt-0.5 w-4 h-4 rounded accent-cyan-400 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-xs truncate">
                              {rule.name}
                            </span>
                            <span className={`text-[9px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.2 rounded border ${badgeBg}`}>
                              {rule.severity}
                            </span>
                            {rule.triggerCount > 0 && (
                              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/60">
                                Triggered {rule.triggerCount}x
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-400 font-mono mt-0.5 flex items-center gap-2">
                            <span>
                              Trigger:{' '}
                              <strong className="text-neutral-200">
                                {rule.condition === 'ABOVE' ? '>' : rule.condition === 'BELOW' ? '<' : 'Δ >'}{' '}
                                {rule.threshold}
                                {rule.metric === 'SPOT_PRICE_SURGE' ? '$' : '%'}
                              </strong>
                            </span>
                            <span className="text-neutral-600">·</span>
                            <span>
                              Live Now:{' '}
                              <strong className="text-cyan-300">{liveInfo.val}</strong>
                            </span>
                            <span className="text-neutral-600">·</span>
                            <span className="text-neutral-500">Cooldown: {rule.cooldownSec}s</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleTestRule(rule.id)}
                          title="Simulate / Test Trigger notification"
                          className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded text-[10px] font-mono flex items-center gap-1 transition-colors"
                        >
                          <Play className="w-2.5 h-2.5 text-cyan-400" />
                          <span>Test</span>
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          title="Delete alert rule"
                          className="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* History Log View */
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Alert Trigger History ({history.length})
            </span>
            <button
              onClick={() => alertManager.clearHistory()}
              className="text-[10px] text-neutral-500 hover:text-rose-400 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear History</span>
            </button>
          </div>

          {history.length === 0 ? (
            <div className="p-6 text-center border border-neutral-800 rounded-xl text-neutral-500">
              No alert triggers recorded yet. Rules are actively monitoring the 15-minute BTC feed.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between text-[11px] font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.severity === 'CRITICAL'
                          ? 'bg-rose-500'
                          : item.severity === 'WARNING'
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                    />
                    <span className="font-bold text-white">{item.ruleName}</span>
                    <span className="text-neutral-400">({item.message})</span>
                  </div>
                  <span className="text-neutral-500 shrink-0">
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
