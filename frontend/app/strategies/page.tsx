'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Strategy } from '@/types';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE:   'bg-green-400/10 text-green-400 border-green-400/30',
    INACTIVE: 'bg-gray-400/10 text-gray-400 border-gray-400/30',
    ERROR:    'bg-red-400/10  text-red-400  border-red-400/30',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${styles[status] ?? styles.INACTIVE}`}>
      {status}
    </span>
  );
}

export default function StrategiesPage() {
  const [strategies, setStrategies]   = useState<Strategy[]>([]);
  const [available, setAvailable]     = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [form, setForm] = useState({
    name: '', class_name: '', symbols: 'AAPL', timeframe: '1m', parameters: '{}',
  });

  const load = async () => {
    const [strats, avail] = await Promise.all([api.getStrategies(), api.getAvailableStrategies()]);
    setStrategies(strats);
    setAvailable(avail);
    setLoading(false);
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

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-gray-100">
      {/* Nav */}
      <div className="border-b border-white/5 px-6 py-3 flex gap-4 items-center">
        <span className="font-bold text-sm text-white">QuantTerminal</span>
        <span className="text-white/10">|</span>
        <a href="/"           className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Dashboard</a>
        <a href="/strategies" className="text-xs text-blue-400">Strategies</a>
        <a href="/backtests"  className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Backtests</a>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Create form */}
        <div className="rounded-xl border border-white/5 bg-[#0d0e12] p-5">
          <h2 className="text-sm font-semibold mb-4 text-gray-300">Create Strategy</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className="input col-span-1" placeholder="Display name" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <select className="input" value={form.class_name}
              onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}>
              <option value="">Select strategy class</option>
              {available.map(a => <option key={a.class_name} value={a.class_name}>{a.name}</option>)}
            </select>
            <input className="input" placeholder="Symbols (comma-sep)" value={form.symbols}
              onChange={e => setForm(f => ({ ...f, symbols: e.target.value }))} />
            <select className="input" value={form.timeframe}
              onChange={e => setForm(f => ({ ...f, timeframe: e.target.value }))}>
              {['1m', '5m', '15m', '1h'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
            <input className="input col-span-2 font-mono text-sm" placeholder='Parameters JSON, e.g. {"fast_period":20}' value={form.parameters}
              onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))} />
          </div>
          <button onClick={handleCreate} disabled={creating || !form.name || !form.class_name}
            className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors font-medium">
            {creating ? 'Creating…' : 'Create Strategy'}
          </button>
        </div>

        {/* Strategy list */}
        <div className="space-y-3">
          {strategies.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-8">No strategies yet. Create one above.</p>
          )}
          {strategies.map(s => (
            <div key={s.id} className="rounded-xl border border-white/5 bg-[#0d0e12] p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <StatusBadge status={s.status} />
                  <span className="text-xs text-gray-600">{s.class_name}</span>
                </div>
                <div className="flex gap-3 text-xs text-gray-500 font-mono">
                  <span>{s.symbols.join(', ')}</span>
                  <span>·</span>
                  <span>{s.timeframe}</span>
                  <span>·</span>
                  <span>{JSON.stringify(s.parameters)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {s.status !== 'ACTIVE' ? (
                  <button onClick={() => handleStart(s.id)}
                    className="px-3 py-1.5 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg border border-green-400/20 transition-colors font-medium">
                    Start
                  </button>
                ) : (
                  <button onClick={() => handleStop(s.id)}
                    className="px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg border border-red-400/20 transition-colors font-medium">
                    Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .input { @apply w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors; }
      `}</style>
    </div>
  );
}
