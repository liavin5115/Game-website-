# Game Platform

Real-time multiplayer game platform with a FastAPI backend and a React frontend. Currently ships two fully playable games: **Blackjack** and **Texas Hold'em Poker** (2–10 players). Extensible game registry — new games can be added without touching core infra.

## Features

- **Lobby** — list/create/join waiting games with live WebSocket updates
- **Waiting room** — player list, host-only start, leave with refund, auto-redirect when game starts
- **Blackjack** — 3:2 blackjack, dealer soft-17, hit/stand/double, per-player settlement
- **Texas Hold'em Poker** — full betting rounds (preflop/flop/turn/river/showdown), fold/check/call/bet/raise/all-in, single pot with split handling, blinds derived from buy-in
- **Turn timer** — server-owned 30s clock, auto check/fold or stand on timeout, 2 strikes → "away"
- **Reconnect & presence** — heartbeat, disconnected badges, abandoned-round handling, idle-room cancellation with refund, resume active game on login
- **Rematch ("Play Again")** — idempotent, race-safe, joins existing waiting rematch or creates new
- **Wallet** — balance, daily bonus, transaction ledger, SQL-aggregated stats (games played/wins/losses/pushes/win rate/net/biggest win)
- **Result reveal** — server-authoritative payouts, timed card reveal, hand names, balance refresh
- **Responsive UI** — desktop oval table (up to 10 seats) and mobile stacked layout

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI 0.109, Uvicorn, SQLAlchemy 2.0, Pydantic 2 |
| Database | SQLite (`game_platform.db`) by default (Postgres supported via `DATABASE_URL`) |
| Auth | JWT (HS256), 7-day expiry, `SECRET_KEY` from `.env` |
| Real-time | Native FastAPI WebSocket + custom `ConnectionManager` |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS |
| State/Query | TanStack Query v5, Zustand (auth only) |
| Routing | React Router v6 |
| Tests | pytest (backend), Vitest (frontend) |

## Project Structure

```
game_website/
├── backend/
│   ├── main.py              # FastAPI app, WS endpoints, CORS, startup, sweepers
│   ├── config.py            # Pydantic settings (.env)
│   ├── database.py          # Engine (NullPool for SQLite), SessionLocal, init_db()
│   ├── models.py            # User, Game, GameSession, Transaction
│   ├── auth.py              # JWT encode/decode, password hashing
│   ├── timeutils.py         # UTC ISO formatting
│   ├── routers/             # auth, wallet, games, lobby
│   ├── services/            # game_manager, wallet
│   ├── games/               # base, blackjack, poker, __init__ registry
│   └── websocket/           # ConnectionManager
├── frontend/
│   └── src/
│       ├── api/             # axios client
│       ├── hooks/           # useGameSocket, usePokerGame, usePokerReveal
│       ├── stores/          # authStore (Zustand)
│       ├── types/           # shared TS interfaces
│       ├── pages/           # Login, Register, Lobby, Game, WaitingRoom, Wallet
│       └── components/      # common, games/blackjack, games/poker, lobby, wallet
├── CONTEXT.md               # Architecture & conventions
├── PROGRESS.md              # Real-time task checklist (source of truth)
├── docker-compose.yml
└── README.md
```

## Quick Start (Local)

### Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate   |   Unix: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit if needed
uvicorn main:app --reload
```

API runs at http://localhost:8000 (docs at `/docs`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173.

### Docker (full stack)

```bash
docker-compose up --build
```

> Note: docker-compose provisions Postgres + Redis and overrides `DATABASE_URL`. For local dev the default SQLite DB is used.

## Environment Variables (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./game_platform.db` | DB connection string |
| `SECRET_KEY` | (change in prod) | JWT signing key |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | 7 days |
| `DEBUG` | `true` | Debug mode |
| `CORS_ORIGINS` | `["http://localhost:5173", ...]` | Allowed origins (JSON array) |
| `INITIAL_POINTS` | `1000` | Starting balance |
| `DAILY_BONUS` | `100` | Daily bonus amount |

## Point System

- **Initial points**: 1000 (configurable via `INITIAL_POINTS`)
- **Daily bonus**: 100 points/day (configurable via `DAILY_BONUS`)
- **Game buy-in**: deducted on join/create
- **Winnings**: credited on finish; all movements logged in `Transaction` with `balance_after` and `reference_id`
- **Wallet stats**: SQL aggregates over finished `GameSession` rows

## API Overview

### Auth
- `POST /api/auth/register` — register
- `POST /api/auth/login` — returns `{access_token, user}`
- `GET /api/auth/me` — current user

### Wallet
- `GET /api/wallet/balance` — points
- `GET /api/wallet/transactions` — paginated ledger
- `POST /api/wallet/daily-bonus` — claim daily bonus
- `GET /api/wallet/summary` — win/loss stats

### Games
- `GET /api/games/types` — registered game types + metadata
- `POST /api/games/create` — create game (host), deduct buy-in
- `POST /api/games/join` — join waiting game
- `POST /api/games/leave` — leave waiting game, refund
- `POST /api/games/start` — host starts (min players)
- `POST /api/games/action` — take action (`{game_id, action, amount?, turn_seq?}`)
- `POST /api/games/rematch` — idempotent rematch
- `GET /api/games/{id}` — full state (opponent cards hidden during play)
- `GET /api/games/active/me` — current user's active/waiting game
- `GET /api/games/my/history` — past games

### Lobby
- `GET /api/lobby/games` — waiting games

### WebSocket
- `ws://host/ws/game/{game_id}?token=` — pushes `state_changed` (client refetches)
- `ws://host/ws/lobby?token=` — pushes `lobby_changed`

## Game Rules Summary

### Blackjack
- Dealer hits soft 17; blackjack pays 3:2; win pays 2× bet; push refunds; bust/loss = 0
- Actions: hit, stand, double (wallet-checked)
- 30s turn timer; 2 timeouts → "away" (auto-stand)

### Texas Hold'em Poker
- 2–10 players; buy-in ≥ 40; blinds: BB = `buy_in // 20`, SB = `BB // 2` (min 1)
- No rake; leftover chips refunded
- 30s per turn; timeout = check if legal else fold; 2 strikes → "away"
- Actions: fold, check, call, bet, raise, all-in; min-raise enforced server-side
- Single pot (no side pots in MVP); odd chip to first winner on split

## Adding a New Game

1. Create `backend/games/yourgame.py` implementing `BaseGame` (`_init_game`, `get_valid_actions`, `apply_action`, `is_finished`, `get_winner`, `get_payouts`, `to_json`, `from_json`).
2. Register in `backend/games/__init__.py`:
   ```python
   GAME_REGISTRY["yourgame"] = YourGame
   GAME_METADATA["yourgame"] = {"name": "Your Game", "min_players": 2, "max_players": 4, "default_buy_in": 50, "description": "..."}
   ```
3. Create `frontend/src/components/games/yourgame/YourGameTable.tsx`.
4. Dispatch by `game_type` in `frontend/src/pages/Game.tsx`.

The game then appears in the lobby, supports buy-ins/points, and real-time play automatically.

## Testing

### Backend
```bash
cd backend
venv\Scripts\python.exe -m pytest -q
```
Poker suites: `test_poker.py`, `test_poker_group_c.py`, `test_poker_api.py`, `test_rematch.py`.  
> Warning: tests delete all rows from the live `games` table — use a disposable DB.

### Frontend
```bash
cd frontend
npx tsc --noEmit
npm test
npm run build
```

## Conventions

- Code/comments/variables in English
- Backend imports absolute from `backend/` root; async endpoints; `ValueError` in services → `HTTPException` in routers
- DB sessions per request; WebSocket endpoints create/close their own `SessionLocal`
- Single `commit` per logical unit; `commit=False` on intermediate wallet ops
- Server is single source of truth; idempotency for double-click/concurrent actions
- No schema changes without asking; use `state.metadata` for extensible fields

## Further Reading

- `CONTEXT.md` — architecture, conventions, DB/API details
- `PROGRESS.md` — real-time task checklist and Poker API contract