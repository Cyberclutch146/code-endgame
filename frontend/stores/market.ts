import { create } from 'zustand';
import type { Candle } from '@/types';

const MAX_CANDLES = 500;

interface MarketState {
  candles: Record<string, Candle[]>; // symbol -> candles
  prices:  Record<string, number>;   // symbol -> latest close
  addCandle: (candle: Candle) => void;
  setCandles: (symbol: string, candles: Candle[]) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  candles: {},
  prices:  {},

  addCandle: (candle) => set((state) => {
    const key = candle.symbol;
    const existing = state.candles[key] ?? [];
    const last = existing[existing.length - 1];

    let updated: Candle[];
    // Same timestamp → update last candle (in-progress bar)
    if (last && last.open_time === candle.open_time) {
      updated = [...existing.slice(0, -1), candle];
    } else {
      updated = [...existing, candle].slice(-MAX_CANDLES);
    }

    return {
      candles: { ...state.candles, [key]: updated },
      prices:  { ...state.prices,  [key]: Number(candle.close) },
    };
  }),

  setCandles: (symbol, candles) => set((state) => ({
    candles: { ...state.candles, [symbol]: candles.slice(-MAX_CANDLES) },
    prices:  { ...state.prices,  [symbol]: candles.length > 0 ? Number(candles[candles.length - 1].close) : 0 },
  })),
}));
