'use client';
import { useSignalStore } from '@/stores/signals';
import type { Signal } from '@/types';

function SignalBadge({ signal }: { signal: Signal }) {
  const dirColor = {
    LONG:  'text-green-400 bg-green-400/10 border-green-400/30',
    SHORT: 'text-red-400   bg-red-400/10   border-red-400/30',
    CLOSE: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  }[signal.direction] ?? 'text-gray-400';

  return (
    <div className={`p-3 rounded-lg border ${signal.rejected ? 'opacity-40' : ''} border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${dirColor}`}>
            {signal.direction}
          </span>
          <span className="font-mono font-semibold text-sm">{signal.symbol}</span>
          {signal.rejected && (
            <span className="text-xs text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20">
              {signal.reject_reason || 'REJECTED'}
            </span>
          )}
        </div>
        {signal.confidence != null && (
          <span className="text-xs text-gray-500">{(signal.confidence * 100).toFixed(0)}%</span>
        )}
      </div>
      <div className="flex gap-4 text-xs text-gray-500 font-mono">
        <span>Entry: <span className="text-gray-300">${Number(signal.entry_price).toFixed(2)}</span></span>
        {signal.stop_loss   && <span>SL: <span className="text-red-400">${Number(signal.stop_loss).toFixed(2)}</span></span>}
        {signal.take_profit && <span>TP: <span className="text-green-400">${Number(signal.take_profit).toFixed(2)}</span></span>}
      </div>
    </div>
  );
}

export function SignalFeed() {
  const signals = useSignalStore(s => s.signals);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-semibold text-gray-300">Live Signals</h2>
        <span className="text-xs text-gray-600">{signals.length} received</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {signals.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse mx-auto mb-2" />
            <p className="text-gray-600 text-xs">Waiting for signals…</p>
            <p className="text-gray-700 text-xs mt-1">Activate a strategy to begin</p>
          </div>
        ) : (
          signals.map((sig, i) => <SignalBadge key={i} signal={sig} />)
        )}
      </div>
    </div>
  );
}
