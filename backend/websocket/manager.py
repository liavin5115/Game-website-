"""WebSocket connection manager for real-time game updates"""
from typing import Dict, Set
from fastapi import WebSocket
import json


class ConnectionManager:
    def __init__(self):
        # game_id -> {user_id: websocket}
        self.game_connections: Dict[int, Dict[int, WebSocket]] = {}
        # user_id -> set of game_ids they're connected to
        self.user_games: Dict[int, Set[int]] = {}
        # lobby connections
        self.lobby_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, game_id: int, user_id: int):
        # accept() is already done in the route (main.py)
        self.game_connections.setdefault(game_id, {})[user_id] = websocket
        self.user_games.setdefault(user_id, set()).add(game_id)

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

    async def _send(self, game_id: int, user_id: int, ws: WebSocket, message: str) -> bool:
        try:
            await ws.send_text(message)
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
        for user_id, ws in list(conns.items()):
            if user_id == exclude_user:
                continue
            await self._send(game_id, user_id, ws, message)

    async def broadcast_state_changed(self, game_id: int):
        """Push-only signal: clients refetch GET /api/games/{id}"""
        conns = self.game_connections.get(game_id)
        if not conns:
            return
        message = json.dumps({"type": "state_changed"})
        for user_id, ws in list(conns.items()):
            await self._send(game_id, user_id, ws, message)

    async def broadcast_lobby_update(self, message: dict):
        """Broadcast lobby update to all lobby connections"""
        message_str = json.dumps(message)
        for ws in list(self.lobby_connections):
            try:
                await ws.send_text(message_str)
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


manager = ConnectionManager()