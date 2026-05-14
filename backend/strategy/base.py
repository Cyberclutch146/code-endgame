"""
Abstract base class for all trading strategies.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional
import pandas as pd


@dataclass
class Signal:
    strategy_id: str
    symbol:      str
    direction:   Literal["LONG", "SHORT", "CLOSE"]
    entry_price: Decimal
    confidence:  float = 0.5
    stop_loss:   Optional[Decimal] = None
    take_profit: Optional[Decimal] = None
    timeframe:   str = "1m"
    metadata:    dict = field(default_factory=dict)
    generated_at: datetime = field(default_factory=datetime.utcnow)


class BaseStrategy(ABC):
    """
    All strategies inherit from this class.
    Enforces the interface contract.
    """
    name:       str = "base"
    version:    str = "1.0.0"
    timeframe:  str = "1m"
    lookback:   int = 50          # Min candles required before first signal
    parameters: dict[str, Any] = {}

    def __init__(self, strategy_id: str, symbols: list[str], parameters: dict[str, Any] = {}):
        self.strategy_id = strategy_id
        self.symbols = [s.upper() for s in symbols]
        self.parameters = {**self.__class__.parameters, **parameters}
        self._error_count = 0
        self._max_errors = 5

    @abstractmethod
    async def on_candle(
        self,
        symbol:  str,
        candle:  dict,
        history: pd.DataFrame,
    ) -> Optional[Signal]:
        """
        Called on each new candle.
        Return a Signal or None.
        MUST be deterministic: same inputs → same output, always.
        """
        ...

    def validate_parameters(self, params: dict) -> bool:
        """Override to validate parameters. Return False to reject."""
        return True

    def on_start(self):
        """Called when strategy is activated."""
        pass

    def on_stop(self):
        """Called when strategy is deactivated."""
        pass

    def on_error(self, error: Exception):
        """Called on unhandled error in on_candle."""
        self._error_count += 1

    @property
    def is_healthy(self) -> bool:
        return self._error_count < self._max_errors
