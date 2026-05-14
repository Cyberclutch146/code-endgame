import { create } from 'zustand';
import type { Position } from '@/types';

interface PositionState {
  positions: Position[];
  setPositions:   (positions: Position[]) => void;
  updatePosition: (position: Position) => void;
  removePosition: (symbol?: string, strategyId?: string) => void;
}

export const usePositionStore = create<PositionState>((set) => ({
  positions: [],

  setPositions: (positions) => set({ positions }),

  updatePosition: (pos) => set((state) => {
    const key = `${pos.strategy_id}:${pos.symbol}`;
    const existing = state.positions.findIndex(
      p => `${p.strategy_id}:${p.symbol}` === key
    );
    if (existing >= 0) {
      const updated = [...state.positions];
      updated[existing] = pos;
      return { positions: updated };
    }
    return { positions: [...state.positions, pos] };
  }),

  removePosition: (symbol, strategyId) => set((state) => ({
    positions: state.positions.filter(
      p => !(p.symbol === symbol && p.strategy_id === strategyId)
    ),
  })),
}));
