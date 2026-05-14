"""
RSI Reversal Strategy.
Generates LONG when RSI exits oversold territory (crosses above 30).
Generates CLOSE (SHORT signal) when RSI exits overbought (crosses below 70).
"""
from __future__ import annotations
from decimal import Decimal
from typing import Optional
import pandas as pd
import ta

from strategy.base import BaseStrategy, Signal


class RSIReversalStrategy(BaseStrategy):
    name:       str = "RSI Reversal"
    version:    str = "1.0.0"
    lookback:   int = 50
    parameters: dict = {
        "rsi_period":    14,
        "oversold":      30,
        "overbought":    70,
        "confirm_bars":  1,    # Bars RSI must stay in zone before signal
    }

    async def on_candle(
        self, symbol: str, candle: dict, history: pd.DataFrame
    ) -> Optional[Signal]:
        period     = int(self.parameters.get("rsi_period", 14))
        oversold   = float(self.parameters.get("oversold", 30))
        overbought = float(self.parameters.get("overbought", 70))

        if len(history) < period + 2:
            return None

        closes = history["close"].astype(float)
        rsi = ta.momentum.RSIIndicator(closes, window=period).rsi()

        curr_rsi = rsi.iloc[-1]
        prev_rsi = rsi.iloc[-2]

        if pd.isna(curr_rsi) or pd.isna(prev_rsi):
            return None

        price = Decimal(str(candle["close"]))

        # RSI crosses above oversold → bullish reversal
        if prev_rsi <= oversold and curr_rsi > oversold:
            return Signal(
                strategy_id=self.strategy_id,
                symbol=symbol,
                direction="LONG",
                entry_price=price,
                confidence=round((oversold - min(prev_rsi, oversold)) / oversold, 3),
                metadata={
                    "rsi_current": round(curr_rsi, 2),
                    "rsi_prev":    round(prev_rsi, 2),
                    "signal_type": "oversold_exit",
                },
            )

        # RSI crosses below overbought → bearish reversal / close long
        if prev_rsi >= overbought and curr_rsi < overbought:
            return Signal(
                strategy_id=self.strategy_id,
                symbol=symbol,
                direction="CLOSE",
                entry_price=price,
                confidence=round((max(prev_rsi, overbought) - overbought) / (100 - overbought), 3),
                metadata={
                    "rsi_current": round(curr_rsi, 2),
                    "rsi_prev":    round(prev_rsi, 2),
                    "signal_type": "overbought_exit",
                },
            )

        return None
