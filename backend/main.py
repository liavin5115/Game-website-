"""FastAPI application entry point"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import asyncio
import logging
import time
import json

from config import get_settings
from database import init_db, get_db, SessionLocal
from models import User, Game, GameStatus, GameSession, TransactionType
from auth import get_current_user, get_current_user_optional, decode_token
from routers import auth as auth_router, wallet as wallet_router, games as games_router, lobby as lobby_router
from websocket.manager import manager
from services.game_manager import GameManager
from games import get_game_class

settings = get_settings()
logger = logging.getLogger(__name__)

# Background tasks
sweeper_task: asyncio.Task | None = None
heartbeat_task: asyncio.Task | None = None


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
                        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
                        for s in sessions:
                            u = db.query(User).filter(User.id == s.user_id).first()
                            if u:
                                players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})

                        game_class = get_game_class(game_locked.game_type.value)
                        game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)

                        gm = GameManager(db)
                        timeout_applied = gm._check_and_apply_timeout(game_locked, game_instance)
                        if timeout_applied:
                            db.commit()
                            await manager.broadcast_game_state(game.id, {"type": "state_changed"})
                    except Exception as e:
                        logger.warning(f"Sweeper error for game {game.id}: {e}")
                        db.rollback()
                
                # Check for abandoned rounds (all players disconnected for ABANDON_SECONDS)
                await check_abandoned_rounds(db)
                
                # Check for idle waiting rooms
                await check_idle_waiting_rooms(db)
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Sweeper loop error: {e}")


async def heartbeat_sweeper():
    """Background task that closes WebSocket connections with no activity for HEARTBEAT_TIMEOUT_SECONDS."""
    while True:
        try:
            await asyncio.sleep(5)  # Check every 5 seconds
            timed_out = manager.check_heartbeat_timeouts(settings.HEARTBEAT_TIMEOUT_SECONDS)
            for game_id, user_id, ws in timed_out:
                try:
                    await ws.close(code=4002, reason="Heartbeat timeout")
                except Exception:
                    pass
                manager.disconnect(game_id, user_id, ws)
                # Broadcast state_changed is already handled in disconnect
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Heartbeat sweeper error: {e}")


async def check_abandoned_rounds(db: Session):
    """Auto-finish rounds where all players have been disconnected for ABANDON_SECONDS."""
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    abandon_threshold = now - timedelta(seconds=settings.ABANDON_SECONDS)
    
    # Find in_progress games
    games = db.query(Game).filter(Game.status == GameStatus.IN_PROGRESS).all()
    
    for game in games:
        # Get all players in this game
        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).all()
        if not sessions:
            continue
        
        # Check if ALL players are disconnected
        all_disconnected = True
        for s in sessions:
            if manager.is_connected(game.id, s.user_id):
                all_disconnected = False
                break
        
        if not all_disconnected:
            continue
        
        # All players disconnected - check if they've been disconnected long enough
        # We use the game's updated_at or finished_at as a proxy for "last activity"
        # Better: track last_disconnect_time per game in manager, but for now use game state
        last_activity = game.started_at or game.created_at
        if last_activity and last_activity < abandon_threshold:
            # Abandon this round - auto-stand all, play dealer, settle
            try:
                game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
                if not game_locked or game_locked.status != GameStatus.IN_PROGRESS:
                    continue
                
                players_data = []
                for s in sessions:
                    u = db.query(User).filter(User.id == s.user_id).first()
                    if u:
                        players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})
                
                game_class = get_game_class(game_locked.game_type.value)
                game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)
                
                # Mark all players as auto-stood and away
                state_dict = game_instance.state.to_dict()
                for player in state_dict.get("players", []):
                    player["auto_stood"] = True
                    player["status"] = "away"
                game_locked.state = json.dumps(state_dict)
                
                # Play dealer and finish
                gm = GameManager(db)
                # Force finish by calling _finish_game
                game_locked.turn_deadline = None
                gm._finish_game(game_locked, game_instance)
                
                db.commit()
                await manager.broadcast_game_state(game.id, {"type": "state_changed"})
                logger.info(f"Abandoned round settled: game {game.id}")
            except Exception as e:
                logger.error(f"Abandoned round error for game {game.id}: {e}")
                db.rollback()


async def check_idle_waiting_rooms(db: Session):
    """Cancel waiting games with no connected players and no activity for WAITING_IDLE_MINUTES."""
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    idle_threshold = now - timedelta(minutes=settings.WAITING_IDLE_MINUTES)
    
    games = db.query(Game).filter(Game.status == GameStatus.WAITING).all()
    
    for game in games:
        # Check if any player is connected
        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).all()
        if not sessions:
            continue
        
        any_connected = False
        for s in sessions:
            if manager.is_connected(game.id, s.user_id):
                any_connected = True
                break
        
        if any_connected:
            continue
        
        # No players connected - check idle time
        last_activity = game.created_at
        if last_activity and last_activity < idle_threshold:
            try:
                game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
                if not game_locked or game_locked.status != GameStatus.WAITING:
                    continue
                
                # Refund all buy-ins in ONE transaction
                for s in sessions:
                    from services.wallet import WalletService
                    wallet = WalletService(db)
                    wallet.add_points(
                        s.user_id,
                        s.buy_in,
                        TransactionType.REFUND,
                        f"Game cancelled - waiting room idle",
                        game.id,
                        commit=False
                    )
                
                game_locked.status = GameStatus.CANCELLED
                db.commit()
                
                await manager.broadcast_lobby_update({"type": "lobby_changed", "game_id": game.id})
                logger.info(f"Idle waiting room cancelled with refunds: game {game.id}")
            except Exception as e:
                logger.error(f"Idle waiting room cancellation error for game {game.id}: {e}")
                db.rollback()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global sweeper_task, heartbeat_task
    init_db()
    sweeper_task = asyncio.create_task(turn_timeout_sweeper())
    heartbeat_task = asyncio.create_task(heartbeat_sweeper())
    yield
    if sweeper_task:
        sweeper_task.cancel()
        try:
            await sweeper_task
        except asyncio.CancelledError:
            pass
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
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
                manager.update_activity(websocket)
                # Handle incoming WS messages
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception:
                    pass  # Ignore malformed messages

        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(game_id, user_id, websocket)
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