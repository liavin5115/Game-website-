"""FastAPI application entry point"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import asyncio
import logging

from config import get_settings
from database import init_db, get_db, SessionLocal
from models import User, Game, GameStatus
from auth import get_current_user, get_current_user_optional, decode_token
from routers import auth as auth_router, wallet as wallet_router, games as games_router, lobby as lobby_router
from websocket.manager import manager
from services.game_manager import GameManager

settings = get_settings()
logger = logging.getLogger(__name__)

# Background task for turn timeout sweeper
sweeper_task: asyncio.Task | None = None

async def turn_timeout_sweeper():
    """Background task that checks for expired turn deadlines every second."""
    while True:
        try:
            await asyncio.sleep(1)
            db = SessionLocal()
            try:
                # Find in_progress games with expired turn_deadline
                now = __import__('datetime').datetime.utcnow()
                games = db.query(Game).filter(
                    Game.status == GameStatus.IN_PROGRESS,
                    Game.turn_deadline.isnot(None),
                    Game.turn_deadline <= now
                ).all()

                for game in games:
                    try:
                        # Lock the game row
                        game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
                        if not game_locked or game_locked.status != GameStatus.IN_PROGRESS:
                            continue

                        players_data = []
                        from models import GameSession
                        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
                        for s in sessions:
                            u = db.query(User).filter(User.id == s.user_id).first()
                            if u:
                                players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})

                        from games import get_game_class
                        game_class = get_game_class(game_locked.game_type.value)
                        game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)

                        gm = GameManager(db)
                        timeout_applied = gm._check_and_apply_timeout(game_locked, game_instance)
                        if timeout_applied:
                            db.commit()
                            await manager.broadcast_game_state(game.id, {"type": "state_changed"})
                    except Exception as e:
                        logger.error(f"Sweeper error for game {game.id}: {e}")
                        db.rollback()
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Sweeper loop error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global sweeper_task
    init_db()
    sweeper_task = asyncio.create_task(turn_timeout_sweeper())
    yield
    if sweeper_task:
        sweeper_task.cancel()
        try:
            await sweeper_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG, lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router.router, prefix="/api")
app.include_router(wallet_router.router, prefix="/api")
app.include_router(games_router.router, prefix="/api")
app.include_router(lobby_router.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# WebSocket endpoint for real-time game updates
@app.websocket("/ws/game/{game_id}")
async def websocket_game(websocket: WebSocket, game_id: int, token: str):
    # Accept first, then authenticate
    await websocket.accept()

    # Create a new DB session for this WebSocket connection
    from database import SessionLocal
    db = SessionLocal()
    
    try:
        # Authenticate via token query param
        payload = decode_token(token)
        if not payload:
            await websocket.close(code=4001)
            return

        user_id = int(payload.get("sub", 0))
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            await websocket.close(code=4001)
            return

        # Verify user is in this game
        game_manager = GameManager(db)
        game = game_manager.get_game(game_id)
        if not game:
            await websocket.close(code=4004)
            return

        # Check if user is a participant
        from models import GameSession
        session = db.query(GameSession).filter(
            GameSession.game_id == game_id,
            GameSession.user_id == user_id
        ).first()
        if not session:
            await websocket.close(code=4003)
            return

        await manager.connect(websocket, game_id, user_id)

        try:
            # Send initial state
            game = game_manager.get_game(game_id, user_id)
            if game:
                import json
                state = json.loads(game.state) if isinstance(game.state, str) else game.state
                await websocket.send_text(json.dumps({"type": "game_state", "payload": state}))

            # Listen for messages (client can send actions via WS too)
            while True:
                data = await websocket.receive_text()
                # Handle incoming WS messages if needed
                pass

        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(game_id, user_id)
    finally:
        db.close()


# WebSocket for lobby updates
@app.websocket("/ws/lobby")
async def websocket_lobby(websocket: WebSocket, token: str | None = None):
    user_id = None
    if token:
        from database import SessionLocal
        db = SessionLocal()
        try:
            payload = decode_token(token)
            if payload:
                user_id = int(payload.get("sub", 0))
        finally:
            db.close()

    await websocket.accept()
    manager.lobby_connections.add(websocket)

    try:
        while True:
            # Keep connection alive, wait for messages
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.lobby_connections.discard(websocket)