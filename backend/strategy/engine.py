"""
Strategy Engine.
Manages active strategies, history buffers, and candle evaluation.
"""
from __future__ import annotations
import asyncio
from collections import defaultdict, deque
from datetime import datetime
from decimal import Decimal
from typing import Any
import pandas as pd
import structlog

from strategy.base import BaseStrategy, Signal
from strategy.sma_crossover import SMACrossoverStrategy
from strategy.rsi_reversal import RSIReversalStrategy
from models import Strategy as StrategyModel

log = structlog.get_logger(__name__)

# ─── Strategy Registry ───────────────────────────────────────────────────────

AVAILABLE_STRATEGIES: dict[str, type[BaseStrategy]] = {
    "SMACrossoverStrategy": SMACrossoverStrategy,
    "RSIReversalStrategy":  RSIReversalStrategy,
}


def list_available_strategies() -> list[dict]:
    return [
        {
            "class_name":  k,
            "name":        v.name,
            "version":     v.version,
            "lookback":    v.lookback,
            "parameters":  v.parameters,
        }
        for k, v in AVAILABLE_STRATEGIES.items()
    ]


# ─── Running Instances ───────────────────────────────────────────────────────

class StrategyInstance:
    def __init__(self, model: StrategyModel, strategy: BaseStrategy):
        self.model    = model
        self.strategy = strategy
        self.history: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))

    def update_history(self, symbol: str, candle: dict):
        self.history[symbol].append(candle)

    def get_history_df(self, symbol: str) -> pd.DataFrame:
        h = list(self.history[symbol])
        if not h:
            return pd.DataFrame()
        df = pd.DataFrame(h)
        for col in ["open", "high", "low", "close"]:
            if col in df.columns:
                df[col] = df[col].astype(float)
        return df


# ─── Engine ──────────────────────────────────────────────────────────────────

class StrategyEngine:
    def __init__(self):
        self._instances: dict[str, StrategyInstance] = {}  # strategy_id → instance
        self._signal_callbacks: list = []

    def register_signal_callback(self, cb):
        """Risk engine / paper trader register here."""
        self._signal_callbacks.append(cb)

    def activate(self, model: StrategyModel) -> bool:
        """Load and activate a strategy instance."""
        cls = AVAILABLE_STRATEGIES.get(model.class_name)
        if not cls:
            log.error("unknown_strategy_class", class_name=model.class_name)
            return False

        strategy = cls(
            strategy_id=str(model.id),
            symbols=model.symbols,
            parameters=model.parameters or {},
        )
        instance = StrategyInstance(model, strategy)
        self._instances[str(model.id)] = instance
        strategy.on_start()
        log.info("strategy_activated", name=model.name, id=str(model.id))
        return True

    def deactivate(self, strategy_id: str):
        instance = self._instances.pop(strategy_id, None)
        if instance:
            instance.strategy.on_stop()
            log.info("strategy_deactivated", id=strategy_id)

    async def on_candle(self, candle: dict):
        """
        Called by market ingestion on each new candle.
        Fan-out to all subscribed strategy instances.
        """
        symbol = candle["symbol"]

        tasks = []
        for instance in list(self._instances.values()):
            if symbol in instance.strategy.symbols:
                instance.update_history(symbol, candle)
                if instance.strategy.is_healthy:
                    tasks.append(self._evaluate(instance, symbol, candle))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _evaluate(self, instance: StrategyInstance, symbol: str, candle: dict):
        """Evaluate one strategy on one candle, with error isolation."""
        try:
            history = instance.get_history_df(symbol)
            if len(history) < instance.strategy.lookback:
                return  # Not enough history yet

            signal = await asyncio.wait_for(
                instance.strategy.on_candle(symbol, candle, history),
                timeout=5.0,
            )

            if signal:
                log.info(
                    "signal_generated",
                    strategy=instance.model.name,
                    symbol=symbol,
                    direction=signal.direction,
                    price=str(signal.entry_price),
                )
                for cb in self._signal_callbacks:
                    await cb(signal, instance.model)

        except asyncio.TimeoutError:
            log.warning("strategy_timeout", id=instance.model.id)
            instance.strategy.on_error(TimeoutError("Evaluation timed out"))
        except Exception as e:
            log.error("strategy_error", id=instance.model.id, error=str(e))
            instance.strategy.on_error(e)
            if not instance.strategy.is_healthy:
                log.error("strategy_disabled", id=instance.model.id, reason="too_many_errors")
                self.deactivate(str(instance.model.id))

    @property
    def active_count(self) -> int:
        return len(self._instances)


# Global singleton
strategy_engine = StrategyEngine()
