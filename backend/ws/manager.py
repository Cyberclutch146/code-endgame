"""
WebSocket connection manager.
Handles all active WS connections, subscriptions, and broadcasts.
"""
from __future__ import annotations
import asyncio
import json
import uuid
from datetime import datetime
from typing import Any
from fastapi import WebSocket
import structlog

log = structlog.get_logger(__name__)


class ConnectionManager:
    def __init__(self):
        # session_id -> WebSocket
        self._connections: dict[str, WebSocket] = {}
        # channel -> set of session_ids
        self._subscriptions: dict[str, set[str]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> str:
        """Accept connection and return session_id."""
        await ws.accept()
        session_id = str(uuid.uuid4())
        async with self._lock:
            self._connections[session_id] = ws
        log.info("ws_connected", session_id=session_id, total=len(self._connections))
        return session_id

    async def disconnect(self, session_id: str):
        async with self._lock:
            self._connections.pop(session_id, None)
            # Remove from all subscriptions
            for subs in self._subscriptions.values():
                subs.discard(session_id)
        log.info("ws_disconnected", session_id=session_id, total=len(self._connections))

    async def subscribe(self, session_id: str, channels: list[str]):
        async with self._lock:
            for ch in channels:
                self._subscriptions.setdefault(ch, set()).add(session_id)
        log.debug("ws_subscribed", session_id=session_id, channels=channels)

    async def unsubscribe(self, session_id: str, channels: list[str]):
        async with self._lock:
            for ch in channels:
                if ch in self._subscriptions:
                    self._subscriptions[ch].discard(session_id)

    async def broadcast(self, channel: str, data: Any):
        """Send to all sessions subscribed to channel."""
        payload = json.dumps({
            "type":      channel.split(".")[0],
            "channel":   channel,
            "data":      data,
            "timestamp": datetime.utcnow().isoformat(),
        }, default=str)

        # Collect recipients first to avoid holding lock during I/O
        async with self._lock:
            recipients = list(self._subscriptions.get(channel, set()))

        dead: list[str] = []
        for sid in recipients:
            ws = self._connections.get(sid)
            if ws is None:
                dead.append(sid)
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(sid)

        # Prune dead connections
        for sid in dead:
            await self.disconnect(sid)

    async def broadcast_all(self, channel: str, data: Any):
        """Broadcast to ALL connected sessions regardless of subscription."""
        payload = json.dumps({
            "type":      channel,
            "channel":   channel,
            "data":      data,
            "timestamp": datetime.utcnow().isoformat(),
        }, default=str)

        async with self._lock:
            sids = list(self._connections.keys())

        dead: list[str] = []
        for sid in sids:
            ws = self._connections.get(sid)
            if ws:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(sid)

        for sid in dead:
            await self.disconnect(sid)

    async def send_to(self, session_id: str, data: Any):
        """Send directly to one session."""
        ws = self._connections.get(session_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                await self.disconnect(session_id)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# ─── Global singleton ────────────────────────────────────────────────────────
ws_manager = ConnectionManager()
