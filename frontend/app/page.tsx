'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MetricsBar } from '@/components/MetricsBar';
import { SignalFeed } from '@/components/SignalFeed';
import { PositionTable } from '@/components/PositionTable';
import { StatusBanner } from '@/components/StatusBanner';
import { api } from '@/lib/api';
import { tradingWS } from '@/lib/ws';
import { useMarketStore } from '@/stores/market';
import { usePositionStore } from '@/stores/positions';

// Load chart client-side only (uses DOM APIs)
const PriceChart = dynamic(() => import('@/components/PriceChart').then(m => ({ default: m.PriceChart })), { ssr: false });

const SYMBOL = 'AAPL';

export default function DashboardPage() {
  const [account, setAccount]           = useState<any>(null);
  const [strategies, setStrategies]     = useState<any[]>([]);
  const [error, setError]               = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);

  const setCandles = useMarketStore(s => s.setCandles);
  const setPositions = usePositionStore(s => s.setPositions);

  // Initial data load
  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const [candles, acct, strats, positions] = await Promise.all([
          api.getCandles(SYMBOL, '1m', 300),
          api.getAccount(),
          api.getStrategies(),
          api.getPositions(),
        ]);

        setCandles(SYMBOL, candles);
        setAccount(acct);
        setStrategies(strats);
        setPositions(positions);
      } catch (e: any) {
        console.warn('Failed to load dashboard:', e);
        setError('Backend unavailable. Make sure the server is running on port 8000.');
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(async () => {
      try {
        const [acct, positions] = await Promise.all([api.getAccount(), api.getPositions()]);
        setAccount(acct);
        setPositions(positions);
        setError(null);
      } catch {
        // ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const activeStrategies = strategies.filter(s => s.status === 'ACTIVE').length;

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 gap-6 relative z-10">
      <header className="flex flex-col gap-4 shrink-0">
        <h1 className="text-2xl font-bold text-white tracking-tight">Market Overview</h1>
        <StatusBanner error={error} />
        <MetricsBar account={account} activeStrategies={activeStrategies} loading={loading} />
      </header>

      <div className="flex flex-1 overflow-hidden gap-6">
        <div className="flex flex-col flex-1 min-w-0 gap-6">
          {/* Chart Card */}
          <div className="flex-1 min-h-0 glow-card flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 bg-white/[0.02]">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                <span className="font-bold text-blue-400 text-sm">A</span>
              </div>
              <div>
                <h2 className="font-mono font-bold text-white tracking-tight">{SYMBOL}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">1m timeframe</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded border border-blue-400/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]">Paper</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-4">
              <PriceChart symbol={SYMBOL} />
            </div>
          </div>

          {/* Positions Card */}
          <div className="h-64 glow-card overflow-hidden flex flex-col shrink-0">
             <PositionTable loading={loading} />
          </div>
        </div>

        {/* Signals Sidebar */}
        <div className="w-80 glow-card flex flex-col overflow-hidden shrink-0">
          <SignalFeed />
        </div>
      </div>
    </div>
  );
}
