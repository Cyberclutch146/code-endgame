# Real-Time AI-Assisted Day Trading Platform — Implementation Plan (Part 3)

> Frontend, Deployment, Observability, Security, Future Expansion

---

## 9. FRONTEND PLAN

### 9.1 Dashboard Architecture

```
frontend/
├── app/
│   ├── layout.tsx               # Root layout, providers
│   ├── page.tsx                 # Dashboard home (redirect)
│   ├── dashboard/
│   │   ├── page.tsx             # Main trading view
│   │   └── layout.tsx           # Dashboard shell (sidebar, header)
│   ├── strategies/
│   │   ├── page.tsx             # Strategy list
│   │   └── [id]/page.tsx        # Strategy detail + config
│   ├── backtests/
│   │   ├── page.tsx             # Backtest list
│   │   └── [id]/page.tsx        # Backtest results + charts
│   ├── trades/
│   │   └── page.tsx             # Trade history + journal
│   └── settings/
│       └── page.tsx             # Risk config, account, API keys
├── components/
│   ├── charts/
│   │   ├── PriceChart.tsx       # TradingView Lightweight Charts
│   │   ├── EquityCurve.tsx
│   │   └── DrawdownChart.tsx
│   ├── panels/
│   │   ├── SignalPanel.tsx      # Live signals feed
│   │   ├── PositionPanel.tsx    # Open positions
│   │   ├── OrderPanel.tsx       # Order history
│   │   └── MetricsPanel.tsx     # Key performance metrics
│   └── common/
│       ├── StatusBadge.tsx
│       ├── DataTable.tsx
│       └── LoadingSpinner.tsx
├── lib/
│   ├── ws-client.ts             # WebSocket client with reconnection
│   ├── api-client.ts            # REST API client (fetch wrapper)
│   └── utils.ts
├── stores/
│   ├── market-store.ts          # Candle data, current prices
│   ├── signal-store.ts          # Live signals
│   ├── position-store.ts        # Open positions, PnL
│   ├── strategy-store.ts        # Strategy list, status
│   └── ws-store.ts              # Connection state
└── types/
    └── index.ts                 # Shared TypeScript types
```

### 9.2 WebSocket Client Architecture

```typescript
// lib/ws-client.ts — Design sketch

class TradingWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private heartbeatInterval: NodeJS.Timer | null = null;
  private subscriptions: Set<string> = new Set();

  connect(token: string): void {
    // 1. Open connection with token
    // 2. On open: send pending subscriptions, start heartbeat
    // 3. On message: route to appropriate Zustand store
    // 4. On close: attempt reconnection with backoff
    // 5. On error: log, trigger reconnection
  }

  subscribe(channels: string[]): void {
    // Add to local set, send to server if connected
    // On reconnect, resubscribe automatically
  }

  // Message routing:
  // "candle.*"       -> marketStore.updateCandle()
  // "signal.*"       -> signalStore.addSignal()
  // "trade.*"        -> positionStore.updateTrade()
  // "position.*"     -> positionStore.updatePosition()
  // "system.*"       -> toast notification
  // "backtest.*"     -> backtestStore.updateProgress()
}
```

**Critical WS rules for React:**
- Initialize WS in a `useEffect` at the layout level (not per-component)
- Store WS instance in a ref, not state
- Clean up on unmount: close connection, clear intervals
- Use Zustand for data flow (WS -> store -> components), never prop-drill WS data

### 9.3 Real-Time State Synchronization

```
Data Flow: WS Message -> Router -> Zustand Store -> React Component

Zustand Store Design (example: position-store.ts):

  State:
    positions: Map<string, Position>   // keyed by strategy_id:symbol
    dailyPnl: number
    totalEquity: number
    lastUpdate: Date

  Actions:
    updatePosition(position)           // Upsert from WS
    removePosition(key)                // On close
    updatePnl(data)                    // Periodic PnL update

  Selectors:
    useOpenPositions()                 // All open positions
    usePositionBySymbol(symbol)        // Specific position
    useTotalUnrealizedPnl()            // Sum of unrealized

Performance:
  - Use Zustand's shallow equality to prevent unnecessary re-renders
  - Batch WS updates (requestAnimationFrame) for high-frequency data
  - Throttle chart updates to 1fps for non-focused charts
```

### 9.4 Chart Integration

```
TradingView Lightweight Charts:
  - Primary chart: Candlestick with volume overlay
  - Signal markers: arrows on chart at signal generation points
  - Position indicators: entry/exit lines with PnL labels
  - Real-time updates: append new candle on each WS message

Performance:
  - Max 2000 visible candles (scroll to load more)
  - Use Web Workers for indicator calculations (SMA, RSI overlay)
  - Lazy-load chart component (dynamic import)
  - Debounce resize handling
```

### 9.5 Page Structure

| Page | Purpose | Data Source |
|---|---|---|
| **Dashboard** | Live chart, signals, positions, metrics | WS real-time |
| **Strategies** | List, create, configure, start/stop | REST + WS status |
| **Backtests** | Run backtests, view results, compare | REST |
| **Trades** | Trade history, journal, AI analysis | REST |
| **Settings** | Risk config, account, system status | REST |

**Design principles:**
- Dark theme default (trader preference)
- Minimal chrome, maximum data density
- Monospace fonts for numerical data
- Red/green color coding for PnL (configurable for color blindness)
- Keyboard shortcuts for common actions

---

## 10. DEPLOYMENT PLAN

### 10.1 Docker Architecture

```yaml
# docker-compose.yml structure

services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [postgres, redis]
    env_file: .env
    volumes:
      - ./backend:/app        # Dev: hot reload
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
    env_file: .env

  postgres:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: trading
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

volumes:
  pgdata:
```

### 10.2 Environment Setup

```
.env structure:

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=trading_user
DB_PASSWORD=<secret>
DB_NAME=trading

# Redis
REDIS_URL=redis://redis:6379/0

# Market Data
ALPACA_API_KEY=<secret>
ALPACA_SECRET_KEY=<secret>
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# App
APP_ENV=development|production
LOG_LEVEL=DEBUG|INFO
CORS_ORIGINS=http://localhost:3000

# AI (Phase 8)
OPENAI_API_KEY=<secret>
AI_RATE_LIMIT=10/minute
```

### 10.3 Scaling Considerations

| Component | Scaling Strategy |
|---|---|
| **Backend** | Vertical first (single process handles ~1000 WS connections). Horizontal via Redis pub/sub for WS broadcast. |
| **PostgreSQL** | Connection pooling (pgbouncer if needed). Read replicas for backtest queries. Partition candle table. |
| **Redis** | Single instance sufficient for early stage. Cluster mode for >100K pub/sub messages/sec. |
| **Backtest workers** | Can be separated into worker processes. Use Celery or arq for job queue if needed. |
| **Frontend** | Static deployment (Vercel/CDN). No scaling concerns. |

### 10.4 Production Deployment

```
Phase 1 (Solo developer):
  - docker-compose on single VPS (4 vCPU, 8GB RAM)
  - Nginx reverse proxy with SSL (Let's Encrypt)
  - Automated backups: pg_dump daily to S3

Phase 2 (Growing):
  - Managed PostgreSQL (RDS/Cloud SQL)
  - Managed Redis (ElastiCache/Memorystore)
  - Backend on container service (ECS/Cloud Run)
  - Frontend on Vercel

Phase 3 (Scale):
  - Kubernetes for backend services
  - Separate backtest worker pool
  - TimescaleDB for candle data
  - Dedicated monitoring stack
```

---

## 11. OBSERVABILITY

### 11.1 Logging Architecture

```
Structured Logging (structlog):

  Levels:
    DEBUG  - Candle received, strategy evaluated, WS messages
    INFO   - Signal generated, trade executed, backtest started
    WARNING - Risk rule triggered, WS reconnection, slow query
    ERROR  - Strategy crash, DB connection failure, data corruption
    CRITICAL - System shutdown, unrecoverable state

  Log Format (JSON):
    {
      "timestamp": "2024-01-15T09:30:00.123Z",
      "level": "INFO",
      "service": "strategy_engine",
      "correlation_id": "abc-123",
      "event": "signal_generated",
      "strategy": "sma_crossover",
      "symbol": "AAPL",
      "direction": "LONG",
      "latency_ms": 12.5
    }

  Destinations:
    Dev: stdout (pretty-printed)
    Prod: stdout (JSON) -> collected by Docker -> log aggregator
```

### 11.2 Metrics & Monitoring

| Metric | Type | Alert Threshold |
|---|---|---|
| Signal generation latency | Histogram | p99 > 100ms |
| Risk check latency | Histogram | p99 > 10ms |
| WS connections active | Gauge | — |
| WS message throughput | Counter | — |
| Market data lag | Gauge | > 5s behind real-time |
| Strategy error rate | Counter | > 5/minute |
| DB query latency | Histogram | p99 > 500ms |
| Event bus queue depth | Gauge | > 1000 backlog |
| Redis memory usage | Gauge | > 80% max |
| Active positions count | Gauge | — |
| Daily PnL | Gauge | Breach of daily limit |

### 11.3 Latency Tracking

```
Critical Path Instrumentation:

  candle_received -> candle_normalized      [target: < 1ms]
  candle_normalized -> event_published      [target: < 1ms]
  event_published -> strategy_evaluated     [target: < 50ms]
  strategy_evaluated -> risk_checked        [target: < 5ms]
  risk_checked -> fill_simulated            [target: < 5ms]
  fill_simulated -> ws_broadcast            [target: < 10ms]

  Total end-to-end: candle_received -> ws_broadcast
  Target: < 100ms at p99
```

### 11.4 WebSocket Health Monitoring

```
Tracked per connection:
  - Connection duration
  - Messages sent/received
  - Last heartbeat time
  - Subscription count
  - Error count
  - Reconnection count

Health endpoint: GET /health/ws
  Returns:
  {
    "active_connections": 3,
    "total_subscriptions": 12,
    "oldest_connection": "2h 15m",
    "avg_message_rate": "42/s",
    "stale_connections": 0
  }
```

---

## 12. SECURITY & SAFETY

### 12.1 API Security

| Layer | Implementation |
|---|---|
| **Authentication** | JWT tokens (access + refresh), httponly cookies for refresh |
| **Authorization** | Single-user initially; role-based if multi-user later |
| **CORS** | Strict origin whitelist |
| **Rate Limiting** | `slowapi` on FastAPI: 100 req/min general, 10 req/min for backtests |
| **Input Validation** | Pydantic models on all endpoints; reject unknown fields |
| **SQL Injection** | SQLAlchemy ORM (parameterized queries only) |
| **HTTPS** | Enforced via Nginx reverse proxy in production |

### 12.2 WebSocket Authentication

```
1. Client obtains JWT via REST login
2. Client connects to WS with token:
   ws://host/ws?token=<jwt>
3. Server validates JWT on connection
4. If invalid/expired: close with code 4001
5. Token refresh: client must reconnect with new token
   (no in-flight token refresh on WS)
6. Session tracked in Redis with TTL matching token expiry
```

### 12.3 Secrets Management

```
Development:
  - .env file (gitignored)
  - docker-compose env_file

Production:
  - Environment variables injected by deployment platform
  - No secrets in Docker images
  - Rotate API keys via env var update + container restart
  - Never log secrets (structlog processors filter sensitive fields)
```

### 12.4 Trading Safeguards

| Safeguard | Description |
|---|---|
| **No autonomous AI trading** | AI endpoints are read-only; no execution path from AI output to order submission |
| **Kill switch** | `POST /api/emergency/stop` — closes all positions, stops all strategies, blocks new signals |
| **Max order rate** | Max 10 orders per minute per strategy (prevent runaway loops) |
| **Duplicate signal detection** | Reject signals identical to one generated within last 60s |
| **Strategy error circuit breaker** | 5 consecutive errors → auto-disable strategy |
| **Data staleness check** | If market data is > 60s old, pause all strategies |

### 12.5 Failure Recovery

```
Scenario: Backend crashes mid-execution

  1. On restart (lifespan startup):
     a. Load all positions from PostgreSQL
     b. Reconcile with last known prices in Redis
     c. Recalculate unrealized PnL
     d. Resume strategies that were in ACTIVE state
     e. Log recovery event with any discrepancies

  2. Pending orders at crash time:
     - Orders are stateless (derived from signals)
     - If signal was not yet filled: re-evaluate on next candle
     - If signal was filled but not persisted: detected by
       position reconciliation, manual review required

  3. WS connections:
     - All clients auto-reconnect (frontend logic)
     - Subscriptions restored from client-side state
     - No server-side session persistence needed across restarts
```

---

## 13. FUTURE EXPANSION

### 13.1 Architecture Extensibility

The modular design supports these expansions without major refactoring:

#### AI-Assisted Analytics (Phase 8+)
```
Scope:
  - Post-trade analysis: "Why did this trade lose?"
  - Pattern recognition: "This setup is similar to trades on [dates]"
  - Strategy suggestions: "Based on your win rate, consider adjusting SMA period"
  - Trade journaling: Auto-generate journal entries from trade data

Architecture:
  - Separate ai_service.py module
  - Async LLM calls (non-blocking)
  - Response caching in Redis (same prompt = same response for 1hr)
  - Rate limiting: 10 LLM calls/minute
  - NEVER in the execution pipeline; always post-hoc analysis
```

#### Sentiment Analysis
```
  - Ingest news feeds (RSS, news APIs)
  - Store sentiment scores per symbol in Redis
  - Strategy base class gets optional sentiment_data parameter
  - Strategies can incorporate sentiment as a filter (not primary signal)
```

#### Anomaly Detection
```
  - Statistical anomaly detection on price/volume (Z-score, IQR)
  - Unusual options activity integration (if data available)
  - Alerts via event bus: "anomaly.detected"
  - Dashboard panel for anomaly feed
```

#### Multi-Broker Support
```
  - Abstract BrokerAdapter interface:
    class BrokerAdapter(ABC):
        async def connect()
        async def get_account()
        async def submit_order(order)
        async def get_positions()
        async def stream_data() -> AsyncGenerator

  - Implementations: AlpacaAdapter, IBKRAdapter, TDAAdapter
  - Factory pattern: broker = BrokerFactory.create(config.broker)
  - Paper trading is just another adapter (PaperAdapter)
```

#### Portfolio Optimization
```
  - Modern Portfolio Theory: efficient frontier calculation
  - Risk parity allocation across strategies
  - Correlation matrix between strategy returns
  - Automated rebalancing suggestions
  - Uses numpy/scipy for optimization; runs as async task
```

#### Multi-User Support
```
  - Add user_id to all models (strategies, trades, positions, etc.)
  - JWT includes user_id claim
  - WS subscriptions scoped to user
  - PostgreSQL row-level security (or application-level filtering)
  - Separate risk configs per user
  - Rate limiting per user
  - Admin dashboard for system monitoring
```

---

## APPENDIX: Engineering Tradeoffs

| Decision | Chosen | Alternative | Rationale |
|---|---|---|---|
| Event Bus | In-process asyncio | Kafka/RabbitMQ | Simpler for single-process; Redis pub/sub for scale |
| DB ORM | SQLAlchemy async | Raw SQL | Productivity; async support mature in 2.0 |
| WS Library | FastAPI native | Socket.IO | No extra dependency; sufficient for use case |
| Backtest parallelism | ProcessPoolExecutor | Celery | Simpler for local; Celery added when needed |
| State management (FE) | Zustand | Redux | Less boilerplate; excellent for WS-driven updates |
| Chart library | TV Lightweight | D3.js | Purpose-built for financial charts; performant |
| Time precision | UTC everywhere | Local time | Eliminates timezone bugs; convert only at display |
| Money type | Python Decimal | float | Precision critical for PnL; non-negotiable |

---

## TIMELINE SUMMARY

| Phase | Duration | Cumulative |
|---|---|---|
| 1. Infrastructure | 3-4 days | Week 1 |
| 2. Market Ingestion | 5-7 days | Week 2 |
| 3. Strategy Engine | 7-10 days | Week 3-4 |
| 4. Paper Trading | 7-10 days | Week 5-6 |
| 5. Backtesting | 7-10 days | Week 7-8 |
| 6. Frontend Dashboard | 7-10 days | Week 9-10 |
| 7. Risk + Optimization | 5-7 days | Week 11 |
| 8. AI Analytics | 5-7 days | Week 12 |
| **Total** | **~12 weeks** | **Single developer** |

> [!NOTE]
> Timeline assumes a single developer working full-time. Phases 3-5 have the highest risk due to complexity. Frontend (Phase 6) should start only after backend is stable to avoid rework.
