"""Lobby endpoints - list waiting games"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from auth import get_current_user_optional
from models import User, Game, GameStatus, GameType
from services.game_manager import GameManager
from games import get_game_metadata

router = APIRouter(prefix="/lobby", tags=["lobby"])


class LobbyGameResponse(BaseModel):
    id: int
    game_type: str
    status: str
    buy_in: int
    pot: int
    host_id: int
    max_players: int
    min_players: int
    players: list[dict]
    created_at: str


@router.get("/games", response_model=list[LobbyGameResponse])
def list_lobby_games(
    game_type: Optional[str] = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    manager = GameManager(db)
    games = manager.get_lobby_games(game_type)
    result = []
    for game in games:
        metadata = get_game_metadata(game.game_type.value)
        from models import GameSession
        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
        users = db.query(User).filter(User.id.in_([s.user_id for s in sessions])).all()
        user_map = {u.id: u for u in users}
        players = [
            {
                "id": s.user_id,
                "username": user_map[s.user_id].username,
                "seat": s.position,
                "bet": s.buy_in,
                "status": "waiting"
            }
            for s in sessions if s.user_id in user_map
        ]
        result.append({
            "id": game.id,
            "game_type": game.game_type.value,
            "status": game.status.value,
            "buy_in": game.buy_in,
            "pot": game.pot,
            "host_id": game.player1_id,
            "max_players": metadata.get("max_players", 2),
            "min_players": metadata.get("min_players", 2),
            "players": players,
            "created_at": game.created_at.isoformat() if game.created_at else "",
        })
    return result


