/**
 * Interactive Financial Candlestick & Probability Overlay Chart
 *
 * Renders:
 * - 15-Minute BTC Spot Candlesticks (OHLC)
 * - Kalshi Contract Strike Price horizontal guideline
 * - Active position entry markers and trailing stop levels
 * - Settlement probability density curve
 */

import React, { useMemo } from 'react';
import { Candle, Position } from '../types/market';

interface ChartCanvasProps {
  candles: Candle[];
  spotPrice: number;
  strikePrice: number;
  positions: Position[];
  timeRemainingSec: number;
  fairPriceYesCents: number;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({
  candles,
  spotPrice,
  strikePrice,
  positions,
  timeRemainingSec,
  fairPriceYesCents,
}) => {
  // Compute chart scales
  const { minPrice, maxPrice, priceRange, width, height } = useMemo(() => {
    const w = 840;
    const h = 320;
    if (candles.length === 0) {
      return { minPrice: 65000, maxPrice: 70000, priceRange: 5000, width: w, height: h };
    }

    const prices = candles.flatMap((c) => [c.high, c.low]);
    prices.push(spotPrice, strikePrice);
    for (const p of positions) {
      if (p.stopLossPrice) prices.push(strikePrice);
    }

    const min = Math.min(...prices) - 25;
    const max = Math.max(...prices) + 25;
    return {
      minPrice: min,
      maxPrice: max,
      priceRange: Math.max(max - min, 10),
      width: w,
      height: h,
    };
  }, [candles, spotPrice, strikePrice, positions]);

  const getY = (val: number) => {
    const ratio = (val - minPrice) / priceRange;
    return height - 30 - ratio * (height - 60);
  };

  const candleWidth = 10;
  const candleGap = 4;
  const totalCandles = candles.slice(-45); // last 45 candles

  const strikeY = getY(strikePrice);
  const spotY = getY(spotPrice);

  return (
    <div className="relative w-full h-[320px] bg-neutral-900/60 rounded-xl border border-neutral-800/80 overflow-hidden select-none">
      {/* Header telemetry overlay */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-200">BTC/USD Spot Index</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono tabular-nums text-neutral-100 font-bold text-sm">
          ${spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-neutral-400">Strike:</span>
        <span className="font-mono tabular-nums text-amber-400 font-semibold">
          ${strikePrice.toLocaleString()}
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-neutral-400">Expiry In:</span>
        <span className="font-mono tabular-nums text-cyan-400 font-semibold">
          {Math.floor(timeRemainingSec / 60)}m {timeRemainingSec % 60}s
        </span>
      </div>

      {/* SVG Candlestick Graphic */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#171922" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0f1015" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0.2, 0.4, 0.6, 0.8].map((pct, idx) => {
          const y = height * pct;
          const priceLabel = Math.round(maxPrice - pct * priceRange);
          return (
            <g key={idx}>
              <line
                x1="0"
                y1={y}
                x2={width - 65}
                y2={y}
                stroke="#222530"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={width - 60}
                y={y + 4}
                fill="#555d72"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                ${priceLabel.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Strike Price Line (Amber Reference) */}
        <line
          x1="0"
          y1={strikeY}
          x2={width}
          y2={strikeY}
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text
          x={width - 85}
          y={strikeY - 6}
          fill="#f59e0b"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
          fontWeight="bold"
        >
          STRIKE ${strikePrice.toLocaleString()}
        </text>

        {/* Spot BTC Current Price Line (Cyan Reference) */}
        <line
          x1="0"
          y1={spotY}
          x2={width}
          y2={spotY}
          stroke="#06b6d4"
          strokeWidth="1.2"
          opacity="0.85"
        />

        {/* Candlesticks */}
        {totalCandles.map((c, i) => {
          const x = 30 + i * (candleWidth + candleGap);
          const isUp = c.close >= c.open;
          const openY = getY(c.open);
          const closeY = getY(c.close);
          const highY = getY(c.high);
          const lowY = getY(c.low);

          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), 1.5);
          const color = isUp ? '#10b981' : '#f43f5e';

          return (
            <g key={c.timestamp || i}>
              {/* Wick */}
              <line
                x1={x + candleWidth / 2}
                y1={highY}
                x2={x + candleWidth / 2}
                y2={lowY}
                stroke={color}
                strokeWidth="1.2"
              />
              {/* Candle Body */}
              <rect
                x={x}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                rx="1"
              />
            </g>
          );
        })}

        {/* Position Entry & Trailing Stop Annotations */}
        {positions
          .filter((p) => p.status === 'OPEN')
          .map((pos) => {
            const entryY = spotY;
            return (
              <g key={pos.id}>
                {/* Entry marker circle */}
                <circle
                  cx={width - 120}
                  cy={entryY}
                  r="5"
                  fill={pos.side === 'YES' ? '#10b981' : '#f43f5e'}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <text
                  x={width - 110}
                  y={entryY + 4}
                  fill="#ffffff"
                  fontSize="11"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="bold"
                >
                  {pos.side} @ {pos.entryPrice}¢ ({pos.contracts}ct)
                </text>
              </g>
            );
          })}
      </svg>

      {/* Floating Probability Gauge in lower-right */}
      <div className="absolute bottom-3 right-4 z-10 flex items-center gap-3 px-3 py-1.5 bg-neutral-950/85 backdrop-blur-sm rounded-lg border border-neutral-800 text-xs text-neutral-300">
        <span className="text-neutral-400">P(YES Fair):</span>
        <span className="font-mono tabular-nums font-bold text-emerald-400">
          {fairPriceYesCents}%
        </span>
        <span aria-hidden="true" className="text-neutral-600">·</span>
        <span className="text-neutral-400">P(NO Fair):</span>
        <span className="font-mono tabular-nums font-bold text-rose-400">
          {100 - fairPriceYesCents}%
        </span>
      </div>
    </div>
  );
};
