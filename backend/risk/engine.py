"""
Risk Engine — Synchronous validation gate.
Checks every signal before it reaches the paper trader.
"""
from __future__ import annotations
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Optional
import structlog

from strategy.base import Signal
from models import Strategy as StrategyModel, RiskConfig

log = structlog.get_logger(__name__)

# ─── Account State (in-memory, refreshed from DB) ────────────────────────────

class AccountState:
    """Tracks live account equity and daily PnL in memory."""
    def __init__(self, initial_capital: float = 100_000.0):
        self.initial_capital: Decimal = Decimal(str(initial_capital))
        self.equity:          Decimal = Decimal(str(initial_capital))
        self.realized_pnl:    Decimal = Decimal("0")
        self.daily_pnl:       Decimal = Decimal("0")
        self._daily_reset_date: date  = datetime.now(timezone.utc).date()

    def reset_daily_pnl_if_needed(self):
        today = datetime.now(timezone.utc).date()
        if today != self._daily_reset_date:
            self.daily_pnl = Decimal("0")
            self._daily_reset_date = today

    def update_pnl(self, pnl: Decimal):
        self.realized_pnl += pnl
        self.daily_pnl    += pnl
        self.equity = self.initial_capital + self.realized_pnl

    def update_equity_from_positions(self, total_unrealized: Decimal):
        """Called periodically to reflect open position values."""
        self.equity = self.initial_capital + self.realized_pnl + total_unrealized


# ─── Cooldown Tracker ────────────────────────────────────────────────────────

class CooldownTracker:
    def __init__(self):
        self._cooldowns: dict[tuple, datetime] = {}  # (strategy_id, symbol) → until

    def set_cooldown(self, strategy_id: str, symbol: str, seconds: int):
        from datetime import timedelta
        key = (strategy_id, symbol)
        self._cooldowns[key] = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        log.debug("cooldown_set", strategy_id=strategy_id, symbol=symbol, seconds=seconds)

    def is_cooling_down(self, strategy_id: str, symbol: str) -> bool:
        key = (strategy_id, symbol)
        until = self._cooldowns.get(key)
        if until and datetime.now(timezone.utc) < until:
            return True
        self._cooldowns.pop(key, None)
        return False


# ─── Risk Engine ─────────────────────────────────────────────────────────────

class RiskEngine:
    """
    Synchronous validation gate.
    All checks must complete in < 5ms — no DB queries.
    """

    def __init__(self, account: AccountState):
        self.account  = account
        self.cooldown = CooldownTracker()

    def check(
        self,
        signal:      Signal,
        risk_config: RiskConfig,
    ) -> tuple[bool, str]:
        """
        Returns (approved: bool, reason: str).
        Mutates signal to attach stop_loss, take_profit, quantity.
        """
        self.account.reset_daily_pnl_if_needed()

        # 1. Daily loss limit
        if self.account.daily_pnl <= -abs(risk_config.max_daily_loss):
            return False, "DAILY_LIMIT_REACHED"

        # 2. Cooldown check
        if self.cooldown.is_cooling_down(signal.strategy_id, signal.symbol):
            return False, "COOLDOWN_ACTIVE"

        # 3. CLOSE signals always pass risk (they reduce exposure)
        if signal.direction == "CLOSE":
            return True, "APPROVED"

        # 4. Position sizing
        stop_distance = signal.entry_price * Decimal(str(risk_config.stop_loss_pct))
        if stop_distance == 0:
            return False, "INVALID_STOP_DISTANCE"

        risk_dollars   = self.account.equity * Decimal(str(risk_config.risk_per_trade))
        quantity        = risk_dollars / stop_distance
        position_value  = quantity * signal.entry_price

        # 5. Max position size check
        if position_value > risk_config.max_position_size:
            quantity = risk_config.max_position_size / signal.entry_price

        if quantity <= 0:
            return False, "POSITION_SIZE_ZERO"

        # 6. Attach to signal
        if signal.direction == "LONG":
            signal.stop_loss   = signal.entry_price * (1 - Decimal(str(risk_config.stop_loss_pct)))
            signal.take_profit = signal.entry_price * (1 + Decimal(str(risk_config.take_profit_pct)))
        else:  # SHORT
            signal.stop_loss   = signal.entry_price * (1 + Decimal(str(risk_config.stop_loss_pct)))
            signal.take_profit = signal.entry_price * (1 - Decimal(str(risk_config.take_profit_pct)))

        # Store quantity in signal metadata for paper trader
        signal.metadata["quantity"] = float(quantity)

        return True, "APPROVED"

    def on_loss(self, strategy_id: str, symbol: str, cooldown_seconds: int):
        """Called by paper trader after a losing trade."""
        self.cooldown.set_cooldown(strategy_id, symbol, cooldown_seconds)


# Global singleton
account_state = AccountState()
risk_engine   = RiskEngine(account_state)
