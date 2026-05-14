/**
 * Shared TypeScript types for QuantTerminal frontend.
 */

export interface Candle {
  id?: number;
  symbol: string;
  timeframe: string;
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  id?: number;
  strategy_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'CLOSE';
  entry_price: string | number;
  stop_loss?: string | number | null;
  take_profit?: string | number | null;
  confidence?: number | null;
  rejected: boolean;
  reject_reason?: string | null;
  generated_at?: string;
}

export interface Trade {
  id: string;
  strategy_id?: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  exit_price?: number | null;
  slippage: number;
  commission: number;
  pnl?: number | null;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  close_reason?: string | null;
  opened_at: string;
  closed_at?: string | null;
}

export interface Position {
  id: string;
  strategy_id: string;
  symbol: string;
  side: string;
  quantity: number;
  avg_entry: number;
  current_price?: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  opened_at: string;
}

export interface Strategy {
  id: string;
  name: string;
  class_name: string;
  parameters: Record<string, unknown>;
  symbols: string[];
  timeframe: string;
  status: 'INACTIVE' | 'ACTIVE' | 'ERROR' | 'STOPPED';
  created_at: string;
}

export interface BacktestMetrics {
  total_return: number;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  avg_win: number;
  avg_loss: number;
  expectancy: number;
  final_equity: number;
  initial_capital: number;
}

export interface Backtest {
  id: string;
  strategy_id?: string;
  symbol: string;
  timeframe: string;
  start_date: string;
  end_date: string;
  parameters: Record<string, unknown>;
  metrics: BacktestMetrics;
  equity_curve: { timestamp: string; equity: number }[];
  status: 'RUNNING' | 'COMPLETE' | 'FAILED';
  created_at: string;
  completed_at?: string | null;
}

export interface Account {
  equity: number;
  initial_capital: number;
  realized_pnl: number;
  unrealized_pnl: number;
  daily_pnl: number;
  open_positions: number;
}

export interface WSMessage {
  type: string;
  channel: string;
  data: unknown;
  timestamp: string;
}
