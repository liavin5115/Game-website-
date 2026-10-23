"""Game endpoints - create, join, action, state"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from database import get_db
from auth import get_current_user, get_current_user_optional
from models import User, Game, GameStatus, GameType, GameSession
from services.game_manager import GameManager
from games import get_game_metadata
from websocket.manager import manager
from timeutils import to_utc_iso

router = APIRouter(prefix="/games", tags=["games"])
logger = logging.getLogger(__name__)


class CreateGameRequest(BaseModel):
    game_type: str
    buy_in: Optional[int] = None


class JoinGameRequest(BaseModel):
    game_id: int


class ActionRequest(BaseModel):
    game_id: int
    action: str
    amount: int = 0
    # Optional so legacy/internal callers can omit it; clients should always send it.
    turn_seq: Optional[int] = None


class LeaveGameRequest(BaseModel):
    game_id: int


class StartGameRequest(BaseModel):
    game_id: int


class RematchRequest(BaseModel):
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
    results: list[dict] = []
    winners: list[int] = []
    pot_total: Optional[int] = None
    showdown: bool = False
    winning_cards: list[str] = []
    winner_id: Optional[int]
    state: dict
    current_turn_user_id: Optional[int]
    my_valid_actions: list[str]
    my_action_limits: Optional[dict] = None
    created_at: str
    started_at: Optional[str]
    finished_at: Optional[str]
    next_game_id: Optional[int] = None
    turn_deadline: Optional[str] = None
    turn_seq: int = 0
    server_time: str
    turn_seconds: int = 30


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
        await manager.apply_action(request.game_id, current_user.id, request.action, request.amount, request.turn_seq)
    except ValueError as e:
        raise HTTPException(status_code=400 if "Turn expired" not in str(e) and "Not your turn" not in str(e) else 409, detail=str(e))
    game = manager.get_game(request.game_id, current_user.id)
    return game_to_response(game, current_user.id, db)


@router.get("/{game_id}", response_model=GameResponse)
def get_game(game_id: int, current_user: User = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    manager = GameManager(db)
    user_id = current_user.id if current_user else None
    try:
        game = manager.get_game(game_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game_to_response(game, user_id, db)


@router.get("/active/me", response_model=Optional[GameResponse])
def get_active_game(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the in_progress or waiting game the current user is in, or null."""
    manager = GameManager(db)
    # Find games where user is a participant and game is not finished/cancelled
    game = db.query(Game).join(GameSession).filter(
        GameSession.user_id == current_user.id,
        Game.status.in_([GameStatus.WAITING, GameStatus.IN_PROGRESS])
    ).order_by(Game.created_at.desc()).first()
    
    if not game:
        return None
    return game_to_response(game, current_user.id, db)


@router.get("/my/history", response_model=list[GameListResponse])
def my_games(status: Optional[str] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    game_status = GameStatus(status) if status else None
    games = manager.get_user_games(current_user.id, game_status)
    return [game_to_list_response(g, db) for g in games]


@router.post("/rematch", response_model=GameResponse)
async def rematch_game(request: RematchRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    manager = GameManager(db)
    try:
        game = await manager.rematch_game(request.game_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400 if "not finished" in str(e) or "balance" in str(e).lower() else 403 if "not a player" in str(e) else 409, detail=str(e))
    return game_to_response(game, current_user.id, db)


def game_to_response(game: Game, user_id: Optional[int], db: Session) -> dict:
    import json
    from games import get_game_metadata, get_game_class
    from config import get_settings
    from datetime import datetime, timezone

    settings = get_settings()

    state_dict = {}
    if game.state:
        if isinstance(game.state, dict):
            state_dict = game.state
        elif isinstance(game.state, str):
            try:
                state_dict = json.loads(game.state)
            except:
                state_dict = {}

    # Get next_game_id from finished game's metadata
    next_game_id = None
    if game.status.value == "finished" and state_dict:
        next_game_id = state_dict.get("metadata", {}).get("next_game_id")

    # Get actual players from game_sessions
    from models import GameSession
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    users = db.query(User).filter(User.id.in_([s.user_id for s in sessions])).all()
    user_map = {u.id: u for u in users}

    # Get player state from game state for auto_stood/away
    players_state = state_dict.get("players", [])
    player_state_map = {p["id"]: p for p in players_state}
    state_metadata = state_dict.get("metadata", {}) or {}
    is_finished = game.status == GameStatus.FINISHED
    is_poker = game.game_type == GameType.POKER

    # Authoritative end-of-hand results. New games persist these fields at
    # settlement; the fallbacks keep old finished games readable.
    results: list[dict] = []
    winners: list[int] = []
    showdown = False
    pot_total = state_dict.get("pot", game.pot) or 0
    winning_cards: list[str] = []
    if is_finished and is_poker:
        raw_winners = state_metadata.get("winner_ids")
        if isinstance(raw_winners, list):
            winners = [int(w) for w in raw_winners]
        elif game.winner_id is not None:
            winners = [int(game.winner_id)]
        active_states = [p for p in players_state if p.get("status") == "active"]
        showdown = bool(state_metadata.get("showdown", len(active_states) > 1))
        pot_total = int(state_metadata.get("pot_total", pot_total) or 0)
        winning_cards = list(state_metadata.get("winning_cards") or [])

        from games.poker import evaluate_hand_best, hand_display_name, hand_description

        for s in sessions:
            if s.user_id not in user_map:
                continue
            p = player_state_map.get(s.user_id, {})
            payout = int(s.payout or 0)
            buy_in = int(s.buy_in or 0)
            net = payout - buy_in
            # New games persist the authoritative contribution. Only fall back
            # to buy_in - chips for old games (whose state still holds the
            # pre-settlement stack).
            contribution = p.get("contribution")
            if not isinstance(contribution, int):
                contribution = max(0, buy_in - int(p.get("chips", 0) or 0))
            player_status = p.get("status")

            result = p.get("result")
            if result not in ("won", "lost", "folded", "split"):
                if player_status == "folded":
                    result = "folded"
                elif s.user_id in winners:
                    result = "split" if len(winners) > 1 else "won"
                else:
                    result = "lost"

            hand_name = p.get("hand_name")
            hand_desc = p.get("hand_description")
            revealed_cards = list(p.get("revealed_cards") or [])
            hand_cards = list(p.get("hand_cards") or [])

            # Old finished games predate the persisted result fields. Their
            # visible state still has the showdown cards, so derive the same
            # display data without ever exposing folded/uncontested cards.
            if showdown and player_status == "active":
                visible_cards = [c for c in (p.get("cards") or []) if c != "??"]
                if not revealed_cards and len(visible_cards) == 2:
                    revealed_cards = visible_cards
                if not hand_name and len(visible_cards) == 2:
                    community = [c for c in (state_dict.get("community_cards") or []) if c != "??"]
                    if len(community) >= 3:
                        (rank, tiebreakers), best_five = evaluate_hand_best(visible_cards + community)
                        hand_name = hand_display_name(rank)
                        hand_desc = hand_description(rank, tiebreakers)
                        hand_cards = best_five
                        if s.user_id in winners:
                            for card in best_five:
                                if card not in winning_cards:
                                    winning_cards.append(card)
            else:
                revealed_cards = []
                hand_name = None
                hand_desc = None
                hand_cards = []

            results.append({
                "id": s.user_id,
                "username": user_map[s.user_id].username,
                "result": result,
                "payout": payout,
                "contribution": contribution,
                "net": net,
                "hand_name": hand_name,
                "hand_description": hand_desc,
                "revealed_cards": revealed_cards,
                "hand_cards": hand_cards,
            })
    elif is_finished and game.winner_id is not None:
        winners = [int(game.winner_id)]

    results_by_id = {r["id"]: r for r in results}

    # Get connected players from manager
    connected_players = manager.get_connected_players(game.id)

    players = [
        {
            "id": s.user_id,
            "username": user_map[s.user_id].username,
            "seat": s.position,
            "bet": s.buy_in,
            "status": s.result or ("playing" if game.status.value == "in_progress" else "waiting"),
            "result": results_by_id.get(s.user_id, {}).get("result"),
            "payout": results_by_id.get(s.user_id, {}).get("payout"),
            "contribution": results_by_id.get(s.user_id, {}).get("contribution"),
            "net": results_by_id.get(s.user_id, {}).get("net"),
            "hand_name": results_by_id.get(s.user_id, {}).get("hand_name"),
            "revealed_cards": results_by_id.get(s.user_id, {}).get("revealed_cards", []),
            "auto_stood": player_state_map.get(s.user_id, {}).get("auto_stood", False),
            "away": player_state_map.get(s.user_id, {}).get("status") == "away",
            "connected": s.user_id in connected_players,
        }
        for s in sessions if s.user_id in user_map
    ]

    # Get game metadata
    metadata = get_game_metadata(game.game_type.value)

    # Get current turn and valid actions for in_progress games
    current_turn_user_id = None
    my_valid_actions = []
    my_action_limits = None
    turn_seq = state_dict.get("metadata", {}).get("turn_seq", 0)

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
            except Exception:
                logger.exception(
                    "Failed to compute valid actions for game %s, user %s",
                    game.id,
                    user_id,
                )

            # Server-authoritative bet limits for the UI (never guess on the client).
            me_state = next((p for p in players_state if p.get("id") == user_id), None)
            if me_state is not None:
                chips = int(me_state.get("chips", 0) or 0)
                bet = int(me_state.get("bet", 0) or 0)
                max_to = max(0, chips + bet)
                min_raise = int(state_dict.get("min_raise", 0) or 0)
                current_bet = int(state_dict.get("current_bet", 0) or 0)
                min_bet_to = min(max_to, max(1, min_raise))
                min_raise_to = min(max_to, current_bet + max(1, min_raise))
                my_action_limits = {
                    "min_bet_to": min_bet_to,
                    "min_raise_to": min_raise_to,
                    "max_bet_to": max_to,
                }

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
        "results": results,
        "winners": winners,
        "pot_total": pot_total if is_finished else state_dict.get("pot", game.pot),
        "showdown": showdown,
        "winning_cards": winning_cards,
        "winner_id": game.winner_id,
        "state": state_dict,
        "current_turn_user_id": current_turn_user_id,
        "my_valid_actions": my_valid_actions,
        "my_action_limits": my_action_limits,
        "created_at": to_utc_iso(game.created_at) or "",
        "started_at": to_utc_iso(game.started_at),
        "finished_at": to_utc_iso(game.finished_at),
        "next_game_id": next_game_id,
        "turn_deadline": to_utc_iso(game.turn_deadline),
        "turn_seq": turn_seq,
        "server_time": to_utc_iso(datetime.now(timezone.utc)),
        "turn_seconds": settings.POKER_TURN_SECONDS if game.game_type == GameType.POKER else settings.TURN_SECONDS,
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
        "created_at": to_utc_iso(game.created_at) or "",
    }