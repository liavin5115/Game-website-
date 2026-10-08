# Game Platform

Extensible multiplayer game platform with FastAPI backend + React frontend. Supports Poker, Blackjack, and easily adding new games.

## Architecture

```
game_website/
├── backend/                 # FastAPI API
│   ├── main.py             # App entry, WebSocket handlers
│   ├── config.py           # Settings (env-based)
│   ├── database.py         # SQLAlchemy setup
│   ├── models.py           # User, Game, GameSession, Transaction
│   ├── auth.py             # JWT, password hashing
│   ├── services/
│   │   ├── wallet.py       # Point transactions, balance
│   │   └── game_manager.py # Game lifecycle, registry
│   ├── games/
│   │   ├── __init__.py     # Game registry - ADD NEW GAMES HERE
│   │   ├── base.py         # BaseGame, GameState, GameAction
│   │   ├── poker.py        # Texas Hold'em
│   │   └── blackjack.py    # Blackjack
│   ├── routers/
│   │   ├── auth.py         # /auth/register, /auth/login, /auth/me
│   │   ├── wallet.py       # /wallet/balance, /wallet/daily-bonus
│   │   ├── games.py        # /games/create, /games/join, /games/action
│   │   └── lobby.py        # /lobby/games
│   └── websocket/
│       └── manager.py      # Real-time game updates
├── frontend/               # React + Vite
│   ├── src/
│   │   ├── api/client.ts   # Axios with auth interceptors
│   │   ├── stores/         # Zustand state management
│   │   ├── components/
│   │   │   ├── common/     # Button, Input, Modal, Layout
│   │   │   ├── auth/       # LoginForm, RegisterForm
│   │   │   ├── wallet/     # BalanceDisplay, TransactionHistory
│   │   │   ├── lobby/      # GameList
│   │   │   └── games/      # PokerTable, BlackjackTable
│   │   ├── pages/          # Login, Register, Lobby, Game, Wallet
│   │   └── types/          # Shared TypeScript types
└── docker-compose.yml      # Full stack with Postgres + Redis
```

## Quick Start (Local)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env if needed
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173

### Docker (Full Stack)
```bash
docker-compose up --build
```

## Adding a New Game

1. **Create game logic** in `backend/games/yourgame.py`:
```python
from .base import BaseGame, GameAction, GameState, GamePhase

class YourGame(BaseGame):
    def _init_game(self): ...
    def get_valid_actions(self, player_id): ...
    def apply_action(self, player_id, action): ...
    def is_finished(self): ...
    def get_winner(self): ...
    def get_payouts(self): ...
    def to_json(self): ...
    @classmethod
    def from_json(cls, json_str, buy_in, players): ...
```

2. **Register in** `backend/games/__init__.py`:
```python
from .yourgame import YourGame

GAME_REGISTRY["yourgame"] = YourGame
GAME_METADATA["yourgame"] = {
    "name": "Your Game",
    "min_players": 2,
    "max_players": 4,
    "default_buy_in": 50,
    "description": "Description",
}
```

3. **Create frontend component** in `frontend/src/components/games/yourgame/YourGameTable.tsx`

4. **Add route** in `frontend/src/pages/Game.tsx`:
```python
case 'yourgame':
  return <YourGameTable gameId={parseInt(gameId!)} />;
```

That's it! The game will appear in lobby, support buy-ins, points, and real-time play.

## Point System

- **Initial points**: 1000 (configurable via `INITIAL_POINTS`)
- **Daily bonus**: 100 points (configurable via `DAILY_BONUS`)
- **Game buy-in**: Deducted from points when joining
- **Winnings**: Added to points when game finishes
- **All transactions logged** in `Transaction` table with full audit trail

## API Endpoints

### Auth
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user

### Wallet
- `GET /api/wallet/balance` - Current points
- `GET /api/wallet/transactions` - History
- `POST /api/wallet/daily-bonus` - Claim daily bonus
- `GET /api/wallet/summary` - Win/loss stats

### Games
- `GET /api/games/types` - Available game types
- `POST /api/games/create` - Create game
- `POST /api/games/join` - Join game
- `POST /api/games/action` - Take action (bet, fold, hit, etc.)
- `GET /api/games/{id}` - Get game state
- `GET /api/games/my/history` - User's game history

### Lobby
- `GET /api/lobby/games` - List waiting games

### WebSocket
- `ws://localhost:8000/ws/game/{game_id}?token=...` - Real-time game updates
- `ws://localhost:8000/ws/lobby?token=...` - Lobby updates