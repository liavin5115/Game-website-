"""WebSocket connection manager for real-time game updates"""
from typing import Dict, Set
from fastapi import WebSocket
import asyncio
import json
import time


class ConnectionManager:
    def __init__(self):
        # game_id -> {user_id: websocket}
        self.game_connections: Dict[int, Dict[int, WebSocket]] = {}
        # user_id -> set of game_ids they're connected to
        self.user_games: Dict[int, Set[int]] = {}
        # lobby connections
        self.lobby_connections: Set[WebSocket] = set()
        # Track last activity per connection for heartbeat timeout
        self.last_activity: Dict[WebSocket, float] = {}

    async def connect(self, websocket: WebSocket, game_id: int, user_id: int):
        # accept() is already done in the route (main.py)
        self.game_connections.setdefault(game_id, {})[user_id] = websocket
        self.user_games.setdefault(user_id, set()).add(game_id)
        self.last_activity[websocket] = time.time()
        # Broadcast presence change
        await self.broadcast_state_changed(game_id)

    def disconnect(self, game_id: int, user_id: int, websocket: WebSocket | None = None):
        conns = self.game_connections.get(game_id)
        if conns is None:
            return
        # Ignore stale sockets (e.g. an old tab closing after a newer one connected)
        if websocket is not None and conns.get(user_id) is not websocket:
            return

        conns.pop(user_id, None)
        if not conns:
            self.game_connections.pop(game_id, None)

        games = self.user_games.get(user_id)
        if games is not None:
            games.discard(game_id)
            if not games:
                self.user_games.pop(user_id, None)

        # Clean up activity tracking
        if websocket and websocket in self.last_activity:
            del self.last_activity[websocket]

        # Broadcast presence change
        import asyncio
        asyncio.create_task(self.broadcast_state_changed(game_id))

    async def _send(self, game_id: int, user_id: int, ws: WebSocket, message: str) -> bool:
        try:
            await asyncio.wait_for(ws.send_text(message), timeout=2.0)
            return True
        except Exception:
            self.disconnect(game_id, user_id, ws)
            return False

    async def broadcast_game_state(self, game_id: int, state: dict, exclude_user: int | None = None):
        """Broadcast game state to all connected players in a game"""
        conns = self.game_connections.get(game_id)
        if not conns:
            return
        message = json.dumps({"type": "game_state", "payload": state})
        tasks = [
            self._send(game_id, user_id, ws, message)
            for user_id, ws in list(conns.items())
            if user_id != exclude_user
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_state_changed(self, game_id: int):
        """Push-only signal: clients refetch GET /api/games/{id}"""
        conns = self.game_connections.get(game_id)
        if not conns:
            return
        message = json.dumps({"type": "state_changed"})
        tasks = [
            self._send(game_id, user_id, ws, message)
            for user_id, ws in list(conns.items())
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_lobby_update(self, message: dict):
        """Broadcast lobby update to all lobby connections"""
        message_str = json.dumps(message)
        tasks = []
        for ws in list(self.lobby_connections):
            tasks.append(self._send_lobby(ws, message_str))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_lobby(self, ws: WebSocket, message: str):
        try:
            await ws.send_text(message)
        except Exception:
            self.lobby_connections.discard(ws)

    async def send_personal(self, user_id: int, message: dict):
        """Send message to user across all their game connections"""
        message_str = json.dumps(message)
        for game_id in list(self.user_games.get(user_id, ())):
            ws = self.game_connections.get(game_id, {}).get(user_id)
            if ws is not None:
                await self._send(game_id, user_id, ws, message_str)

    async def notify_game_event(self, game_id: int, event: str, data: dict):
        """Notify all players in game of an event"""
        conns = self.game_connections.get(game_id)
        if not conns:
            return
        message = json.dumps({"type": "game_event", "event": event, "payload": data})
        for user_id, ws in list(conns.items()):
            await self._send(game_id, user_id, ws, message)

    def is_connected(self, game_id: int, user_id: int) -> bool:
        """Check if a user is currently connected to a game"""
        conns = self.game_connections.get(game_id)
        if not conns:
            return False
        return user_id in conns

    def get_connected_players(self, game_id: int) -> Set[int]:
        """Get set of connected user_ids for a game"""
        conns = self.game_connections.get(game_id)
        if not conns:
            return set()
        return set(conns.keys())

    def update_activity(self, websocket: WebSocket):
        """Update last activity timestamp for heartbeat tracking"""
        self.last_activity[websocket] = time.time()

    def check_heartbeat_timeouts(self, timeout_seconds: int) -> list[tuple[int, int, WebSocket]]:
        """Check for connections that have timed out. Returns list of (game_id, user_id, websocket)"""
        now = time.time()
        timed_out = []
        for ws, last_time in list(self.last_activity.items()):
            if now - last_time > timeout_seconds:
                # Find which game/user this websocket belongs to
                for game_id, conns in self.game_connections.items():
                    for user_id, conn_ws in conns.items():
                        if conn_ws is ws:
                            timed_out.append((game_id, user_id, ws))
                            break
        return timed_out


manager = ConnectionManager()