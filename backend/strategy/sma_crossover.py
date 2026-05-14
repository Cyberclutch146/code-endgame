"""
SMA Crossover Strategy.
Generates LONG when fast SMA crosses above slow SMA.
Generates CLOSE when fast SMA crosses below slow SMA.
"""
from __future__ import annotations
from decimal import Decimal
from typing import Optional
import pandas as pd

from strategy.base import BaseStrategy, Signal


class SMACrossoverStrategy(BaseStrategy):
    name:       str = "SMA Crossover"
    version:    str = "1.0.0"
    lookback:   int = 210         # Needs at least slow_period candles
    parameters: dict = {
        "fast_period": 20,
        "slow_period": 50,
        "min_gap_pct": 0.001,     # Minimum % gap between SMAs to confirm cross
    }

    async def on_candle(
        self, symbol: str, candle: dict, history: pd.DataFrame
    ) -> Optional[Signal]:
        fast = int(self.parameters.get("fast_period", 20))
        slow = int(self.parameters.get("slow_period", 50))
        min_gap = float(self.parameters.get("min_gap_pct", 0.001))

        if len(history) < slow + 2:
            return None

        closes = history["close"].astype(float)
        sma_fast = closes.rolling(fast).mean()
        sma_slow = closes.rolling(slow).mean()

        # Current and previous bar values
        curr_fast, prev_fast = sma_fast.iloc[-1], sma_fast.iloc[-2]
        curr_slow, prev_slow = sma_slow.iloc[-1], sma_slow.iloc[-2]

        if any(pd.isna([curr_fast, prev_fast, curr_slow, prev_slow])):
            return None

        price = Decimal(str(candle["close"]))
        gap = abs(curr_fast - curr_slow) / curr_slow

        # Golden cross: fast crosses above slow
        if prev_fast <= prev_slow and curr_fast > curr_slow and gap >= min_gap:
            return Signal(
                strategy_id=self.strategy_id,
                symbol=symbol,
                direction="LONG",
                entry_price=price,
                confidence=min(gap * 100, 1.0),
                metadata={
                    "fast_sma": round(curr_fast, 4),
                    "slow_sma": round(curr_slow, 4),
                    "gap_pct":  round(gap * 100, 3),
                },
            )

        # Death cross: fast crosses below slow
        if prev_fast >= prev_slow and curr_fast < curr_slow and gap >= min_gap:
            return Signal(
                strategy_id=self.strategy_id,
                symbol=symbol,
                direction="CLOSE",
                entry_price=price,
                confidence=min(gap * 100, 1.0),
                metadata={
                    "fast_sma": round(curr_fast, 4),
                    "slow_sma": round(curr_slow, 4),
                    "gap_pct":  round(gap * 100, 3),
                },
            )

        return None
