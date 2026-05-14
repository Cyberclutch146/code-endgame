import { create } from 'zustand';
import type { Signal } from '@/types';

interface SignalState {
  signals: Signal[];
  addSignal: (signal: Signal) => void;
  clearSignals: () => void;
}

export const useSignalStore = create<SignalState>((set) => ({
  signals: [],
  addSignal: (signal) => set((state) => ({
    signals: [signal, ...state.signals].slice(0, 100), // keep last 100
  })),
  clearSignals: () => set({ signals: [] }),
}));
