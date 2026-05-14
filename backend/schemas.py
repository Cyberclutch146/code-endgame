"""
Pydantic schemas for all request/response models.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


# ─── Candle ──────────────────────────────────────────────────────────────────

class CandleSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:        int
    symbol:    str
    timeframe: str
    open_time: datetime
    open:      Decimal
    high:      Decimal
    low:       Decimal
    close:     Decimal
    volume:    int


# ─── Risk Config ─────────────────────────────────────────────────────────────

class RiskConfigSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                 uuid.UUID
    strategy_id:        uuid.UUID
    max_position_size:  Decimal = Decimal("10000")
    max_daily_loss:     Decimal = Decimal("500")
    risk_per_trade:     float   = 0.02
    stop_loss_pct:      float   = 0.02
    take_profit_pct:    float   = 0.04
    cooldown_seconds:   int     = 300


class RiskConfigUpdate(BaseModel):
    max_position_size:  Optional[Decimal] = None
    max_daily_loss:     Optional[Decimal] = None
    risk_per_trade:     Optional[float]   = None
    stop_loss_pct:      Optional[float]   = None
    take_profit_pct:    Optional[float]   = None
    cooldown_seconds:   Optional[int]     = None


# ─── Strategy ────────────────────────────────────────────────────────────────

class StrategyCreate(BaseModel):
    name:       str
    class_name: str
    parameters: dict[str, Any] = {}
    symbols:    list[str]
    timeframe:  str = "1m"


class StrategySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         uuid.UUID
    name:       str
    class_name: str
    parameters: dict[str, Any]
    symbols:    list[str]
    timeframe:  str
    status:     str
    created_at: datetime


# ─── Signal ──────────────────────────────────────────────────────────────────

class SignalSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    strategy_id:   Optional[uuid.UUID]
    symbol:        str
    direction:     Literal["LONG", "SHORT", "CLOSE"]
    entry_price:   Optional[Decimal]
    stop_loss:     Optional[Decimal]
    take_profit:   Optional[Decimal]
    confidence:    Optional[float]
    rejected:      bool
    reject_reason: Optional[str]
    generated_at:  datetime


# ─── Trade ───────────────────────────────────────────────────────────────────

class TradeSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:           uuid.UUID
    strategy_id:  Optional[uuid.UUID]
    symbol:       str
    side:         str
    quantity:     Decimal
    entry_price:  Decimal
    exit_price:   Optional[Decimal]
    slippage:     Decimal
    commission:   Decimal
    pnl:          Optional[Decimal]
    status:       str
    close_reason: Optional[str]
    opened_at:    datetime
    closed_at:    Optional[datetime]


# ─── Position ────────────────────────────────────────────────────────────────

class PositionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             uuid.UUID
    strategy_id:    uuid.UUID
    symbol:         str
    side:           str
    quantity:       Decimal
    avg_entry:      Decimal
    current_price:  Optional[Decimal]
    unrealized_pnl: Decimal
    realized_pnl:   Decimal
    stop_loss:      Optional[Decimal]
    take_profit:    Optional[Decimal]
    opened_at:      datetime
    updated_at:     datetime


# ─── Backtest ────────────────────────────────────────────────────────────────

class BacktestCreate(BaseModel):
    strategy_id: uuid.UUID
    symbol:      str
    timeframe:   str = "1m"
    start_date:  datetime
    end_date:    datetime
    parameters:  dict[str, Any] = {}


class BacktestSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:           uuid.UUID
    strategy_id:  Optional[uuid.UUID]
    symbol:       str
    timeframe:    str
    start_date:   datetime
    end_date:     datetime
    parameters:   dict[str, Any]
    metrics:      dict[str, Any]
    equity_curve: list
    status:       str
    created_at:   datetime
    completed_at: Optional[datetime]


# ─── Account ─────────────────────────────────────────────────────────────────

class AccountSchema(BaseModel):
    equity:         Decimal
    cash:           Decimal
    unrealized_pnl: Decimal
    daily_pnl:      Decimal
    total_pnl:      Decimal


# ─── WebSocket Messages ───────────────────────────────────────────────────────

class WSMessage(BaseModel):
    type:      str
    channel:   str
    data:      Any
    timestamp: datetime = Field(default_factory=datetime.utcnow)
