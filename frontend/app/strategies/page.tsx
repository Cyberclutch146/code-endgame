'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Strategy } from '@/types';
import { StatusBanner } from '@/components/StatusBanner';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { GlowBadge } from '@/components/GlowBadge';

export default function StrategiesPage() {
  const [strategies, setStrategies]   = useState<Strategy[]>([]);
  const [available, setAvailable]     = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [creating, setCreating]       = useState(false);
  const [form, setForm] = useState({
    name: '', class_name: '', symbols: 'AAPL', timeframe: '1m', parameters: '{}',
  });

  const load = async () => {
    try {
      setError(null);
      const [strats, avail] = await Promise.all([api.getStrategies(), api.getAvailableStrategies()]);
      setStrategies(strats);
      setAvailable(avail);
    } catch (e: any) {
      console.warn('Failed to load strategies:', e);
      setError('Backend unavailable. Make sure the server is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStart = async (id: string) => {
    await api.startStrategy(id);
    load();
  };

  const handleStop = async (id: string) => {
    await api.stopStrategy(id);
    load();
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.createStrategy({
        name:       form.name,
        class_name: form.class_name,
        symbols:    form.symbols.split(',').map(s => s.trim().toUpperCase()),
        timeframe:  form.timeframe,
        parameters: JSON.parse(form.parameters),
      });
      load();
      setForm({ name: '', class_name: '', symbols: 'AAPL', timeframe: '1m', parameters: '{}' });
    } catch (e) { console.error(e); }
    setCreating(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 gap-6 relative z-10 overflow-y-auto">
      <header className="flex flex-col gap-4 shrink-0">
        <h1 className="text-2xl font-bold text-white tracking-tight">Trading Strategies</h1>
        <StatusBanner error={error} />
      </header>

      <div className="max-w-4xl space-y-8 w-full pb-10">
        {/* Create form */}
        <div className="glow-card p-6">
          <h2 className="text-sm font-semibold mb-5 text-gray-200">Deploy New Strategy</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Display Name</label>
              <input className="input" placeholder="e.g. MACD Alpha" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Strategy Class</label>
              <select className="input" value={form.class_name}
                onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}>
                <option value="">Select strategy class</option>
                {available.map(a => <option key={a.class_name} value={a.class_name}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Symbols</label>
              <input className="input" placeholder="AAPL, MSFT" value={form.symbols}
                onChange={e => setForm(f => ({ ...f, symbols: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Timeframe</label>
              <select className="input" value={form.timeframe}
                onChange={e => setForm(f => ({ ...f, timeframe: e.target.value }))}>
                {['1m', '5m', '15m', '1h'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Parameters (JSON)</label>
              <input className="input font-mono text-sm" placeholder='{"fast_period":20}' value={form.parameters}
                onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))} />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating || !form.name || !form.class_name}
            className="mt-6 w-full btn-primary">
            {creating ? 'Deploying...' : 'Deploy Strategy'}
          </button>
        </div>

        {/* Strategy list */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-200">Active Deployments</h2>
          
          {loading ? (
            <div className="space-y-3">
              <SkeletonLoader className="h-24 w-full" />
              <SkeletonLoader className="h-24 w-full" />
            </div>
          ) : strategies.length === 0 ? (
            <div className="glass-panel p-10 flex flex-col items-center justify-center opacity-70">
              <div className="text-3xl mb-3">🤖</div>
              <p className="text-gray-400 text-sm font-medium">No strategies deployed</p>
              <p className="text-gray-500 text-xs mt-1">Configure and deploy your first strategy above</p>
            </div>
          ) : (
            strategies.map(s => (
              <div key={s.id} className="glass-panel p-5 flex items-center justify-between hover:bg-white/[0.03] transition-all group">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-base text-gray-100">{s.name}</span>
                    <GlowBadge 
                      status={s.status === 'ACTIVE' ? 'success' : s.status === 'ERROR' ? 'danger' : 'neutral'} 
                      text={s.status} 
                    />
                    <span className="text-xs text-gray-500 uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded border border-white/5">{s.class_name}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-400 font-mono">
                    <span className="font-semibold text-gray-300">{s.symbols.join(', ')}</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-blue-400 font-bold">{s.timeframe}</span>
                    <span className="text-gray-600">•</span>
                    <span className="truncate max-w-xs">{JSON.stringify(s.parameters)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {s.status !== 'ACTIVE' ? (
                    <button onClick={() => handleStart(s.id)}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg border border-green-500/20 transition-all shadow-[0_0_10px_rgba(34,197,94,0)] hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]">
                      Start
                    </button>
                  ) : (
                    <button onClick={() => handleStop(s.id)}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-all shadow-[0_0_10px_rgba(239,68,68,0)] hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                      Stop
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
