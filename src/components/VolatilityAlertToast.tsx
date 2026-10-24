/**
 * Floating Institutional Volatility & Price-Action Notification Toasts
 * Renders high-visibility visual warnings when BTC volatility thresholds or price surges are crossed.
 */

import React, { useEffect, useState } from 'react';
import { alertManager } from '../services/alertManager';
import { VolatilityNotification } from '../types/alerts';
import { AlertTriangle, AlertCircle, Info, X, ExternalLink, Volume2, VolumeX } from 'lucide-react';

interface VolatilityAlertToastProps {
  onOpenAlertSettings: () => void;
}

export const VolatilityAlertToast: React.FC<VolatilityAlertToastProps> = ({ onOpenAlertSettings }) => {
  const [notifications, setNotifications] = useState<VolatilityNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(alertManager.isSoundEnabled());

  useEffect(() => {
    const update = () => {
      setNotifications([...alertManager.getActiveNotifications()]);
      setSoundEnabled(alertManager.isSoundEnabled());
    };

    update();
    const unsub = alertManager.subscribe(update);
    return unsub;
  }, []);

  // Auto-dismiss non-critical alerts after 7 seconds
  useEffect(() => {
    if (notifications.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      notifications.forEach((notif) => {
        if (notif.severity !== 'CRITICAL' && now - notif.timestamp > 7000) {
          alertManager.dismissNotification(notif.id);
        }
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [notifications]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none">
      {notifications.map((notif) => {
        const isCritical = notif.severity === 'CRITICAL';
        const isWarning = notif.severity === 'WARNING';

        const borderColor = isCritical
          ? 'border-rose-500/80 bg-neutral-950/95 shadow-[0_0_25px_rgba(244,63,94,0.35)]'
          : isWarning
          ? 'border-amber-500/80 bg-neutral-950/95 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
          : 'border-cyan-500/80 bg-neutral-950/95 shadow-[0_0_20px_rgba(6,182,212,0.25)]';

        const accentColor = isCritical
          ? 'text-rose-400'
          : isWarning
          ? 'text-amber-400'
          : 'text-cyan-400';

        const badgeBg = isCritical
          ? 'bg-rose-950/80 text-rose-300 border-rose-800'
          : isWarning
          ? 'bg-amber-950/80 text-amber-300 border-amber-800'
          : 'bg-cyan-950/80 text-cyan-300 border-cyan-800';

        return (
          <div
            key={notif.id}
            className={`pointer-events-auto flex flex-col p-3.5 rounded-xl border backdrop-blur-md transition-all duration-200 animate-in slide-in-from-top-3 ${borderColor}`}
            role="alert"
          >
            {/* Top Row: Severity Badge, Title, Dismiss */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                {isCritical ? (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                ) : isWarning ? (
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${accentColor}`} />
                ) : (
                  <Info className={`w-4 h-4 shrink-0 ${accentColor}`} />
                )}
                <span className={`text-[10px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${badgeBg}`}>
                  {notif.severity} ALERT
                </span>
                <span className="text-xs font-bold text-white tracking-tight truncate max-w-[190px]">
                  {notif.ruleName}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => alertManager.dismissNotification(notif.id)}
                  title="Dismiss notification"
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Message Body */}
            <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
              {notif.message}
            </p>

            {/* Bottom Details & Action */}
            <div className="mt-2.5 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10px] font-mono">
              <span className="text-neutral-500">
                {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => alertManager.dismissAllNotifications()}
                  className="text-neutral-400 hover:text-neutral-200 underline"
                >
                  Dismiss All
                </button>
                <button
                  onClick={() => {
                    alertManager.dismissNotification(notif.id);
                    onOpenAlertSettings();
                  }}
                  className={`flex items-center gap-1 font-semibold hover:underline ${accentColor}`}
                >
                  <span>Configure Alerts</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
