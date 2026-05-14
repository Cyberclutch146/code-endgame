"""
SQLAlchemy ORM models — all in one file for hackathon speed.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    BigInteger, Boolean, Float, ForeignKey, Index, Integer,
    Numeric, String, Text, TIMESTAMP, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db import Base


# ─── Candle ──────────────────────────────────────────────────────────────────

class Candle(Base):
    __tablename__ = "candles"

    id:         Mapped[int]      = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol:     Mapped[str]      = mapped_column(String(20), nullable=False)
    timeframe:  Mapped[str]      = mapped_column(String(10), nullable=False)
    open_time:  Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    open:       Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    high:       Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    low:        Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    close:      Mapped[Decimal]  = mapped_column(Numeric(20, 8), nullable=False)
    volume:     Mapped[int]      = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"))

    __table_args__ = (
        UniqueConstraint("symbol", "timeframe", "open_time"),
        Index("idx_candles_lookup", "symbol", "timeframe", "open_time"),
    )


# ─── Strategy ────────────────────────────────────────────────────────────────

class Strategy(Base):
    __tablename__ = "strategies"

    id:         Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name:       Mapped[str]           = mapped_column(String(100), nullable=False)
    class_name: Mapped[str]           = mapped_column(String(100), nullable=False)
    parameters: Mapped[dict]          = mapped_column(JSONB, default=dict)
    symbols:    Mapped[list[str]]     = mapped_column(ARRAY(String), nullable=False)
    timeframe:  Mapped[str]           = mapped_column(String(10), default="1m")
    status:     Mapped[str]           = mapped_column(String(20), default="INACTIVE")
    created_at: Mapped[datetime]      = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
    updated_at: Mapped[datetime]      = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"), onupdate=datetime.utcnow)

    risk_config: Mapped["RiskConfig"] = relationship("RiskConfig", back_populates="strategy", uselist=False, cascade="all, delete-orphan")
    signals:     Mapped[list["Signal"]]  = relationship("Signal", back_populates="strategy")
    trades:      Mapped[list["Trade"]]   = relationship("Trade", back_populates="strategy")
    positions:   Mapped[list["Position"]] = relationship("Position", back_populates="strategy", cascade="all, delete-orphan")


# ─── Risk Config ─────────────────────────────────────────────────────────────

class RiskConfig(Base):
    __tablename__ = "risk_configs"

    id:                 Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    strategy_id:        Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), unique=True)
    max_position_size:  Mapped[Decimal]   = mapped_column(Numeric(20, 8), default=Decimal("10000"))
    max_daily_loss:     Mapped[Decimal]   = mapped_column(Numeric(20, 8), default=Decimal("500"))
    risk_per_trade:     Mapped[float]     = mapped_column(Float, default=0.02)
    stop_loss_pct:      Mapped[float]     = mapped_column(Float, default=0.02)
    take_profit_pct:    Mapped[float]     = mapped_column(Float, default=0.04)
    cooldown_seconds:   Mapped[int]       = mapped_column(Integer, default=300)
    updated_at:         Mapped[datetime]  = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"), onupdate=datetime.utcnow)

    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="risk_config")


# ─── Signal ──────────────────────────────────────────────────────────────────

class Signal(Base):
    __tablename__ = "signals"

    id:            Mapped[int]            = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    strategy_id:   Mapped[uuid.UUID|None] = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="SET NULL"), nullable=True)
    symbol:        Mapped[str]            = mapped_column(String(20), nullable=False)
    direction:     Mapped[str]            = mapped_column(String(10), nullable=False)  # LONG | SHORT | CLOSE
    entry_price:   Mapped[Decimal|None]   = mapped_column(Numeric(20, 8))
    stop_loss:     Mapped[Decimal|None]   = mapped_column(Numeric(20, 8))
    take_profit:   Mapped[Decimal|None]   = mapped_column(Numeric(20, 8))
    confidence:    Mapped[float|None]     = mapped_column(Float)
    rejected:      Mapped[bool]           = mapped_column(Boolean, default=False)
    reject_reason: Mapped[str|None]       = mapped_column(String(100))
    meta:          Mapped[dict]           = mapped_column("metadata", JSONB, default=dict)
    generated_at:  Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"))

    strategy: Mapped["Strategy|None"] = relationship("Strategy", back_populates="signals")
    trade:    Mapped["Trade|None"]    = relationship("Trade", back_populates="signal", uselist=False)

    __table_args__ = (
        Index("idx_signals_strategy", "strategy_id", "generated_at"),
        Index("idx_signals_symbol", "symbol", "generated_at"),
    )


# ─── Trade ───────────────────────────────────────────────────────────────────

class Trade(Base):
    __tablename__ = "trades"

    id:           Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    strategy_id:  Mapped[uuid.UUID|None] = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="SET NULL"), nullable=True)
    signal_id:    Mapped[int|None]   = mapped_column(BigInteger, ForeignKey("signals.id", ondelete="SET NULL"), nullable=True)
    symbol:       Mapped[str]        = mapped_column(String(20), nullable=False)
    side:         Mapped[str]        = mapped_column(String(10), nullable=False)
    quantity:     Mapped[Decimal]    = mapped_column(Numeric(20, 8), nullable=False)
    entry_price:  Mapped[Decimal]    = mapped_column(Numeric(20, 8), nullable=False)
    exit_price:   Mapped[Decimal|None] = mapped_column(Numeric(20, 8))
    slippage:     Mapped[Decimal]    = mapped_column(Numeric(20, 8), default=Decimal("0"))
    commission:   Mapped[Decimal]    = mapped_column(Numeric(20, 8), default=Decimal("0"))
    pnl:          Mapped[Decimal|None] = mapped_column(Numeric(20, 8))
    status:       Mapped[str]        = mapped_column(String(20), default="OPEN")
    close_reason: Mapped[str|None]   = mapped_column(String(50))
    opened_at:    Mapped[datetime]   = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
    closed_at:    Mapped[datetime|None] = mapped_column(TIMESTAMP(timezone=True))

    strategy: Mapped["Strategy|None"] = relationship("Strategy", back_populates="trades")
    signal:   Mapped["Signal|None"]   = relationship("Signal", back_populates="trade")

    __table_args__ = (
        Index("idx_trades_strategy", "strategy_id", "opened_at"),
        Index("idx_trades_open", "status", postgresql_where=text("status = 'OPEN'")),
    )


# ─── Position ────────────────────────────────────────────────────────────────

class Position(Base):
    __tablename__ = "positions"

    id:             Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    strategy_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"))
    symbol:         Mapped[str]       = mapped_column(String(20), nullable=False)
    side:           Mapped[str]       = mapped_column(String(10), nullable=False)
    quantity:       Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    avg_entry:      Mapped[Decimal]   = mapped_column(Numeric(20, 8), nullable=False)
    current_price:  Mapped[Decimal|None] = mapped_column(Numeric(20, 8))
    unrealized_pnl: Mapped[Decimal]   = mapped_column(Numeric(20, 8), default=Decimal("0"))
    realized_pnl:   Mapped[Decimal]   = mapped_column(Numeric(20, 8), default=Decimal("0"))
    stop_loss:      Mapped[Decimal|None] = mapped_column(Numeric(20, 8))
    take_profit:    Mapped[Decimal|None] = mapped_column(Numeric(20, 8))
    opened_at:      Mapped[datetime]  = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
    updated_at:     Mapped[datetime]  = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"), onupdate=datetime.utcnow)

    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="positions")

    __table_args__ = (
        UniqueConstraint("strategy_id", "symbol"),
        Index("idx_positions_strategy", "strategy_id"),
    )


# ─── Backtest ────────────────────────────────────────────────────────────────

class Backtest(Base):
    __tablename__ = "backtests"

    id:           Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    strategy_id:  Mapped[uuid.UUID|None] = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="SET NULL"), nullable=True)
    symbol:       Mapped[str]        = mapped_column(String(20), nullable=False)
    timeframe:    Mapped[str]        = mapped_column(String(10), nullable=False)
    start_date:   Mapped[datetime]   = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    end_date:     Mapped[datetime]   = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    parameters:   Mapped[dict]       = mapped_column(JSONB, default=dict)
    metrics:      Mapped[dict]       = mapped_column(JSONB, default=dict)
    equity_curve: Mapped[list]       = mapped_column(JSONB, default=list)
    trade_log:    Mapped[list]       = mapped_column(JSONB, default=list)
    status:       Mapped[str]        = mapped_column(String(20), default="RUNNING")
    error_message: Mapped[str|None]  = mapped_column(Text)
    created_at:   Mapped[datetime]   = mapped_column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
    completed_at: Mapped[datetime|None] = mapped_column(TIMESTAMP(timezone=True))
