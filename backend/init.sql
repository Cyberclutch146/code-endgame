-- QuantTerminal Database Schema
-- Run automatically on first postgres startup via docker-entrypoint-initdb.d

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Market Data ───────────────────────────────────────────────────────────────

CREATE TABLE candles (
    id          BIGSERIAL PRIMARY KEY,
    symbol      VARCHAR(20)     NOT NULL,
    timeframe   VARCHAR(10)     NOT NULL,
    open_time   TIMESTAMPTZ     NOT NULL,
    open        NUMERIC(20,8)   NOT NULL,
    high        NUMERIC(20,8)   NOT NULL,
    low         NUMERIC(20,8)   NOT NULL,
    close       NUMERIC(20,8)   NOT NULL,
    volume      BIGINT          NOT NULL,
    created_at  TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE(symbol, timeframe, open_time)
);
CREATE INDEX idx_candles_lookup   ON candles(symbol, timeframe, open_time DESC);
CREATE INDEX idx_candles_time     ON candles(open_time DESC);

-- ─── Strategies ────────────────────────────────────────────────────────────────

CREATE TABLE strategies (
    id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100)    NOT NULL,
    class_name  VARCHAR(100)    NOT NULL,
    parameters  JSONB           DEFAULT '{}',
    symbols     TEXT[]          NOT NULL,
    timeframe   VARCHAR(10)     DEFAULT '1m',
    status      VARCHAR(20)     DEFAULT 'INACTIVE',  -- INACTIVE | ACTIVE | ERROR | STOPPED
    created_at  TIMESTAMPTZ     DEFAULT NOW(),
    updated_at  TIMESTAMPTZ     DEFAULT NOW()
);

-- ─── Risk Configuration ─────────────────────────────────────────────────────────

CREATE TABLE risk_configs (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id         UUID            REFERENCES strategies(id) ON DELETE CASCADE UNIQUE,
    max_position_size   NUMERIC(20,8)   DEFAULT 10000,
    max_daily_loss      NUMERIC(20,8)   DEFAULT 500,
    risk_per_trade      FLOAT           DEFAULT 0.02,   -- fraction of account
    stop_loss_pct       FLOAT           DEFAULT 0.02,   -- 2%
    take_profit_pct     FLOAT           DEFAULT 0.04,   -- 4%  (2:1 R:R)
    cooldown_seconds    INT             DEFAULT 300,
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

-- ─── Signals ────────────────────────────────────────────────────────────────────

CREATE TABLE signals (
    id              BIGSERIAL       PRIMARY KEY,
    strategy_id     UUID            REFERENCES strategies(id) ON DELETE SET NULL,
    symbol          VARCHAR(20)     NOT NULL,
    direction       VARCHAR(10)     NOT NULL,           -- LONG | SHORT | CLOSE
    entry_price     NUMERIC(20,8),
    stop_loss       NUMERIC(20,8),
    take_profit     NUMERIC(20,8),
    confidence      FLOAT,
    rejected        BOOLEAN         DEFAULT FALSE,
    reject_reason   VARCHAR(100),
    metadata        JSONB           DEFAULT '{}',
    generated_at    TIMESTAMPTZ     DEFAULT NOW()
);
CREATE INDEX idx_signals_strategy  ON signals(strategy_id, generated_at DESC);
CREATE INDEX idx_signals_symbol    ON signals(symbol, generated_at DESC);

-- ─── Trades ─────────────────────────────────────────────────────────────────────

CREATE TABLE trades (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id     UUID            REFERENCES strategies(id) ON DELETE SET NULL,
    signal_id       BIGINT          REFERENCES signals(id) ON DELETE SET NULL,
    symbol          VARCHAR(20)     NOT NULL,
    side            VARCHAR(10)     NOT NULL,           -- LONG | SHORT
    quantity        NUMERIC(20,8)   NOT NULL,
    entry_price     NUMERIC(20,8)   NOT NULL,
    exit_price      NUMERIC(20,8),
    slippage        NUMERIC(20,8)   DEFAULT 0,
    commission      NUMERIC(20,8)   DEFAULT 0,
    pnl             NUMERIC(20,8),
    status          VARCHAR(20)     DEFAULT 'OPEN',    -- OPEN | CLOSED | CANCELLED
    close_reason    VARCHAR(50),                        -- SIGNAL | STOP_LOSS | TAKE_PROFIT | MANUAL
    opened_at       TIMESTAMPTZ     DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);
CREATE INDEX idx_trades_strategy   ON trades(strategy_id, opened_at DESC);
CREATE INDEX idx_trades_open       ON trades(status) WHERE status = 'OPEN';
CREATE INDEX idx_trades_symbol     ON trades(symbol, opened_at DESC);

-- ─── Positions ───────────────────────────────────────────────────────────────────

CREATE TABLE positions (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id     UUID            REFERENCES strategies(id) ON DELETE CASCADE,
    symbol          VARCHAR(20)     NOT NULL,
    side            VARCHAR(10)     NOT NULL,
    quantity        NUMERIC(20,8)   NOT NULL,
    avg_entry       NUMERIC(20,8)   NOT NULL,
    current_price   NUMERIC(20,8),
    unrealized_pnl  NUMERIC(20,8)   DEFAULT 0,
    realized_pnl    NUMERIC(20,8)   DEFAULT 0,
    stop_loss       NUMERIC(20,8),
    take_profit     NUMERIC(20,8),
    opened_at       TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE(strategy_id, symbol)
);
CREATE INDEX idx_positions_strategy ON positions(strategy_id);

-- ─── Backtests ───────────────────────────────────────────────────────────────────

CREATE TABLE backtests (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id     UUID            REFERENCES strategies(id) ON DELETE SET NULL,
    symbol          VARCHAR(20)     NOT NULL,
    timeframe       VARCHAR(10)     NOT NULL,
    start_date      TIMESTAMPTZ     NOT NULL,
    end_date        TIMESTAMPTZ     NOT NULL,
    parameters      JSONB           DEFAULT '{}',
    metrics         JSONB           DEFAULT '{}',
    equity_curve    JSONB           DEFAULT '[]',
    trade_log       JSONB           DEFAULT '[]',
    status          VARCHAR(20)     DEFAULT 'RUNNING',  -- RUNNING | COMPLETE | FAILED
    error_message   TEXT,
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_backtests_strategy ON backtests(strategy_id, created_at DESC);

-- ─── Account Snapshots (for equity tracking) ─────────────────────────────────────

CREATE TABLE account_snapshots (
    id              BIGSERIAL       PRIMARY KEY,
    equity          NUMERIC(20,8)   NOT NULL,
    cash            NUMERIC(20,8)   NOT NULL,
    unrealized_pnl  NUMERIC(20,8)   DEFAULT 0,
    realized_pnl    NUMERIC(20,8)   DEFAULT 0,
    daily_pnl       NUMERIC(20,8)   DEFAULT 0,
    snapshot_at     TIMESTAMPTZ     DEFAULT NOW()
);
CREATE INDEX idx_snapshots_time ON account_snapshots(snapshot_at DESC);
