"""
Trade and position routes.
"""
from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db import get_db
from models import Trade, Position
from schemas import TradeSchema, PositionSchema, AccountSchema
from trading.paper import paper_trader
from risk.engine import account_state
from decimal import Decimal

router = APIRouter(tags=["trading"])


@router.get("/api/positions", response_model=list[dict])
async def get_positions():
    """Return all open positions from in-memory state."""
    return paper_trader.get_open_positions()


@router.get("/api/trades", response_model=list[TradeSchema])
async def get_trades(
    limit:  int = Query(default=50, le=500),
    status: str | None = Query(default=None),
    db:     AsyncSession = Depends(get_db),
):
    q = select(Trade).order_by(desc(Trade.opened_at)).limit(limit)
    if status:
        q = q.where(Trade.status == status.upper())
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/api/trades/{trade_id}", response_model=TradeSchema)
async def get_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Trade not found")
    return t


@router.post("/api/positions/{symbol}/close")
async def close_position(symbol: str, strategy_id: uuid.UUID = Query(...)):
    """Manual close of a position."""
    from strategy.base import Signal
    key = (str(strategy_id), symbol.upper())
    pos = paper_trader._positions.get(key)
    if not pos:
        from fastapi import HTTPException
        raise HTTPException(404, "No open position for this symbol/strategy")

    current_price = Decimal(str(pos["current_price"] or pos["avg_entry"]))
    fake_signal = Signal(
        strategy_id=str(strategy_id),
        symbol=symbol.upper(),
        direction="CLOSE",
        entry_price=current_price,
        metadata={"close_reason": "MANUAL"},
    )
    from models import RiskConfig
    dummy_rc = RiskConfig(cooldown_seconds=0)
    result = await paper_trader._close_position(key, fake_signal, dummy_rc)
    return result


@router.get("/api/account", response_model=dict)
async def get_account():
    """Return current account state."""
    positions = paper_trader.get_open_positions()
    total_unrealized = sum(p.get("unrealized_pnl", 0) for p in positions)
    return {
        "equity":         float(account_state.equity),
        "initial_capital": float(account_state.initial_capital),
        "realized_pnl":   float(account_state.realized_pnl),
        "unrealized_pnl": total_unrealized,
        "daily_pnl":      float(account_state.daily_pnl),
        "open_positions": len(positions),
    }
