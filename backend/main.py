"""
QuantTerminal — FastAPI Application
Sprint 1: Infrastructure + Market Data
"""
import asyncio
import json
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from db import engine, Base, SessionLocal
from redis_client import get_redis, close_redis
from ws.manager import ws_manager
from market.ingestion import run_market_ingestion
from routes.health import router as health_router
from routes.market import router as market_router
from routes.strategies import router as strategy_router
from routes.trades import router as trade_router
from routes.backtests import router as backtest_router

# ─── Logging ─────────────────────────────────────────────────────────────────

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if get_settings().is_dev else structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger(__name__)

# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    log.info("startup_begin", env=settings.app_env)

    # 1. Verify DB connection
    db_ok = False
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        log.info("db_connected")
        db_ok = True
    except Exception as e:
        log.error("db_connection_failed", error=str(e))

    # 2. Verify Redis
    try:
        redis = await get_redis()
        await redis.ping()
        log.info("redis_connected")
    except Exception as e:
        log.error("redis_connection_failed", error=str(e))

    # 3. Wire strategy engine → risk engine → paper trader pipeline
    try:
        from strategy.engine import strategy_engine
        from risk.engine import risk_engine
        from trading.paper import paper_trader
        from models import RiskConfig
        from sqlalchemy import select

        async def signal_handler(signal, strategy_model):
            """Called by strategy engine on every new signal."""
            # Load risk config from DB
            async with SessionLocal() as session:
                result = await session.execute(
                    select(RiskConfig).where(RiskConfig.strategy_id == strategy_model.id)
                )
                rc = result.scalar_one_or_none()
            if not rc:
                log.warning("no_risk_config", strategy_id=str(strategy_model.id))
                return

            approved, reason = risk_engine.check(signal, rc)

            # Persist and broadcast signal regardless
            from models import Signal as SignalModel
            signal_data = {
                "strategy_id":  str(strategy_model.id),
                "symbol":       signal.symbol,
                "direction":    signal.direction,
                "entry_price":  str(signal.entry_price),
                "stop_loss":    str(signal.stop_loss) if signal.stop_loss else None,
                "take_profit":  str(signal.take_profit) if signal.take_profit else None,
                "confidence":   signal.confidence,
                "rejected":     not approved,
                "reject_reason": None if approved else reason,
            }
            await ws_manager.broadcast_all("signal", signal_data)

            if approved:
                await paper_trader.execute(signal, strategy_model, rc)
                # Update unrealized PnL
                await paper_trader.update_unrealized_pnl(
                    signal.symbol, float(signal.entry_price)
                )
            else:
                log.info("signal_rejected", reason=reason, symbol=signal.symbol)

        # Register signal handler with strategy engine
        strategy_engine.register_signal_callback(signal_handler)

        # Register loss callback with paper trader
        paper_trader.register_loss_callback(risk_engine.on_loss)

        # Register candle callback so strategy engine receives candles
        from market.ingestion import register_candle_callback
        register_candle_callback(strategy_engine.on_candle)

        # Also update unrealized PnL on each candle
        async def pnl_update_on_candle(candle: dict):
            price = float(candle["close"])
            await paper_trader.update_unrealized_pnl(candle["symbol"], price)
        register_candle_callback(pnl_update_on_candle)

        # Re-activate any strategies that were ACTIVE before restart
        if db_ok:
            async with SessionLocal() as session:
                from models import Strategy
                result = await session.execute(
                    select(Strategy).where(Strategy.status == "ACTIVE")
                )
                active = result.scalars().all()
                for s in active:
                    strategy_engine.activate(s)
                    log.info("strategy_resumed", name=s.name)

    except Exception as e:
        log.error("engine_init_failed", error=str(e))

    # 4. Start market ingestion as background task
    ingestion_task = asyncio.create_task(run_market_ingestion())
    log.info("market_ingestion_started")

    log.info("startup_complete")
    yield  # ← Application runs here

    # ─── Shutdown ────────────────────────────────────────────────────────────
    log.info("shutdown_begin")
    ingestion_task.cancel()
    try:
        await ingestion_task
    except asyncio.CancelledError:
        pass
    await close_redis()
    await engine.dispose()
    log.info("shutdown_complete")


# ─── App factory ─────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="QuantTerminal API",
        description="Real-time AI-assisted trading platform",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_dev else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ─── Routers ─────────────────────────────────────────────────────────────
    app.include_router(health_router)
    app.include_router(market_router)
    app.include_router(strategy_router)
    app.include_router(trade_router)
    app.include_router(backtest_router)

    # ─── WebSocket ───────────────────────────────────────────────────────────
    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket):
        session_id = await ws_manager.connect(ws)

        # Auto-subscribe to all channels for hackathon simplicity
        await ws_manager.subscribe(session_id, [
            "candle", "signal", "trade", "position", "backtest", "system"
        ])

        # Send welcome
        await ws_manager.send_to(session_id, {
            "type":       "connected",
            "session_id": session_id,
            "message":    "Connected to QuantTerminal",
        })

        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                    msg_type = msg.get("type")

                    if msg_type == "ping":
                        await ws_manager.send_to(session_id, {"type": "pong"})
                    elif msg_type == "subscribe":
                        channels = msg.get("channels", [])
                        await ws_manager.subscribe(session_id, channels)
                    elif msg_type == "unsubscribe":
                        channels = msg.get("channels", [])
                        await ws_manager.unsubscribe(session_id, channels)
                    else:
                        log.debug("ws_unknown_message", type=msg_type)

                except json.JSONDecodeError:
                    await ws_manager.send_to(session_id, {"type": "error", "message": "Invalid JSON"})

        except WebSocketDisconnect:
            pass
        finally:
            await ws_manager.disconnect(session_id)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
