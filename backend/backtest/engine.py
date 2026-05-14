"""
Backtest Engine — Historical replay through strategy logic.
"""
from __future__ import annotations
import asyncio
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Type
import numpy as np
import pandas as pd
import structlog

from db import SessionLocal
from models import Backtest, Candle
from strategy.base import BaseStrategy, Signal
from strategy.engine import AVAILABLE_STRATEGIES
from ws.manager import ws_manager
from sqlalchemy import select, update as sql_update

log = structlog.get_logger(__name__)

INITIAL_CAPITAL = 100_000.0


class VirtualAccount:
    def __init__(self, capital: float = INITIAL_CAPITAL):
        self.initial = Decimal(str(capital))
        self.equity  = Decimal(str(capital))
        self.peak    = Decimal(str(capital))
        self.equity_curve: list[dict] = []
        self.trades: list[dict] = []

    def record_equity(self, ts: datetime):
        self.equity_curve.append({
            "timestamp": ts.isoformat(),
            "equity":    float(self.equity),
        })
        if self.equity > self.peak:
            self.peak = self.equity

    def apply_pnl(self, pnl: Decimal, ts: datetime, symbol: str, side: str):
        self.equity += pnl
        self.trades.append({
            "timestamp": ts.isoformat(),
            "symbol":    symbol,
            "side":      side,
            "pnl":       float(pnl),
            "equity":    float(self.equity),
        })
        self.record_equity(ts)


def _compute_metrics(account: VirtualAccount) -> dict:
    """Calculate performance metrics from trade log and equity curve."""
    trades  = account.trades
    initial = float(account.initial)
    final   = float(account.equity)

    total_return = (final - initial) / initial

    if not trades:
        return {
            "total_return":     total_return,
            "total_trades":     0,
            "win_rate":         0,
            "profit_factor":    0,
            "max_drawdown":     0,
            "sharpe_ratio":     0,
            "sortino_ratio":    0,
            "avg_win":          0,
            "avg_loss":         0,
            "expectancy":       0,
        }

    pnls      = [t["pnl"] for t in trades]
    wins      = [p for p in pnls if p > 0]
    losses    = [p for p in pnls if p < 0]
    win_rate  = len(wins) / len(pnls) if pnls else 0
    avg_win   = np.mean(wins)  if wins   else 0
    avg_loss  = np.mean(losses) if losses else 0
    pf        = sum(wins) / abs(sum(losses)) if losses else float("inf")
    expectancy = (win_rate * avg_win) + ((1 - win_rate) * avg_loss)

    # Drawdown from equity curve
    equities = np.array([e["equity"] for e in account.equity_curve])
    peak     = np.maximum.accumulate(equities)
    dd       = (equities - peak) / peak
    max_dd   = float(np.min(dd))

    # Daily returns (approximate from equity curve)
    if len(equities) > 1:
        returns       = np.diff(equities) / equities[:-1]
        sharpe        = float(np.mean(returns) / (np.std(returns) + 1e-9) * np.sqrt(252))
        neg_returns   = returns[returns < 0]
        downside_std  = float(np.std(neg_returns)) if len(neg_returns) > 0 else 1e-9
        sortino       = float(np.mean(returns) / downside_std * np.sqrt(252))
    else:
        sharpe = sortino = 0.0

    return {
        "total_return":     round(total_return * 100, 2),   # %
        "total_trades":     len(trades),
        "win_rate":         round(win_rate * 100, 2),        # %
        "profit_factor":    round(pf, 3),
        "max_drawdown":     round(max_dd * 100, 2),          # %
        "sharpe_ratio":     round(sharpe, 3),
        "sortino_ratio":    round(sortino, 3),
        "avg_win":          round(avg_win, 2),
        "avg_loss":         round(avg_loss, 2),
        "expectancy":       round(expectancy, 2),
        "final_equity":     round(final, 2),
        "initial_capital":  round(initial, 2),
    }


async def run_backtest(backtest_id: str, config: dict):
    """
    Run backtest as a background asyncio task.
    Loads candles, replays through strategy, computes metrics.
    """
    try:
        strategy_class_name = config["class_name"]
        params              = config.get("parameters", {})
        symbol              = config["symbol"]
        timeframe           = config.get("timeframe", "1m")
        start               = config["start_date"]
        end                 = config["end_date"]
        stop_loss_pct       = config.get("stop_loss_pct", 0.02)
        take_profit_pct     = config.get("take_profit_pct", 0.04)

        cls = AVAILABLE_STRATEGIES.get(strategy_class_name)
        if not cls:
            raise ValueError(f"Unknown strategy: {strategy_class_name}")

        strategy = cls(
            strategy_id=backtest_id,
            symbols=[symbol],
            parameters=params,
        )
        account = VirtualAccount()

        # Load candles from DB
        async with SessionLocal() as session:
            result = await session.execute(
                select(Candle)
                .where(
                    Candle.symbol    == symbol,
                    Candle.timeframe == timeframe,
                    Candle.open_time >= start,
                    Candle.open_time <= end,
                )
                .order_by(Candle.open_time)
            )
            rows = result.scalars().all()

        if len(rows) < strategy.lookback + 5:
            raise ValueError(f"Not enough candle data ({len(rows)} rows). Need >{strategy.lookback}.")

        log.info("backtest_started", id=backtest_id, symbol=symbol, candles=len(rows))

        candles_dicts = [
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

        # Virtual state
        open_position: dict | None = None

        for i, candle in enumerate(candles_dicts):
            history = candles_dicts[max(0, i - strategy.lookback): i + 1]
            df = pd.DataFrame(history)
            for col in ["open", "high", "low", "close"]:
                df[col] = df[col].astype(float)

            ts    = candle["open_time"]
            price = float(candle["close"])

            # ── Check stop / TP on open position ─────────────────────────────
            if open_position:
                sl = open_position.get("stop_loss")
                tp = open_position.get("take_profit")
                close_reason = None

                if open_position["side"] == "LONG":
                    if sl and price <= sl:  close_reason = "STOP_LOSS"
                    elif tp and price >= tp: close_reason = "TAKE_PROFIT"
                else:
                    if sl and price >= sl:  close_reason = "STOP_LOSS"
                    elif tp and price <= tp: close_reason = "TAKE_PROFIT"

                if close_reason:
                    entry = open_position["entry"]
                    qty   = Decimal(str(open_position["qty"]))
                    fp    = Decimal(str(price))
                    pnl   = (fp - entry) * qty if open_position["side"] == "LONG" else (entry - fp) * qty
                    pnl  -= Decimal("0.005") * qty  # commission
                    account.apply_pnl(pnl, ts, symbol, open_position["side"])
                    open_position = None

            # ── Strategy evaluation ──────────────────────────────────────────
            try:
                signal = await asyncio.wait_for(
                    strategy.on_candle(symbol, dict(candle), df),
                    timeout=5.0,
                )
            except Exception:
                signal = None

            if signal and not open_position:
                if signal.direction in ("LONG", "SHORT"):
                    qty   = Decimal("10")  # fixed 10 shares for backtest simplicity
                    entry = signal.entry_price * (1 + Decimal("0.0005"))  # slippage
                    open_position = {
                        "side":       signal.direction,
                        "entry":      entry,
                        "qty":        float(qty),
                        "stop_loss":  float(signal.entry_price * (1 - Decimal(str(stop_loss_pct)))) if signal.direction == "LONG" else float(signal.entry_price * (1 + Decimal(str(stop_loss_pct)))),
                        "take_profit": float(signal.entry_price * (1 + Decimal(str(take_profit_pct)))) if signal.direction == "LONG" else float(signal.entry_price * (1 - Decimal(str(take_profit_pct)))),
                    }

            elif signal and open_position and signal.direction == "CLOSE":
                entry = open_position["entry"]
                qty   = Decimal(str(open_position["qty"]))
                fp    = signal.entry_price * (1 - Decimal("0.0005"))
                pnl   = (fp - entry) * qty if open_position["side"] == "LONG" else (entry - fp) * qty
                pnl  -= Decimal("0.005") * qty
                account.apply_pnl(pnl, ts, symbol, open_position["side"])
                open_position = None

            # Progress broadcast every 100 candles
            if i % 100 == 0:
                pct = round((i / len(candles_dicts)) * 100)
                await ws_manager.broadcast_all("backtest", {
                    "id": backtest_id, "progress": pct
                })

        # Close any open position at end
        if open_position:
            last_price = float(candles_dicts[-1]["close"])
            entry = open_position["entry"]
            qty   = Decimal(str(open_position["qty"]))
            pnl   = (Decimal(str(last_price)) - entry) * qty if open_position["side"] == "LONG" else (entry - Decimal(str(last_price))) * qty
            account.apply_pnl(pnl, candles_dicts[-1]["open_time"], symbol, open_position["side"])

        metrics = _compute_metrics(account)
        log.info("backtest_complete", id=backtest_id, metrics=metrics)

        # Persist results
        async with SessionLocal() as session:
            await session.execute(
                sql_update(Backtest)
                .where(Backtest.id == backtest_id)
                .values(
                    metrics=metrics,
                    equity_curve=account.equity_curve,
                    trade_log=account.trades,
                    status="COMPLETE",
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()

        await ws_manager.broadcast_all("backtest", {
            "id": backtest_id, "status": "COMPLETE", "metrics": metrics
        })

    except Exception as e:
        log.error("backtest_failed", id=backtest_id, error=str(e))
        async with SessionLocal() as session:
            await session.execute(
                sql_update(Backtest)
                .where(Backtest.id == backtest_id)
                .values(status="FAILED", error_message=str(e))
            )
            await session.commit()
        await ws_manager.broadcast_all("backtest", {
            "id": backtest_id, "status": "FAILED", "error": str(e)
        })
