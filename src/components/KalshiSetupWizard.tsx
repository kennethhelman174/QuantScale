/**
 * Kalshi API Setup Wizard Component
 * Prompts operators for official Kalshi API credentials (Demo or Live Production) and Spot feed preferences,
 * tests connectivity against Kalshi exchange status, and configures live data feeds.
 */

import React, { useState } from 'react';
import { KalshiApiCredentials, ConnectivityTestResult } from '../services/kalshiClient';
import { ShieldCheck, Key, Lock, Globe, CheckCircle2, AlertTriangle, X, Loader2, Zap } from 'lucide-react';

interface KalshiSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCredentials: (creds: KalshiApiCredentials) => Promise<ConnectivityTestResult>;
  currentCredentials: KalshiApiCredentials;
}

export const KalshiSetupWizard: React.FC<KalshiSetupWizardProps> = ({
  isOpen,
  onClose,
  onSaveCredentials,
  currentCredentials,
}) => {
  const [environment, setEnvironment] = useState<'PAPER' | 'DEMO' | 'LIVE'>(currentCredentials.environment || 'DEMO');
  const [apiKey, setApiKey] = useState(currentCredentials.apiKey || '');
  const [apiSecret, setApiSecret] = useState(currentCredentials.apiSecret || '');
  const [keyId, setKeyId] = useState(currentCredentials.keyId || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityTestResult | null>(null);

  if (!isOpen) return null;

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setTestResult(null);

    const creds: KalshiApiCredentials = {
      environment,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      keyId: keyId.trim(),
    };

    try {
      const result = await onSaveCredentials(creds);
      setTestResult(result);
      if (result.isSuccess) {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err) {
      setTestResult({
        isSuccess: false,
        status: 'OFFLINE',
        latencyMs: 0,
        exchangeTime: new Date().toISOString(),
        tradingActive: false,
        message: (err as Error).message || 'Failed to connect to Kalshi gateway.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150 text-xs">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Kalshi Real-World API Setup Wizard</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleTestAndSave} className="p-6 space-y-4">
          <p className="text-neutral-400 leading-relaxed text-xs">
            Connect your official Kalshi API credentials to replace simulated data with real-world 15-minute Bitcoin prediction market order books, ticker feeds, and automated execution.
          </p>

          {/* Environment Selector */}
          <div>
            <label className="block text-neutral-300 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">
              Execution Environment
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['PAPER', 'DEMO', 'LIVE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEnvironment(m)}
                  className={`py-2 px-3 font-mono font-semibold rounded-xl border transition-colors text-xs ${
                    environment === m
                      ? m === 'LIVE'
                        ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                        : m === 'DEMO'
                        ? 'bg-cyan-950/80 border-cyan-600 text-cyan-300'
                        : 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {m === 'PAPER' && 'Simulated Paper'}
                  {m === 'DEMO' && 'Kalshi Demo (Sandbox)'}
                  {m === 'LIVE' && 'Live Production ($)'}
                </button>
              ))}
            </div>
          </div>

          {environment !== 'PAPER' && (
            <>
              {/* API Key ID */}
              <div>
                <label className="block text-neutral-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                  Kalshi Access Key ID / Email
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={keyId}
                    onChange={(e) => setKeyId(e.target.value)}
                    placeholder="e.g. k_key_id_992184128"
                    className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>

              {/* API Secret / Private Key */}
              <div>
                <label className="block text-neutral-300 font-semibold mb-1 uppercase tracking-wider text-[11px]">
                  Kalshi API Secret / RSA Private Key PEM
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="Paste private key or API secret string..."
                    className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-white text-xs focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                <span className="text-[10px] text-neutral-500 mt-1 block font-mono">
                  Credentials are stored securely in local browser session storage and never transmitted outside your client.
                </span>
              </div>
            </>
          )}

          {/* Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                testResult.isSuccess
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-800 text-rose-200'
              }`}
            >
              {testResult.isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-bold block">
                  {testResult.isSuccess ? 'Connection Verified Successfully' : 'Connection Failed'}
                </span>
                <p className="text-[11px] opacity-90 mt-0.5 font-mono">
                  {testResult.message} ({testResult.latencyMs}ms latency)
                </p>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-neutral-400 hover:text-white transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isTesting}
              className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-cyan-950/40"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying API Gateway...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Test & Save Credentials</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
