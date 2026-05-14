'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, IChartApi, UTCTimestamp } from 'lightweight-charts';
import { api } from '@/lib/api';
import type { Backtest, BacktestMetrics, Strategy } from '@/types';
import { StatusBanner } from '@/components/StatusBanner';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { GlowBadge } from '@/components/GlowBadge';

function MetricBlock({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  const num = Number(value);
  const color = (label.includes('Return') || label.includes('Win') || label.includes('Sharpe') || label.includes('PF'))
    ? (num > 0 ? 'text-green-400 text-glow-green' : num < 0 ? 'text-red-400 text-glow-red' : 'text-gray-300')
    : label.includes('Drawdown') ? (num < -5 ? 'text-red-400 text-glow-red' : 'text-yellow-400')
    : 'text-gray-300';

  return (
    <div className="glass-panel p-4 flex flex-col gap-1 transition-all hover:bg-white/[0.04]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-xl font-bold font-mono tracking-tight ${color}`}>{value}{unit}</p>
    </div>
  );
}

function EquityChart({ data }: { data: { timestamp: string; equity: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    chart.current = createChart(ref.current, {
      layout:     { background: { color: 'transparent' }, textColor: '#6b7280' },
      grid:       { vertLines: { color: 'rgba(255,255,255,0.02)' }, horzLines: { color: 'rgba(255,255,255,0.02)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.05)' },
      timeScale:  { borderColor: 'rgba(255,255,255,0.05)', timeVisible: true },
      width:  ref.current.clientWidth,
      height: 220,
    });
    
    // Add gradient area underneath the line
    const areaSeries = chart.current.addAreaSeries({
      lineColor: '#3b82f6',
      topColor: 'rgba(59, 130, 246, 0.4)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineWidth: 2,
    });
    
    areaSeries.setData(data.map(d => ({
      time:  (new Date(d.timestamp).getTime() / 1000) as UTCTimestamp,
      value: d.equity,
    })).sort((a, b) => a.time - b.time));
    
    chart.current.timeScale().fitContent();
    return () => chart.current?.remove();
  }, [data]);

  return <div ref={ref} className="w-full" />;
}

export default function BacktestsPage() {
  const [backtests, setBacktests]   = useState<Backtest[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selected, setSelected]     = useState<Backtest | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [running, setRunning]       = useState(false);
  const [form, setForm] = useState({
    strategy_id: '', symbol: 'AAPL', timeframe: '1m',
    start_date: '2024-01-01', end_date: '2024-06-01',
  });

  const load = async () => {
    try {
      setError(null);
      const [bts, strats] = await Promise.all([api.getBacktests(), api.getStrategies()]);
      setBacktests(bts);
      setStrategies(strats);
    } catch (e: any) {
      console.warn('Failed to load backtests:', e);
      setError('Backend unavailable. Make sure the server is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Poll running backtests
  useEffect(() => {
    const isRunning = backtests.some(b => b.status === 'RUNNING');
    if (!isRunning) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [backtests]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const bt = await api.createBacktest({
        strategy_id: form.strategy_id,
        symbol:      form.symbol.toUpperCase(),
        timeframe:   form.timeframe,
        start_date:  new Date(form.start_date).toISOString(),
        end_date:    new Date(form.end_date).toISOString(),
      });
      setBacktests(prev => [bt, ...prev]);
    } catch (e) { console.error(e); }
    setRunning(false);
  };

  const m: BacktestMetrics | null = selected?.metrics as any;

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 gap-6 relative z-10 overflow-y-auto">
      <header className="flex flex-col gap-4 shrink-0">
        <h1 className="text-2xl font-bold text-white tracking-tight">Strategy Lab</h1>
        <StatusBanner error={error} />
      </header>

      <div className="max-w-5xl space-y-6 w-full pb-10">
        {/* Run form */}
        <div className="glow-card p-6">
          <h2 className="text-sm font-semibold mb-5 text-gray-200">Run Backtest</h2>
          <div className="grid grid-cols-5 gap-4">
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Strategy</label>
              <select className="input" value={form.strategy_id}
                onChange={e => setForm(f => ({ ...f, strategy_id: e.target.value }))}>
                <option value="">Select strategy</option>
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Symbol</label>
              <input className="input" placeholder="Symbol" value={form.symbol}
                onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Timeframe</label>
              <select className="input" value={form.timeframe}
                onChange={e => setForm(f => ({ ...f, timeframe: e.target.value }))}>
                {['1m', '5m', '15m', '1h'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Start Date</label>
              <input className="input" type="date" value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">End Date</label>
              <input className="input" type="date" value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <button onClick={handleRun} disabled={running || !form.strategy_id}
            className="mt-6 w-full btn-primary">
            {running ? 'Processing...' : 'Run Backtest Engine'}
          </button>
        </div>

        {/* Results */}
        {selected && m && Object.keys(m).length > 0 && (
          <div className="glow-card p-6 space-y-6 border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                  <span className="font-bold text-blue-400 text-sm">🧪</span>
                </div>
                <div>
                  <h2 className="font-bold text-white tracking-tight">Results — {selected.symbol}</h2>
                  <span className="text-xs text-blue-400">{selected.timeframe}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                Close Report
              </button>
            </div>
            
            <div className="grid grid-cols-5 gap-3">
              <MetricBlock label="Total Return"   value={`${m.total_return.toFixed(2)}`} unit="%" />
              <MetricBlock label="Sharpe Ratio"   value={m.sharpe_ratio?.toFixed(2) ?? '0'} />
              <MetricBlock label="Max Drawdown"   value={`${m.max_drawdown?.toFixed(2) ?? '0'}`} unit="%" />
              <MetricBlock label="Win Rate"       value={`${m.win_rate?.toFixed(2) ?? '0'}`} unit="%" />
              <MetricBlock label="Profit Factor"  value={m.profit_factor?.toFixed(2) ?? '0'} />
              <MetricBlock label="Total Trades"   value={m.total_trades} />
              <MetricBlock label="Avg Win"        value={`$${m.avg_win?.toFixed(2) ?? '0'}`} />
              <MetricBlock label="Avg Loss"       value={`$${m.avg_loss?.toFixed(2) ?? '0'}`} />
              <MetricBlock label="Expectancy"     value={`$${m.expectancy?.toFixed(2) ?? '0'}`} />
              <MetricBlock label="Final Equity"   value={`$${m.final_equity?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? '0'}`} />
            </div>
            
            {selected.equity_curve?.length > 0 && (
              <div className="pt-4 border-t border-white/5">
                <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500 mb-4">Equity Curve</p>
                <div className="glass-panel p-4">
                  <EquityChart data={selected.equity_curve} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Backtest list */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-200">History</h2>
          
          {loading ? (
            <div className="space-y-3">
              <SkeletonLoader className="h-16 w-full" />
              <SkeletonLoader className="h-16 w-full" />
              <SkeletonLoader className="h-16 w-full" />
            </div>
          ) : backtests.length === 0 ? (
            <div className="glass-panel p-10 flex flex-col items-center justify-center opacity-70">
              <div className="text-3xl mb-3">🗄️</div>
              <p className="text-gray-400 text-sm font-medium">No backtest history</p>
            </div>
          ) : (
            backtests.map(bt => (
              <div key={bt.id}
                onClick={() => setSelected(selected?.id === bt.id ? null : bt)}
                className={`glass-panel cursor-pointer p-5 flex items-center justify-between transition-all group ${selected?.id === bt.id ? 'border-blue-500/30 bg-blue-500/10 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]' : 'hover:bg-white/[0.04]'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full ${bt.status === 'COMPLETE' ? 'bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : bt.status === 'RUNNING' ? 'bg-yellow-400 animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`} />
                  
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gray-100">{bt.symbol}</span>
                      <span className="text-[10px] text-blue-400 font-bold bg-blue-400/10 px-1.5 py-0.5 rounded">{bt.timeframe}</span>
                    </div>
                    <span className="text-xs text-gray-500 mt-0.5">{bt.start_date?.slice(0, 10)} → {bt.end_date?.slice(0, 10)}</span>
                  </div>
                </div>
                
                {bt.status === 'COMPLETE' && bt.metrics && (
                  <div className="flex gap-6 text-sm font-mono items-center">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-gray-500 uppercase">Return</span>
                      <span className={(bt.metrics as any).total_return > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                        {Number((bt.metrics as any).total_return).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-gray-500 uppercase">Sharpe</span>
                      <span className="text-gray-300 font-bold">{Number((bt.metrics as any).sharpe_ratio || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-gray-500 uppercase">Win Rate</span>
                      <span className="text-gray-300 font-bold">{Number((bt.metrics as any).win_rate || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                )}
                {bt.status === 'RUNNING' && <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider animate-pulse">Running</span>}
                {bt.status === 'FAILED'  && <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Failed</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
