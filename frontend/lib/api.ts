/**
 * REST API client with typed methods.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

export const api = {
  // Market
  getCandles:   (symbol: string, timeframe = '1m', limit = 300) =>
    apiFetch<any[]>(`/api/candles/${symbol}?timeframe=${timeframe}&limit=${limit}`),

  // Account
  getAccount:   () => apiFetch<any>('/api/account'),

  // Strategies
  getStrategies:         () => apiFetch<any[]>('/api/strategies'),
  getAvailableStrategies:() => apiFetch<any[]>('/api/strategies/available'),
  createStrategy:        (data: object) => apiFetch<any>('/api/strategies', { method: 'POST', body: JSON.stringify(data) }),
  startStrategy:         (id: string) => apiFetch<any>(`/api/strategies/${id}/start`, { method: 'POST' }),
  stopStrategy:          (id: string) => apiFetch<any>(`/api/strategies/${id}/stop`,  { method: 'POST' }),
  getRiskConfig:         (id: string) => apiFetch<any>(`/api/strategies/${id}/risk`),
  updateRiskConfig:      (id: string, data: object) => apiFetch<any>(`/api/strategies/${id}/risk`, { method: 'PUT', body: JSON.stringify(data) }),

  // Trading
  getPositions:  () => apiFetch<any[]>('/api/positions'),
  getTrades:     (limit = 50) => apiFetch<any[]>(`/api/trades?limit=${limit}`),
  closePosition: (symbol: string, strategyId: string) =>
    apiFetch<any>(`/api/positions/${symbol}/close?strategy_id=${strategyId}`, { method: 'POST' }),

  // Backtests
  getBacktests:    () => apiFetch<any[]>('/api/backtests'),
  createBacktest:  (data: object) => apiFetch<any>('/api/backtests', { method: 'POST', body: JSON.stringify(data) }),
  getBacktest:     (id: string) => apiFetch<any>(`/api/backtests/${id}`),
};
