"""FastAPI application entry point"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from config import get_settings
from database import init_db, get_db
from models import User
from auth import get_current_user, get_current_user_optional, decode_token
from routers import auth as auth_router, wallet as wallet_router, games as games_router, lobby as lobby_router
from websocket.manager import manager
from services.game_manager import GameManager

settings = get_settings()

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

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


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


# WebSocket endpoint for real-time game updates
@app.websocket("/ws/game/{game_id}")
async def websocket_game(websocket: WebSocket, game_id: int, token: str, db: Session = Depends(get_db)):
    # Accept first, then authenticate
    await websocket.accept()

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
    from .models import GameSession
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


# WebSocket for lobby updates
@app.websocket("/ws/lobby")
async def websocket_lobby(websocket: WebSocket, token: str | None = None, db: Session = Depends(get_db)):
    user_id = None
    if token:
        payload = decode_token(token)
        if payload:
            user_id = int(payload.get("sub", 0))

    await websocket.accept()
    manager.lobby_connections.add(websocket)

    try:
        while True:
            # Keep connection alive, wait for messages
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.lobby_connections.discard(websocket)