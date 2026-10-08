"""Game endpoints - create, join, action, state"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from auth import get_current_user, get_current_user_optional
from models import User, Game, GameStatus, GameType
from services.game_manager import GameManager
from games import get_game_metadata

router = APIRouter(prefix="/games", tags=["games"])


class CreateGameRequest(BaseModel):
    game_type: str
    buy_in: Optional[int] = None


class JoinGameRequest(BaseModel):
    game_id: int


class ActionRequest(BaseModel):
    game_id: int
    action: str
    amount: int = 0


class LeaveGameRequest(BaseModel):
    game_id: int


class StartGameRequest(BaseModel):
    game_id: int


class GameResponse(BaseModel):
    id: int
    game_type: str
    status: str
    buy_in: int
    pot: int
    host_id: int
    max_players: int
    min_players: int
    players: list[dict]
    winner_id: Optional[int]
    state: dict
    current_turn_user_id: Optional[int]
    my_valid_actions: list[str]
    created_at: str
    started_at: Optional[str]
    finished_at: Optional[str]


class GameListResponse(BaseModel):
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


@router.get("/types")
def list_game_types():
    from games import list_games
    return list_games()


@router.post("/create", response_model=GameResponse)
async def create_game(request: CreateGameRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    try:
        game = await manager.create_game(current_user.id, request.game_type, request.buy_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return game_to_response(game, current_user.id, db)


@router.post("/join", response_model=GameResponse)
async def join_game(request: JoinGameRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    try:
        await manager.join_game(request.game_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    game = manager.get_game(request.game_id, current_user.id)
    return game_to_response(game, current_user.id, db)


@router.post("/leave")
async def leave_game(request: LeaveGameRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    try:
        await manager.leave_game(request.game_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Left game successfully"}


@router.post("/start", response_model=GameResponse)
async def start_game(request: StartGameRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    try:
        game = await manager.start_game(request.game_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=403 if "host" in str(e) else 400, detail=str(e))
    return game_to_response(game, current_user.id, db)


@router.post("/action", response_model=GameResponse)
async def game_action(request: ActionRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    try:
        await manager.apply_action(request.game_id, current_user.id, request.action, request.amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    game = manager.get_game(request.game_id, current_user.id)
    return game_to_response(game, current_user.id, db)


@router.get("/{game_id}", response_model=GameResponse)
def get_game(game_id: int, current_user: User = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    manager = GameManager(db)
    user_id = current_user.id if current_user else None
    game = manager.get_game(game_id, user_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game_to_response(game, user_id, db)


@router.get("/my/history", response_model=list[GameListResponse])
def my_games(status: Optional[str] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    game_status = GameStatus(status) if status else None
    games = manager.get_user_games(current_user.id, game_status)
    return [game_to_list_response(g, db) for g in games]


def game_to_response(game: Game, user_id: Optional[int], db: Session) -> dict:
    import json
    from games import get_game_metadata, get_game_class

    state_dict = {}
    if game.state:
        if isinstance(game.state, dict):
            state_dict = game.state
        elif isinstance(game.state, str):
            try:
                state_dict = json.loads(game.state)
            except:
                state_dict = {}

    # Get actual players from game_sessions
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
            "status": s.result or "playing" if game.status.value == "in_progress" else "waiting"
        }
        for s in sessions if s.user_id in user_map
    ]

    # Get game metadata
    metadata = get_game_metadata(game.game_type.value)

    # Get current turn and valid actions for in_progress games
    current_turn_user_id = None
    my_valid_actions = []

    if game.status.value == "in_progress" and state_dict:
        # Current player
        current_player_idx = state_dict.get("current_player", 0)
        players_state = state_dict.get("players", [])
        if players_state and current_player_idx < len(players_state):
            current_turn_user_id = players_state[current_player_idx].get("id")

        # Valid actions for requesting user
        if user_id and current_turn_user_id == user_id:
            try:
                players_data = [{"id": p["id"], "username": p["username"], "chips": p.get("chips", 0)} for p in players_state]
                game_class = get_game_class(game.game_type.value)
                game_instance = game_class.from_json(game.state, game.buy_in, players_data)
                my_valid_actions = game_instance.get_valid_actions(user_id)
            except:
                pass

    return {
        "id": game.id,
        "game_type": game.game_type.value,
        "status": game.status.value,
        "buy_in": game.buy_in,
        "pot": game.pot,
        "host_id": game.player1_id,
        "max_players": metadata.get("max_players", 2),
        "min_players": metadata.get("min_players", 2),
        "players": players,
        "winner_id": game.winner_id,
        "state": state_dict,
        "current_turn_user_id": current_turn_user_id,
        "my_valid_actions": my_valid_actions,
        "created_at": game.created_at.isoformat() if game.created_at else "",
        "started_at": game.started_at.isoformat() if game.started_at else None,
        "finished_at": game.finished_at.isoformat() if game.finished_at else None,
    }


def game_to_list_response(game: Game, db: Session) -> dict:
    from models import GameSession
    from games import get_game_metadata

    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    users = db.query(User).filter(User.id.in_([s.user_id for s in sessions])).all()
    user_map = {u.id: u for u in users}
    players = [
        {
            "id": s.user_id,
            "username": user_map[s.user_id].username,
            "seat": s.position,
            "bet": s.buy_in,
            "status": s.result or "waiting"
        }
        for s in sessions if s.user_id in user_map
    ]

    metadata = get_game_metadata(game.game_type.value)

    return {
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
    }