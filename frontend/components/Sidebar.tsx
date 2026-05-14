'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { tradingWS } from '@/lib/ws';
import { api } from '@/lib/api';

export function Sidebar() {
  const pathname = usePathname();
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [equity, setEquity] = useState<number | null>(null);

  useEffect(() => {
    const unsub = tradingWS.onStatusChange(setWsStatus);
    return unsub;
  }, []);

  useEffect(() => {
    const fetchEquity = async () => {
      try {
        const acct = await api.getAccount();
        setEquity(acct?.equity);
      } catch {
        // Ignore
      }
    };
    fetchEquity();
    const interval = setInterval(fetchEquity, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: '📊' },
    { name: 'Strategies', path: '/strategies', icon: '⚡' },
    { name: 'Backtests', path: '/backtests', icon: '🧪' },
  ];

  const wsColor = wsStatus === 'connected' ? 'bg-green-400' : wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-500';

  return (
    <aside className="w-64 border-r border-white/5 bg-[#0a0b0e]/80 backdrop-blur-xl flex flex-col shrink-0">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
          <span className="font-bold tracking-tight text-white text-lg">QuantTerminal</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.02] border border-transparent'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`font-medium ${isActive ? 'text-white' : ''}`}>{item.name}</span>
              {isActive && (
                <div className="ml-auto w-1 h-4 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
              )}
            </a>
          );
        })}
      </nav>

      {/* Status Footer */}
      <div className="p-4 border-t border-white/5 bg-white/[0.01]">
        <div className="glass-panel p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Status</span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${wsColor}`} />
              <span className="text-xs text-gray-400 capitalize">{wsStatus}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Equity</span>
            <span className="font-mono text-sm font-bold text-white">
              {equity != null ? `$${equity.toLocaleString('en', { minimumFractionDigits: 2 })}` : '—'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
