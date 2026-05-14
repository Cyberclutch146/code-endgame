'use client';
import { useSignalStore } from '@/stores/signals';
import type { Signal } from '@/types';
import { GlowBadge } from '@/components/GlowBadge';

function SignalBadge({ signal }: { signal: Signal }) {
  const dirColor = {
    LONG:  'success',
    SHORT: 'danger',
    CLOSE: 'warning',
  }[signal.direction] ?? 'neutral';

  return (
    <div className={`p-4 rounded-xl border ${signal.rejected ? 'opacity-50 grayscale' : 'glass-panel'} border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition-all animate-slide-in relative overflow-hidden group`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex items-center gap-3">
          <GlowBadge status={dirColor as any} text={signal.direction} />
          <span className="font-mono font-bold text-sm tracking-tight">{signal.symbol}</span>
          {signal.rejected && (
            <span className="text-[10px] uppercase font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded border border-red-400/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
              {signal.reject_reason || 'REJECTED'}
            </span>
          )}
        </div>
        {signal.confidence != null && (
          <span className="text-[10px] uppercase tracking-wider font-bold text-blue-400">{(signal.confidence * 100).toFixed(0)}% CONF</span>
        )}
      </div>
      <div className="flex gap-4 text-xs font-mono relative z-10 mt-3 p-2 rounded-lg bg-[#0d0e12]/50 border border-white/[0.02]">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase">Entry</span>
          <span className="font-bold text-gray-200">${Number(signal.entry_price).toFixed(2)}</span>
        </div>
        {signal.stop_loss && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase">SL</span>
            <span className="font-bold text-red-400">${Number(signal.stop_loss).toFixed(2)}</span>
          </div>
        )}
        {signal.take_profit && (
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase">TP</span>
            <span className="font-bold text-green-400">${Number(signal.take_profit).toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SignalFeed() {
  const signals = useSignalStore(s => s.signals);

  return (
    <div className="flex flex-col h-full bg-white/[0.01]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
          <h2 className="text-sm font-semibold text-gray-200">Live Signals</h2>
        </div>
        <span className="text-xs font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{signals.length} total</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-60">
            <div className="relative mb-4">
              <div className="w-12 h-12 border border-blue-500/30 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
              </div>
            </div>
            <p className="text-gray-400 text-sm font-medium tracking-wide">Waiting for signals…</p>
            <p className="text-gray-600 text-xs mt-1">Activate a strategy to begin</p>
          </div>
        ) : (
          signals.map((sig, i) => <SignalBadge key={i} signal={sig} />)
        )}
      </div>
    </div>
  );
}
