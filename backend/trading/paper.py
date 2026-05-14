"""
Paper Trading Engine.
Simulates order execution with slippage and commission.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
import structlog

from db import SessionLocal
from models import Trade, Position, Signal as SignalModel, Strategy as StrategyModel, RiskConfig
from strategy.base import Signal
from ws.manager import ws_manager

log = structlog.get_logger(__name__)

# Constants
SLIPPAGE_BPS   = Decimal("0.0005")   # 0.05%
COMMISSION_PER_SHARE = Decimal("0.005")
MIN_COMMISSION = Decimal("1.00")


def _calc_slippage(price: Decimal, direction: str) -> Decimal:
    slip = price * SLIPPAGE_BPS
    return slip if direction == "LONG" else -slip


def _calc_commission(qty: Decimal, price: Decimal) -> Decimal:
    return max(qty * COMMISSION_PER_SHARE, MIN_COMMISSION)


# ─── Paper Trader ─────────────────────────────────────────────────────────────

class PaperTrader:
    """
    Simulates trade execution and manages positions in-memory + DB.
    """

    def __init__(self):
        # In-memory position cache: (strategy_id, symbol) → Position dict
        self._positions: dict[tuple, dict] = {}
        self._loss_callbacks: list = []

    def register_loss_callback(self, cb):
        """Risk engine registers to hear about losses."""
        self._loss_callbacks.append(cb)

    async def execute(
        self,
        signal:      Signal,
        strategy_model: StrategyModel,
        risk_config: RiskConfig,
    ) -> Optional[dict]:
        """
        Process a validated signal. Returns trade dict or None.
        """
        direction = signal.direction
        symbol    = signal.symbol
        strategy_id = str(strategy_model.id)
        key = (strategy_id, symbol)

        # ── CLOSE: close existing position ───────────────────────────────────
        if direction == "CLOSE":
            if key not in self._positions:
                log.debug("no_position_to_close", symbol=symbol)
                return None
            return await self._close_position(key, signal, risk_config)

        # ── LONG / SHORT: open new position ──────────────────────────────────
        if key in self._positions:
            # Already have position in this symbol — skip
            log.debug("position_already_open", symbol=symbol)
            return None

        qty = Decimal(str(signal.metadata.get("quantity", 1.0)))
        slippage = _calc_slippage(signal.entry_price, direction)
        fill_price = signal.entry_price + slippage
        commission = _calc_commission(qty, fill_price)

        # Persist signal
        signal_id = await self._persist_signal(signal, strategy_id)

        # Create trade record
        trade_id = uuid.uuid4()
        trade_data = {
            "id":          str(trade_id),
            "strategy_id": strategy_id,
            "signal_id":   signal_id,
            "symbol":      symbol,
            "side":        direction,
            "quantity":    float(qty),
            "entry_price": float(fill_price),
            "slippage":    float(slippage),
            "commission":  float(commission),
            "status":      "OPEN",
            "opened_at":   datetime.now(timezone.utc).isoformat(),
        }

        # Create position
        pos = {
            "id":             str(uuid.uuid4()),
            "strategy_id":    strategy_id,
            "symbol":         symbol,
            "side":           direction,
            "quantity":       float(qty),
            "avg_entry":      float(fill_price),
            "current_price":  float(fill_price),
            "unrealized_pnl": 0.0,
            "realized_pnl":   0.0,
            "stop_loss":      float(signal.stop_loss) if signal.stop_loss else None,
            "take_profit":    float(signal.take_profit) if signal.take_profit else None,
            "trade_id":       str(trade_id),
            "signal_id":      signal_id,
            "opened_at":      datetime.now(timezone.utc).isoformat(),
        }
        self._positions[key] = pos

        await self._persist_trade_open(trade_data, pos)
        await ws_manager.broadcast_all("trade", trade_data)
        await ws_manager.broadcast_all("position", pos)

        log.info(
            "trade_opened",
            symbol=symbol, side=direction,
            qty=float(qty), fill=float(fill_price),
        )
        return trade_data

    async def _close_position(
        self, key: tuple, signal: Signal, risk_config: RiskConfig
    ) -> Optional[dict]:
        pos = self._positions.pop(key)
        slippage   = _calc_slippage(signal.entry_price, "SHORT")  # selling = adverse slip
        fill_price = signal.entry_price + slippage
        qty        = Decimal(str(pos["quantity"]))
        commission = _calc_commission(qty, fill_price)
        entry      = Decimal(str(pos["avg_entry"]))

        if pos["side"] == "LONG":
            pnl = (fill_price - entry) * qty - commission - Decimal(str(pos.get("commission", 0)))
        else:
            pnl = (entry - fill_price) * qty - commission - Decimal(str(pos.get("commission", 0)))

        trade_update = {
            "id":          pos["trade_id"],
            "exit_price":  float(fill_price),
            "slippage":    float(slippage),
            "pnl":         float(pnl),
            "status":      "CLOSED",
            "close_reason": signal.metadata.get("close_reason", "SIGNAL"),
            "closed_at":   datetime.now(timezone.utc).isoformat(),
        }

        await self._persist_trade_close(trade_update)
        await ws_manager.broadcast_all("trade", trade_update)
        await ws_manager.broadcast_all("position_closed", {"symbol": pos["symbol"], "pnl": float(pnl)})

        # Notify risk engine of loss
        if pnl < 0:
            for cb in self._loss_callbacks:
                cb(pos["strategy_id"], pos["symbol"], risk_config.cooldown_seconds)

        log.info("trade_closed", symbol=pos["symbol"], pnl=float(pnl))
        return trade_update

    async def update_unrealized_pnl(self, symbol: str, current_price: float):
        """Called on each candle for all open positions in symbol."""
        updated = []
        for key, pos in self._positions.items():
            if pos["symbol"] != symbol:
                continue
            entry = pos["avg_entry"]
            qty   = pos["quantity"]
            if pos["side"] == "LONG":
                upnl = (current_price - entry) * qty
            else:
                upnl = (entry - current_price) * qty

            pos["current_price"]  = current_price
            pos["unrealized_pnl"] = round(upnl, 4)
            updated.append(dict(pos))

            # Check stop loss / take profit
            await self._check_stops(key, pos, current_price)

        if updated:
            await ws_manager.broadcast_all("positions_update", updated)

    async def _check_stops(self, key: tuple, pos: dict, price: float):
        """Trigger stop loss or take profit if hit."""
        sl = pos.get("stop_loss")
        tp = pos.get("take_profit")

        if pos["side"] == "LONG":
            if sl and price <= sl:
                await self._force_close(key, price, "STOP_LOSS")
            elif tp and price >= tp:
                await self._force_close(key, price, "TAKE_PROFIT")
        else:
            if sl and price >= sl:
                await self._force_close(key, price, "STOP_LOSS")
            elif tp and price <= tp:
                await self._force_close(key, price, "TAKE_PROFIT")

    async def _force_close(self, key: tuple, price: float, reason: str):
        from strategy.base import Signal as Sig
        pos = self._positions.get(key)
        if not pos:
            return
        fake_signal = Sig(
            strategy_id=pos["strategy_id"],
            symbol=pos["symbol"],
            direction="CLOSE",
            entry_price=Decimal(str(price)),
            metadata={"close_reason": reason},
        )
        # Use a dummy risk config for force close
        from models import RiskConfig as RC
        dummy_rc = RC(cooldown_seconds=300)
        await self._close_position(key, fake_signal, dummy_rc)

    async def _persist_signal(self, signal: Signal, strategy_id: str) -> int:
        async with SessionLocal() as session:
            db_signal = SignalModel(
                strategy_id=strategy_id,
                symbol=signal.symbol,
                direction=signal.direction,
                entry_price=signal.entry_price,
                stop_loss=signal.stop_loss,
                take_profit=signal.take_profit,
                confidence=signal.confidence,
                metadata=signal.metadata,
            )
            session.add(db_signal)
            await session.commit()
            await session.refresh(db_signal)
            return db_signal.id

    async def _persist_trade_open(self, trade_data: dict, pos: dict):
        async with SessionLocal() as session:
            trade = Trade(
                id=trade_data["id"],
                strategy_id=trade_data["strategy_id"],
                signal_id=trade_data.get("signal_id"),
                symbol=trade_data["symbol"],
                side=trade_data["side"],
                quantity=Decimal(str(trade_data["quantity"])),
                entry_price=Decimal(str(trade_data["entry_price"])),
                slippage=Decimal(str(trade_data["slippage"])),
                commission=Decimal(str(trade_data.get("commission", 0))),
                status="OPEN",
            )
            session.add(trade)
            db_pos = Position(
                id=pos["id"],
                strategy_id=pos["strategy_id"],
                symbol=pos["symbol"],
                side=pos["side"],
                quantity=Decimal(str(pos["quantity"])),
                avg_entry=Decimal(str(pos["avg_entry"])),
                stop_loss=Decimal(str(pos["stop_loss"])) if pos.get("stop_loss") else None,
                take_profit=Decimal(str(pos["take_profit"])) if pos.get("take_profit") else None,
            )
            session.add(db_pos)
            await session.commit()

    async def _persist_trade_close(self, update: dict):
        from sqlalchemy import update as sql_update
        async with SessionLocal() as session:
            await session.execute(
                sql_update(Trade)
                .where(Trade.id == update["id"])
                .values(
                    exit_price=Decimal(str(update["exit_price"])),
                    pnl=Decimal(str(update["pnl"])),
                    status="CLOSED",
                    close_reason=update.get("close_reason"),
                    closed_at=datetime.now(timezone.utc),
                )
            )
            await session.execute(
                sql_update(Position)
                .where(Position.symbol == update.get("symbol", ""))
                .values(realized_pnl=Decimal(str(update["pnl"])))
            )
            await session.commit()

    def get_open_positions(self) -> list[dict]:
        return list(self._positions.values())


# Global singleton
paper_trader = PaperTrader()
