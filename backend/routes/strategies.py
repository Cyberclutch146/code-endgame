"""
Strategy management routes — CRUD, start/stop.
"""
from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from db import get_db
from models import Strategy, RiskConfig
from schemas import StrategyCreate, StrategySchema, RiskConfigSchema, RiskConfigUpdate
from strategy.engine import strategy_engine, AVAILABLE_STRATEGIES, list_available_strategies

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


@router.get("/available")
async def get_available_strategies():
    return list_available_strategies()


@router.get("", response_model=list[StrategySchema])
async def list_strategies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).order_by(Strategy.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=StrategySchema)
async def create_strategy(payload: StrategyCreate, db: AsyncSession = Depends(get_db)):
    if payload.class_name not in AVAILABLE_STRATEGIES:
        raise HTTPException(400, f"Unknown strategy class: {payload.class_name}")

    strategy = Strategy(
        name=payload.name,
        class_name=payload.class_name,
        parameters=payload.parameters,
        symbols=payload.symbols,
        timeframe=payload.timeframe,
    )
    db.add(strategy)
    await db.flush()

    # Create default risk config
    rc = RiskConfig(strategy_id=strategy.id)
    db.add(rc)
    await db.commit()
    await db.refresh(strategy)
    return strategy


@router.get("/{strategy_id}", response_model=StrategySchema)
async def get_strategy(strategy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Strategy not found")
    return s


@router.post("/{strategy_id}/start")
async def start_strategy(strategy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Strategy).where(Strategy.id == strategy_id)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Strategy not found")
    if s.status == "ACTIVE":
        return {"message": "Already active"}

    ok = strategy_engine.activate(s)
    if not ok:
        raise HTTPException(400, "Failed to activate strategy")

    await db.execute(
        update(Strategy).where(Strategy.id == strategy_id).values(status="ACTIVE")
    )
    await db.commit()

    # Register candle callback from ingestion if not yet done
    from market.ingestion import register_candle_callback
    from market.ingestion import _candle_callbacks
    if strategy_engine.on_candle not in _candle_callbacks:
        register_candle_callback(strategy_engine.on_candle)

    return {"message": f"Strategy '{s.name}' activated"}


@router.post("/{strategy_id}/stop")
async def stop_strategy(strategy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    strategy_engine.deactivate(str(strategy_id))
    await db.execute(
        update(Strategy).where(Strategy.id == strategy_id).values(status="INACTIVE")
    )
    await db.commit()
    return {"message": "Strategy stopped"}


@router.get("/{strategy_id}/risk", response_model=RiskConfigSchema)
async def get_risk_config(strategy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RiskConfig).where(RiskConfig.strategy_id == strategy_id))
    rc = result.scalar_one_or_none()
    if not rc:
        raise HTTPException(404, "Risk config not found")
    return rc


@router.put("/{strategy_id}/risk", response_model=RiskConfigSchema)
async def update_risk_config(
    strategy_id: uuid.UUID,
    payload: RiskConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RiskConfig).where(RiskConfig.strategy_id == strategy_id))
    rc = result.scalar_one_or_none()
    if not rc:
        raise HTTPException(404, "Risk config not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(rc, field, value)

    await db.commit()
    await db.refresh(rc)
    return rc
