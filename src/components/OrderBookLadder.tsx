/**
 * Kalshi Prediction Market Order Book Depth Ladder
 * Displays real-time YES and NO bid/ask levels, spread in cents,
 * depth volume bars, and micro-price imbalance.
 */

import React from 'react';
import { KalshiOrderBook } from '../types/market';

interface OrderBookLadderProps {
  book: KalshiOrderBook;
  onQuickOrder?: (side: 'YES' | 'NO', price: number) => void;
}

export const OrderBookLadder: React.FC<OrderBookLadderProps> = ({ book, onQuickOrder }) => {
  const maxBidQty = Math.max(...book.yesBids.map((b) => b.quantity), 50);
  const maxAskQty = Math.max(...book.yesAsks.map((a) => a.quantity), 50);

  return (
    <div className="bg-neutral-900/60 rounded-xl border border-neutral-800/80 p-4 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-200">Order Book (YES)</span>
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-400 font-mono tabular-nums">Seq #{book.sequence}</span>
        </div>
        <div className="flex items-center gap-3 text-neutral-400">
          <span>Spread:</span>
          <span className={`font-mono tabular-nums font-semibold ${book.spread <= 2 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {book.spread}¢
          </span>
          <span className="text-neutral-600">·</span>
          <span>Mid:</span>
          <span className="font-mono tabular-nums text-neutral-200">{book.midPrice}¢</span>
        </div>
      </div>

      {/* Book Rows */}
      <div className="py-2 space-y-1">
        {/* Asks (Sell YES / Red) - Reversed order so highest ask is at top */}
        <div className="space-y-1">
          {book.yesAsks.slice().reverse().map((level, idx) => {
            const widthPct = Math.min((level.quantity / maxAskQty) * 100, 100);
            return (
              <div
                key={`ask-${level.price}-${idx}`}
                onClick={() => onQuickOrder && onQuickOrder('YES', level.price)}
                className="group relative flex items-center justify-between px-2 py-1 text-xs cursor-pointer rounded hover:bg-neutral-800/60 transition-colors"
              >
                {/* Visual depth bar */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-rose-500/15 rounded-r pointer-events-none transition-all"
                  style={{ width: `${widthPct}%` }}
                />
                <span className="font-mono tabular-nums text-rose-400 font-semibold z-10">
                  {level.price}¢
                </span>
                <span className="font-mono tabular-nums text-neutral-400 z-10 group-hover:text-neutral-200">
                  {level.quantity} ct
                </span>
              </div>
            );
          })}
        </div>

        {/* Spread Divider Bar */}
        <div className="py-1 my-1 px-2 flex items-center justify-between bg-neutral-950/80 rounded border border-neutral-800/60 text-[11px] text-neutral-400">
          <span className="text-neutral-500 font-mono">BBO Spread</span>
          <div className="flex items-center gap-2">
            <span className="font-mono tabular-nums text-cyan-400 font-semibold">{book.spread}¢</span>
            <span className="text-neutral-600">|</span>
            <span className="font-mono tabular-nums text-neutral-300">
              Imb: {book.microImbalance > 0 ? `+${book.microImbalance}` : book.microImbalance}
            </span>
          </div>
        </div>

        {/* Bids (Buy YES / Green) */}
        <div className="space-y-1">
          {book.yesBids.map((level, idx) => {
            const widthPct = Math.min((level.quantity / maxBidQty) * 100, 100);
            return (
              <div
                key={`bid-${level.price}-${idx}`}
                onClick={() => onQuickOrder && onQuickOrder('YES', level.price)}
                className="group relative flex items-center justify-between px-2 py-1 text-xs cursor-pointer rounded hover:bg-neutral-800/60 transition-colors"
              >
                {/* Visual depth bar */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-emerald-500/15 rounded-r pointer-events-none transition-all"
                  style={{ width: `${widthPct}%` }}
                />
                <span className="font-mono tabular-nums text-emerald-400 font-semibold z-10">
                  {level.price}¢
                </span>
                <span className="font-mono tabular-nums text-neutral-400 z-10 group-hover:text-neutral-200">
                  {level.quantity} ct
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Microstructure Summary */}
      <div className="pt-2 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
        <span>Click price level to populate order</span>
        <span className="font-mono text-neutral-500">Executable Taker</span>
      </div>
    </div>
  );
};
