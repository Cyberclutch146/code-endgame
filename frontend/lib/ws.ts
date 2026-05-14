/**
 * WebSocket client with auto-reconnect and message routing.
 * Singleton pattern — one connection for the entire app.
 */
import { useMarketStore } from '@/stores/market';
import { useSignalStore } from '@/stores/signals';
import { usePositionStore } from '@/stores/positions';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';

class TradingWebSocket {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 15000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;
  public status: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private statusListeners: ((s: string) => void)[] = [];

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.shouldReconnect = true;
    this._connect();
  }

  private _connect() {
    this.status = 'connecting';
    this._notifyStatus();

    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.status = 'connected';
      this._notifyStatus();
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._route(msg);
      } catch { /* ignore parse errors */ }
    };

    this.ws.onclose = () => {
      this._stopPing();
      this.status = 'disconnected';
      this._notifyStatus();
      if (this.shouldReconnect) this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private _route(msg: any) {
    const type: string = msg.type || '';
    const data = msg.data;

    if (type === 'candle') {
      useMarketStore.getState().addCandle(data);
    } else if (type === 'signal') {
      useSignalStore.getState().addSignal(data);
    } else if (type === 'trade' || type === 'position' || type === 'positions_update') {
      if (type === 'positions_update') {
        usePositionStore.getState().setPositions(data);
      } else if (data?.status === 'CLOSED' || type === 'position_closed') {
        usePositionStore.getState().removePosition(data?.symbol, data?.strategy_id);
      } else {
        usePositionStore.getState().updatePosition(data);
      }
    } else if (type === 'backtest') {
      // Handled by individual components via polling or their own listener
    }
  }

  private _scheduleReconnect() {
    setTimeout(() => {
      if (this.shouldReconnect) this._connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }

  private _startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  private _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopPing();
    this.ws?.close();
  }

  onStatusChange(cb: (s: string) => void) {
    this.statusListeners.push(cb);
    return () => { this.statusListeners = this.statusListeners.filter(l => l !== cb); };
  }

  private _notifyStatus() {
    this.statusListeners.forEach(l => l(this.status));
  }
}

export const tradingWS = new TradingWebSocket();
