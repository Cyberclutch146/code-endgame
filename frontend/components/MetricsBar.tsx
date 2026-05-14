'use client';

interface MetricCardProps {
  label:     string;
  value:     string;
  sub?:      string;
  positive?: boolean | null;
}

function MetricCard({ label, value, sub, positive }: MetricCardProps) {
  const color = positive === true ? 'text-green-400' : positive === false ? 'text-red-400' : 'text-white';
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 border-r border-white/5 last:border-0">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`text-lg font-bold font-mono leading-tight ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-600">{sub}</span>}
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
  wsStatus: string;
  activeStrategies: number;
}

export function MetricsBar({ account, wsStatus, activeStrategies }: Props) {
  const eq       = account?.equity ?? 0;
  const dailyPnl = account?.daily_pnl ?? 0;
  const upnl     = account?.unrealized_pnl ?? 0;
  const openPos  = account?.open_positions ?? 0;

  const wsColor = wsStatus === 'connected' ? 'text-green-400' : wsStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="flex items-center h-14 border-b border-white/5 bg-[#0d0e12]">
      {/* Logo */}
      <div className="px-5 py-3 border-r border-white/5 flex items-center gap-2 shrink-0">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="font-bold text-sm tracking-tight text-white">QuantTerminal</span>
      </div>

      {/* Metrics */}
      <div className="flex flex-1 overflow-x-auto">
        <MetricCard label="Equity"    value={`$${eq.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
        <MetricCard label="Daily P&L" value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`} positive={dailyPnl > 0 ? true : dailyPnl < 0 ? false : null} />
        <MetricCard label="Unrealized" value={`${upnl >= 0 ? '+' : ''}$${upnl.toFixed(2)}`} positive={upnl > 0 ? true : upnl < 0 ? false : null} />
        <MetricCard label="Positions" value={String(openPos)} sub="open" />
        <MetricCard label="Strategies" value={String(activeStrategies)} sub="active" />
      </div>

      {/* WS Status */}
      <div className="px-5 flex items-center gap-2 shrink-0">
        <div className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-green-400' : wsStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-500'}`} />
        <span className={`text-xs ${wsColor}`}>{wsStatus}</span>
      </div>
    </div>
  );
}
