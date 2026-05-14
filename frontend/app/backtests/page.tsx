'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, IChartApi, UTCTimestamp } from 'lightweight-charts';
import { api } from '@/lib/api';
import type { Backtest, BacktestMetrics, Strategy } from '@/types';

function MetricBlock({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  const num = Number(value);
  const color = (label.includes('Return') || label.includes('Win') || label.includes('Sharpe') || label.includes('PF'))
    ? (num > 0 ? 'text-green-400' : num < 0 ? 'text-red-400' : 'text-gray-300')
    : label.includes('Drawdown') ? (num < -5 ? 'text-red-400' : 'text-yellow-400')
    : 'text-gray-300';

  return (
    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
      <p className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}{unit}</p>
    </div>
  );
}

function EquityChart({ data }: { data: { timestamp: string; equity: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    chart.current = createChart(ref.current, {
      layout:     { background: { color: '#0d0e12' }, textColor: '#6b7280' },
      grid:       { vertLines: { color: '#1f2028' }, horzLines: { color: '#1f2028' } },
      rightPriceScale: { borderColor: '#2d2f3a' },
      timeScale:  { borderColor: '#2d2f3a', timeVisible: true },
      width:  ref.current.clientWidth,
      height: 220,
    });
    const series = chart.current.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 });
    series.setData(data.map(d => ({
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
  const [running, setRunning]       = useState(false);
  const [form, setForm] = useState({
    strategy_id: '', symbol: 'AAPL', timeframe: '1m',
    start_date: '2024-01-01', end_date: '2024-06-01',
  });

  const load = async () => {
    const [bts, strats] = await Promise.all([api.getBacktests(), api.getStrategies()]);
    setBacktests(bts);
    setStrategies(strats);
  };

  useEffect(() => { load(); }, []);

  // Poll running backtests
  useEffect(() => {
    const running = backtests.some(b => b.status === 'RUNNING');
    if (!running) return;
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
    <div className="min-h-screen bg-[#0a0b0e] text-gray-100">
      <div className="border-b border-white/5 px-6 py-3 flex gap-4 items-center">
        <span className="font-bold text-sm text-white">QuantTerminal</span>
        <span className="text-white/10">|</span>
        <a href="/"           className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Dashboard</a>
        <a href="/strategies" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Strategies</a>
        <a href="/backtests"  className="text-xs text-blue-400">Backtests</a>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Run form */}
        <div className="rounded-xl border border-white/5 bg-[#0d0e12] p-5">
          <h2 className="text-sm font-semibold mb-4 text-gray-300">Run Backtest</h2>
          <div className="grid grid-cols-3 gap-3">
            <select className="input" value={form.strategy_id}
              onChange={e => setForm(f => ({ ...f, strategy_id: e.target.value }))}>
              <option value="">Select strategy</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="input" placeholder="Symbol" value={form.symbol}
              onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} />
            <select className="input" value={form.timeframe}
              onChange={e => setForm(f => ({ ...f, timeframe: e.target.value }))}>
              {['1m', '5m', '15m', '1h'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
            <input className="input" type="date" value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            <input className="input" type="date" value={form.end_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <button onClick={handleRun} disabled={running || !form.strategy_id}
            className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors font-medium">
            {running ? 'Starting…' : 'Run Backtest'}
          </button>
        </div>

        {/* Results */}
        {selected && m && Object.keys(m).length > 0 && (
          <div className="rounded-xl border border-white/5 bg-[#0d0e12] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Results — {selected.symbol} {selected.timeframe}</h2>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-gray-300">× Close</button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <MetricBlock label="Total Return"   value={`${m.total_return}%`} />
              <MetricBlock label="Sharpe Ratio"   value={m.sharpe_ratio} />
              <MetricBlock label="Max Drawdown"   value={`${m.max_drawdown}%`} />
              <MetricBlock label="Win Rate"       value={`${m.win_rate}%`} />
              <MetricBlock label="Profit Factor"  value={m.profit_factor} />
              <MetricBlock label="Total Trades"   value={m.total_trades} />
              <MetricBlock label="Avg Win"        value={`$${m.avg_win}`} />
              <MetricBlock label="Avg Loss"       value={`$${m.avg_loss}`} />
              <MetricBlock label="Expectancy"     value={`$${m.expectancy}`} />
              <MetricBlock label="Final Equity"   value={`$${m.final_equity?.toLocaleString()}`} />
            </div>
            {selected.equity_curve?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Equity Curve</p>
                <EquityChart data={selected.equity_curve} />
              </div>
            )}
          </div>
        )}

        {/* Backtest list */}
        <div className="space-y-2">
          {backtests.map(bt => (
            <div key={bt.id}
              onClick={() => setSelected(selected?.id === bt.id ? null : bt)}
              className={`rounded-xl border cursor-pointer p-4 flex items-center justify-between transition-colors ${selected?.id === bt.id ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/5 bg-[#0d0e12] hover:bg-white/[0.03]'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${bt.status === 'COMPLETE' ? 'bg-green-400' : bt.status === 'RUNNING' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="font-mono text-sm font-medium">{bt.symbol}</span>
                <span className="text-xs text-gray-500">{bt.timeframe}</span>
                <span className="text-xs text-gray-600">{bt.start_date?.slice(0, 10)} → {bt.end_date?.slice(0, 10)}</span>
              </div>
              {bt.status === 'COMPLETE' && bt.metrics && (
                <div className="flex gap-4 text-xs font-mono">
                  <span className={(bt.metrics as any).total_return > 0 ? 'text-green-400' : 'text-red-400'}>
                    {(bt.metrics as any).total_return}%
                  </span>
                  <span className="text-gray-500">SR: {(bt.metrics as any).sharpe_ratio}</span>
                  <span className="text-gray-500">WR: {(bt.metrics as any).win_rate}%</span>
                </div>
              )}
              {bt.status === 'RUNNING' && <span className="text-xs text-yellow-400">Running…</span>}
              {bt.status === 'FAILED'  && <span className="text-xs text-red-400">Failed</span>}
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
