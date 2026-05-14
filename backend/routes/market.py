"""
Market data REST endpoints.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from db import get_db
from models import Candle
from schemas import CandleSchema
from redis_client import get_redis
import json

router = APIRouter(prefix="/api/candles", tags=["market"])

AVAILABLE_SYMBOLS = ["AAPL", "TSLA", "NVDA", "SPY", "QQQ", "MSFT", "AMZN", "GOOGL"]


@router.get("/{symbol}", response_model=list[CandleSchema])
async def get_candles(
    symbol:    str,
    timeframe: str   = Query(default="1m"),
    limit:     int   = Query(default=200, le=2000),
    start:     datetime | None = Query(default=None),
    end:       datetime | None = Query(default=None),
    db:        AsyncSession = Depends(get_db),
):
    q = (
        select(Candle)
        .where(Candle.symbol == symbol.upper(), Candle.timeframe == timeframe)
        .order_by(desc(Candle.open_time))
        .limit(limit)
    )
    if start:
        q = q.where(Candle.open_time >= start)
    if end:
        q = q.where(Candle.open_time <= end)

    result = await db.execute(q)
    candles = result.scalars().all()

    if not candles:
        raise HTTPException(status_code=404, detail=f"No candles found for {symbol}")

    # Return in chronological order
    return list(reversed(candles))


@router.get("/{symbol}/latest")
async def get_latest_candle(symbol: str, timeframe: str = "1m"):
    """Get latest candle from Redis cache."""
    redis = await get_redis()
    key = f"candle:latest:{symbol.upper()}:{timeframe}"
    data = await redis.get(key)
    if not data:
        raise HTTPException(status_code=404, detail="No live data yet")
    return json.loads(data)


@router.get("")
async def get_symbols():
    return {"symbols": AVAILABLE_SYMBOLS}
