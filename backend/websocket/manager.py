"""WebSocket connection manager for real-time game updates"""
from typing import Dict, List, Set
from fastapi import WebSocket
import json


class ConnectionManager:
    def __init__(self):
        # game_id -> {user_id: websocket}
        self.game_connections: Dict[int, Dict[int, WebSocket]] = {}
        # user_id -> set of game_ids they're watching
        self.user_games: Dict[int, Set[int]] = {}
        # lobby connections
        self.lobby_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, game_id: int, user_id: int):
        await websocket.accept()
        if game_id not in self.game_connections:
            self.game_connections[game_id] = {}
        self.game_connections[game_id][user_id] = websocket

        if user_id not in self.user_games:
            self.user_games[user_id] = set()
        self.user_games[user_id].add(game_id)

    def disconnect(self, game_id: int, user_id: int):
        if game_id in self.game_connections:
            self.game_connections[game_id].pop(user_id, None)
            if not self.game_connections[game_id]:
                del self.game_connections[game_id]

        if user_id in self.user_games:
            self.user_games[user_id].discard(game_id)
            if not self.user_games[user_id]:
                del self.user_games[user_id]

    async def broadcast_game_state(self, game_id: int, state: dict, exclude_user: int | None = None):
        """Broadcast game state to all connected players in a game"""
        if game_id not in self.game_connections:
            return

        message = json.dumps({"type": "game_state", "payload": state})
        disconnected = []

        for user_id, ws in self.game_connections[game_id].items():
            if user_id == exclude_user:
                continue
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(user_id)

        for uid in disconnected:
            self.disconnect(game_id, uid)

    async def broadcast_lobby_update(self, message: dict):
        """Broadcast lobby update to all lobby connections"""
        message_str = json.dumps(message)
        disconnected = []
        for ws in self.lobby_connections:
            try:
                await ws.send_text(message_str)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.lobby_connections.discard(ws)

    async def send_personal(self, user_id: int, message: dict):
        """Send message to user across all their game connections"""
        if user_id not in self.user_games:
            return
        message_str = json.dumps(message)
        for game_id in self.user_games[user_id]:
            if game_id in self.game_connections and user_id in self.game_connections[game_id]:
                try:
                    await self.game_connections[game_id][user_id].send_text(message_str)
                except Exception:
                    self.disconnect(game_id, user_id)

    async def notify_game_event(self, game_id: int, event: str, data: dict):
        """Notify all players in game of an event"""
        if game_id not in self.game_connections:
            return
        message = json.dumps({"type": "game_event", "event": event, "payload": data})
        for user_id, ws in self.game_connections[game_id].items():
            try:
                await ws.send_text(message)
            except Exception:
                self.disconnect(game_id, user_id)


manager = ConnectionManager()