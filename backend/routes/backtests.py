"""
Backtest routes — create, list, get results.
"""
from __future__ import annotations
import asyncio
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db import get_db
from models import Backtest, Strategy
from schemas import BacktestCreate, BacktestSchema
from backtest.engine import run_backtest
from strategy.engine import AVAILABLE_STRATEGIES

router = APIRouter(prefix="/api/backtests", tags=["backtests"])


@router.post("", response_model=BacktestSchema)
async def create_backtest(payload: BacktestCreate, db: AsyncSession = Depends(get_db)):
    # Resolve strategy class name
    result = await db.execute(select(Strategy).where(Strategy.id == payload.strategy_id))
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(404, "Strategy not found")
    if strategy.class_name not in AVAILABLE_STRATEGIES:
        raise HTTPException(400, "Unknown strategy class")

    bt = Backtest(
        strategy_id=payload.strategy_id,
        symbol=payload.symbol.upper(),
        timeframe=payload.timeframe,
        start_date=payload.start_date,
        end_date=payload.end_date,
        parameters=payload.parameters or strategy.parameters,
        status="RUNNING",
    )
    db.add(bt)
    await db.commit()
    await db.refresh(bt)

    # Run backtest as background task
    config = {
        "class_name":     strategy.class_name,
        "parameters":     bt.parameters,
        "symbol":         bt.symbol,
        "timeframe":      bt.timeframe,
        "start_date":     bt.start_date,
        "end_date":       bt.end_date,
        "stop_loss_pct":  0.02,
        "take_profit_pct": 0.04,
    }
    asyncio.create_task(run_backtest(str(bt.id), config))

    return bt


@router.get("", response_model=list[BacktestSchema])
async def list_backtests(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Backtest).order_by(desc(Backtest.created_at)).limit(20)
    )
    return result.scalars().all()


@router.get("/{backtest_id}", response_model=BacktestSchema)
async def get_backtest(backtest_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Backtest).where(Backtest.id == backtest_id))
    bt = result.scalar_one_or_none()
    if not bt:
        raise HTTPException(404, "Backtest not found")
    return bt
