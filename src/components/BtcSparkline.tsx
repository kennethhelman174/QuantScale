/**
 * Micro SVG Sparkline Component for Navbar
 * Renders the 1-hour rolling trend of Bitcoin spot prices with 1h % change and tabular figures.
 */

import React from 'react';

interface BtcSparklineProps {
  spotPrice: number;
  spotHistory: number[];
}

export const BtcSparkline: React.FC<BtcSparklineProps> = ({
  spotPrice,
  spotHistory = [],
}) => {
  // Use last 60 points for 1-hour rolling trend
  const historyData = spotHistory.length > 0 ? spotHistory.slice(-60) : [spotPrice, spotPrice];
  const startPrice = historyData[0] || spotPrice;
  const deltaDollars = spotPrice - startPrice;
  const deltaPct = startPrice > 0 ? (deltaDollars / startPrice) * 100 : 0;
  const isPositive = deltaDollars >= 0;

  // SVG dimensions
  const width = 84;
  const height = 22;
  const padding = 2;

  const minVal = Math.min(...historyData);
  const maxVal = Math.max(...historyData);
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const points = historyData.map((val, idx) => {
    const x = padding + (idx / Math.max(historyData.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - ((val - minVal) / range) * (height - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = points.length > 0 ? `M ${points.join(' L ')}` : '';

  // Gradient area path
  const areaD = points.length > 0
    ? `M ${points[0]} L ${points.join(' L ')} L ${width - padding},${height} L ${padding},${height} Z`
    : '';

  const strokeColor = isPositive ? '#10b981' : '#f43f5e';
  const gradientId = `sparkline-grad-${isPositive ? 'up' : 'down'}`;

  return (
    <div
      title={`BTC 1-Hour Spot Trend: $${spotPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${isPositive ? '+' : ''}${deltaPct.toFixed(2)}%) | 1H Range: $${minVal.toLocaleString()} - $${maxVal.toLocaleString()}`}
      className="flex items-center gap-2.5 px-2.5 py-1 rounded bg-neutral-900/60 border border-neutral-800/80 shrink-0 text-xs font-mono"
    >
      {/* SVG Micro Trend Line */}
      <div className="relative shrink-0">
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>

      {/* Spot Price & 1H Delta Badge */}
      <div className="flex flex-col text-left leading-none">
        <span className="font-bold text-white tracking-tight tabular-nums text-[11px]">
          ${spotPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span
          className={`text-[10px] font-semibold tabular-nums mt-0.5 ${
            isPositive ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {isPositive ? '▲ +' : '▼ '}
          {deltaPct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
};
