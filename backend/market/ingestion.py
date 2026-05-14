"""
Market data ingestion from Alpaca Markets.
Connects via WebSocket, normalizes bars, persists candles, broadcasts.
"""
from __future__ import annotations
import asyncio
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Callable, Awaitable

import structlog
from alpaca.data.live import StockDataStream
from alpaca.data.enums import DataFeed
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import select

from config import get_settings
from db import SessionLocal
from models import Candle
from redis_client import get_redis
from ws.manager import ws_manager

log = structlog.get_logger(__name__)
settings = get_settings()

# Symbols to subscribe to. Can be updated at runtime.
_subscribed_symbols: set[str] = {"AAPL", "TSLA", "NVDA", "SPY"}

# Callbacks registered by strategy engine
_candle_callbacks: list[Callable[[dict], Awaitable[None]]] = []


def register_candle_callback(cb: Callable[[dict], Awaitable[None]]):
    """Strategy engine registers here to receive candles."""
    _candle_callbacks.append(cb)


def add_symbols(symbols: list[str]):
    _subscribed_symbols.update(symbols)


# ─── Candle normalizer ───────────────────────────────────────────────────────

def normalize_bar(bar) -> dict:
    """Convert Alpaca bar to our internal candle dict."""
    return {
        "symbol":    bar.symbol,
        "timeframe": "1m",
        "open_time": bar.timestamp.replace(tzinfo=timezone.utc) if bar.timestamp.tzinfo is None else bar.timestamp,
        "open":      Decimal(str(bar.open)),
        "high":      Decimal(str(bar.high)),
        "low":       Decimal(str(bar.low)),
        "close":     Decimal(str(bar.close)),
        "volume":    int(bar.volume),
    }


# ─── Persist candle ──────────────────────────────────────────────────────────

async def _persist_candle(candle: dict):
    """Upsert candle into PostgreSQL. ON CONFLICT DO NOTHING."""
    async with SessionLocal() as session:
        stmt = pg_insert(Candle).values(**candle).on_conflict_do_nothing(
            index_elements=["symbol", "timeframe", "open_time"]
        )
        await session.execute(stmt)
        await session.commit()


async def _cache_candle(candle: dict):
    """Cache latest candle per symbol in Redis (TTL 5 min)."""
    redis = await get_redis()
    key = f"candle:latest:{candle['symbol']}:1m"
    value = json.dumps({k: str(v) for k, v in candle.items()})
    await redis.set(key, value, ex=300)


# ─── Bar handler ─────────────────────────────────────────────────────────────

async def _on_bar(bar):
    try:
        candle = normalize_bar(bar)
        log.debug("bar_received", symbol=candle["symbol"], close=candle["close"])

        # 1. Persist + cache (fire and forget style)
        asyncio.create_task(_persist_candle(candle))
        asyncio.create_task(_cache_candle(candle))

        # 2. Broadcast candle to WS clients
        candle_payload = {k: str(v) if isinstance(v, Decimal) else v for k, v in candle.items()}
        if isinstance(candle_payload.get("open_time"), datetime):
            candle_payload["open_time"] = candle_payload["open_time"].isoformat()
        asyncio.create_task(ws_manager.broadcast_all("candle", candle_payload))

        # 3. Notify strategy engine
        for cb in _candle_callbacks:
            asyncio.create_task(cb(candle))

    except Exception as e:
        log.error("bar_processing_error", error=str(e))


# ─── Ingestion runner ─────────────────────────────────────────────────────────

async def run_market_ingestion():
    """
    Main ingestion loop. Runs as a background asyncio Task.
    Auto-reconnects on failure with exponential backoff.
    """
    backoff = 1
    while True:
        try:
            log.info("market_ingestion_starting", symbols=list(_subscribed_symbols))
            stream = StockDataStream(
                api_key=settings.alpaca_api_key,
                secret_key=settings.alpaca_secret_key,
                feed=DataFeed.IEX,
            )
            stream.subscribe_bars(_on_bar, *list(_subscribed_symbols))
            backoff = 1  # reset on successful connect
            await stream._run_forever()  # blocks until disconnect

        except Exception as e:
            log.warning("market_ingestion_error", error=str(e), retry_in=backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)


# ─── Historical data loader (for backtest seeding) ────────────────────────────

async def fetch_historical_candles(
    symbol: str,
    timeframe: str,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Query historical candles from DB."""
    async with SessionLocal() as session:
        result = await session.execute(
            select(Candle)
            .where(
                Candle.symbol == symbol,
                Candle.timeframe == timeframe,
                Candle.open_time >= start,
                Candle.open_time <= end,
            )
            .order_by(Candle.open_time)
        )
        rows = result.scalars().all()
        return [
            {
                "symbol":    r.symbol,
                "timeframe": r.timeframe,
                "open_time": r.open_time,
                "open":      r.open,
                "high":      r.high,
                "low":       r.low,
                "close":     r.close,
                "volume":    r.volume,
            }
            for r in rows
        ]
