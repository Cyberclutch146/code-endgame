'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MetricsBar } from '@/components/MetricsBar';
import { SignalFeed } from '@/components/SignalFeed';
import { PositionTable } from '@/components/PositionTable';
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
  const [wsStatus, setWsStatus]         = useState('disconnected');
  const setCandles = useMarketStore(s => s.setCandles);
  const setPositions = usePositionStore(s => s.setPositions);

  // Track WS status
  useEffect(() => {
    const unsub = tradingWS.onStatusChange(setWsStatus);
    return unsub;
  }, []);

  // Initial data load
  useEffect(() => {
    const load = async () => {
      try {
        const [candles, acct, strats, positions] = await Promise.allSettled([
          api.getCandles(SYMBOL, '1m', 300),
          api.getAccount(),
          api.getStrategies(),
          api.getPositions(),
        ]);

        if (candles.status === 'fulfilled') setCandles(SYMBOL, candles.value);
        if (acct.status === 'fulfilled')    setAccount(acct.value);
        if (strats.status === 'fulfilled')  setStrategies(strats.value);
        if (positions.status === 'fulfilled') setPositions(positions.value);
      } catch { /* backend may not be ready yet */ }
    };

    load();
    const interval = setInterval(async () => {
      try {
        const [acct, positions] = await Promise.all([api.getAccount(), api.getPositions()]);
        setAccount(acct);
        setPositions(positions);
      } catch { /* ignore */ }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const activeStrategies = strategies.filter(s => s.status === 'ACTIVE').length;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0a0b0e]">
      {/* Top bar */}
      <MetricsBar account={account} wsStatus={wsStatus} activeStrategies={activeStrategies} />

      {/* Nav */}
      <nav className="flex gap-1 px-4 py-1.5 border-b border-white/5 bg-[#0d0e12]">
        <a href="/"            className="px-3 py-1 text-xs rounded text-blue-400 bg-blue-400/10">Dashboard</a>
        <a href="/strategies"  className="px-3 py-1 text-xs rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors">Strategies</a>
        <a href="/backtests"   className="px-3 py-1 text-xs rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors">Backtests</a>
      </nav>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart + positions (left) */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Symbol header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
            <span className="font-mono font-bold text-white">{SYMBOL}</span>
            <span className="text-xs text-gray-500">1m</span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">Paper Trading Mode</span>
          </div>

          {/* Chart (takes most vertical space) */}
          <div className="flex-1 min-h-0">
            <PriceChart symbol={SYMBOL} />
          </div>

          {/* Position table (bottom strip) */}
          <div className="h-48 border-t border-white/5 overflow-hidden">
            <PositionTable />
          </div>
        </div>

        {/* Signal feed (right sidebar) */}
        <div className="w-72 border-l border-white/5 flex flex-col overflow-hidden bg-[#0d0e12] shrink-0">
          <SignalFeed />
        </div>
      </div>
    </div>
  );
}
