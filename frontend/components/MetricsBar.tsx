'use client';

import { SkeletonLoader } from '@/components/SkeletonLoader';

interface MetricCardProps {
  label:     string;
  value:     string;
  sub?:      string;
  positive?: boolean | null;
  loading?:  boolean;
}

function MetricCard({ label, value, sub, positive, loading }: MetricCardProps) {
  const color = positive === true ? 'text-green-400 text-glow-green' : positive === false ? 'text-red-400 text-glow-red' : 'text-white';
  return (
    <div className="glass-panel flex-1 flex flex-col gap-1 p-4 relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 relative z-10">{label}</span>
      {loading ? (
        <SkeletonLoader className="h-8 w-24 mt-1" />
      ) : (
        <div className="flex items-baseline gap-2 relative z-10">
          <span className={`text-2xl font-bold font-mono tracking-tight ${color}`}>{value}</span>
          {sub && <span className="text-[10px] text-gray-500 font-medium uppercase">{sub}</span>}
        </div>
      )}
    </div>
  );
}

interface Props {
  account: {
    equity: number;
    daily_pnl: number;
    unrealized_pnl: number;
    open_positions: number;
  } | null;
  activeStrategies: number;
  loading?: boolean;
}

export function MetricsBar({ account, activeStrategies, loading }: Props) {
  const eq       = account?.equity ?? 0;
  const dailyPnl = account?.daily_pnl ?? 0;
  const upnl     = account?.unrealized_pnl ?? 0;
  const openPos  = account?.open_positions ?? 0;

  return (
    <div className="flex gap-4">
      <MetricCard label="Equity"    value={`$${eq.toLocaleString('en', { minimumFractionDigits: 2 })}`} loading={loading} />
      <MetricCard label="Daily P&L" value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`} positive={dailyPnl > 0 ? true : dailyPnl < 0 ? false : null} loading={loading} />
      <MetricCard label="Unrealized" value={`${upnl >= 0 ? '+' : ''}$${upnl.toFixed(2)}`} positive={upnl > 0 ? true : upnl < 0 ? false : null} loading={loading} />
      <MetricCard label="Positions" value={String(openPos)} sub="open" loading={loading} />
      <MetricCard label="Strategies" value={String(activeStrategies)} sub="active" loading={loading} />
    </div>
  );
}
