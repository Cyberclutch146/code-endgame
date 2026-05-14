'use client';
import { usePositionStore } from '@/stores/positions';
import { api } from '@/lib/api';
import { useState } from 'react';
import type { Position } from '@/types';

function PnLCell({ value }: { value: number }) {
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span className={`font-mono font-semibold ${pos ? 'text-green-400' : neg ? 'text-red-400' : 'text-gray-400'}`}>
      {pos ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}

export function PositionTable() {
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-semibold text-gray-300">Open Positions</h2>
        <span className="text-xs text-gray-600">{positions.length} open</span>
      </div>

      {positions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 text-xs">No open positions</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0d0e12] text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Symbol</th>
                <th className="text-left px-4 py-2">Side</th>
                <th className="text-right px-4 py-2">Qty</th>
                <th className="text-right px-4 py-2">Entry</th>
                <th className="text-right px-4 py-2">Current</th>
                <th className="text-right px-4 py-2">PnL</th>
                <th className="text-right px-4 py-2">SL / TP</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {positions.map((pos) => (
                <tr key={pos.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold">{pos.symbol}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${pos.side === 'LONG' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                      {pos.side}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{Number(pos.quantity).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">${Number(pos.avg_entry).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300">
                    ${pos.current_price ? Number(pos.current_price).toFixed(2) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <PnLCell value={Number(pos.unrealized_pnl)} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-500 text-[10px]">
                    <span className="text-red-400">{pos.stop_loss ? `$${Number(pos.stop_loss).toFixed(2)}` : '—'}</span>
                    {' / '}
                    <span className="text-green-400">{pos.take_profit ? `$${Number(pos.take_profit).toFixed(2)}` : '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleClose(pos)}
                      disabled={closing === pos.id}
                      className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
                    >
                      {closing === pos.id ? '…' : 'Close'}
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
