'use client';
import { usePositionStore } from '@/stores/positions';
import { api } from '@/lib/api';
import { useState } from 'react';
import type { Position } from '@/types';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { GlowBadge } from '@/components/GlowBadge';

function PnLCell({ value }: { value: number }) {
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span className={`font-mono font-bold ${pos ? 'text-green-400 text-glow-green' : neg ? 'text-red-400 text-glow-red' : 'text-gray-400'}`}>
      {pos ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}

export function PositionTable({ loading }: { loading?: boolean }) {
  const positions = usePositionStore(s => s.positions);
  const removePosition = usePositionStore(s => s.removePosition);
  const [closing, setClosing] = useState<string | null>(null);

  const handleClose = async (pos: Position) => {
    setClosing(pos.id);
    try {
      await api.closePosition(pos.symbol, pos.strategy_id);
      removePosition(pos.symbol, pos.strategy_id);
    } catch (e) {
      console.error(e);
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/[0.01]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02]">
        <h2 className="text-sm font-semibold text-gray-200">Open Positions</h2>
        <span className="text-xs font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{positions.length} open</span>
      </div>

      {loading ? (
        <div className="flex-1 p-4 space-y-3">
          <SkeletonLoader className="h-8 w-full" />
          <SkeletonLoader className="h-8 w-full" />
          <SkeletonLoader className="h-8 w-full opacity-50" />
        </div>
      ) : positions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-60">
          <div className="text-2xl mb-2">📁</div>
          <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">No open positions</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0d0e12]/90 backdrop-blur-md text-gray-500 uppercase tracking-wider shadow-sm z-10">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Symbol</th>
                <th className="text-left px-5 py-3 font-medium">Side</th>
                <th className="text-right px-5 py-3 font-medium">Qty</th>
                <th className="text-right px-5 py-3 font-medium">Entry</th>
                <th className="text-right px-5 py-3 font-medium">Current</th>
                <th className="text-right px-5 py-3 font-medium">PnL</th>
                <th className="text-right px-5 py-3 font-medium">SL / TP</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {positions.map((pos) => (
                <tr key={pos.id} className="hover:bg-white/[0.03] transition-colors group">
                  <td className="px-5 py-3 font-mono font-bold text-gray-200">{pos.symbol}</td>
                  <td className="px-5 py-3">
                    <GlowBadge status={pos.side === 'LONG' ? 'success' : 'danger'} text={pos.side} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-gray-300">{Number(pos.quantity).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-mono text-gray-300">${Number(pos.avg_entry).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-mono text-white font-medium">
                    ${pos.current_price ? Number(pos.current_price).toFixed(2) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <PnLCell value={Number(pos.unrealized_pnl)} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-[10px]">
                    <span className="text-red-400/80">{pos.stop_loss ? `$${Number(pos.stop_loss).toFixed(2)}` : '—'}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-green-400/80">{pos.take_profit ? `$${Number(pos.take_profit).toFixed(2)}` : '—'}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleClose(pos)}
                      disabled={closing === pos.id}
                      className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all disabled:opacity-40 shadow-[0_0_10px_rgba(239,68,68,0)] hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      {closing === pos.id ? '...' : 'Close'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
