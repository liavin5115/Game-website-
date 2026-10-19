# CONTEXT.md — Game Platform

> **Purpose**: Instant onboarding for any AI/human joining this project.  
> **Source of truth**: `progress.md` for real-time task status; this file for architecture & conventions.

---

## 1. Project Overview

A **real-time multiplayer game platform** with a lobby system, wallet/points economy, and two games: **Blackjack** (fully implemented) and **Texas Hold'em Poker** (skeleton registered).  
Players create/join games, wager points, play via WebSocket-synced state, and receive automatic payouts. Wallet tracks balance, transactions, and game statistics.

**Core flows**:
- **Lobby** → list/create/join games (WebSocket live updates)
- **Waiting room** → host starts when min players reached
- **Game table** → turn-based actions (hit/stand/double), dealer auto-play, settlement
- **Finished state** → result badges, payout, "Play Again" (rematch), back to lobby
- **Wallet** → balance, daily bonus, transaction history, SQL-aggregated stats

---

## 2. Tech Stack & Environment

| Layer | Technology | Version / Notes |
|-------|------------|-----------------|
| **Backend** | FastAPI (Python) | 0.109+ |
| **ASGI Server** | Uvicorn | — |
| **Database** | SQLite (file `game_platform.db`) | SQLAlchemy 2.0 ORM |
| **Auth** | JWT (HS256) | `SECRET_KEY` from `.env`, 7-day expiry |
| **WebSockets** | Native FastAPI `WebSocket` | Custom `ConnectionManager` |
| **Frontend** | React 18 + TypeScript | Vite 5, Tailwind CSS |
| **State/Query** | TanStack Query (React Query) | v5 |
| **Routing** | React Router v6 | — |
| **Stores** | Zustand (auth) | Minimal global state |
| **Package Manager** | npm | — |
| **Python Env** | `backend/venv` | Python 3.12+ |

**Key dependencies** (backend): `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `pydantic-settings`, `python-jose`, `passlib`, `python-multipart`  
**Key dependencies** (frontend): `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `zustand`, `axios`, `tailwindcss`

---

## 3. Key Folder & File Structure

```
game_website/
├── backend/
│   ├── main.py                 # FastAPI app, WS endpoints, CORS, startup
│   ├── config.py               # Pydantic Settings (.env, CORS, DB URL, secrets)
│   ├── database.py             # Engine (NullPool for SQLite), SessionLocal, init_db()
│   ├── models.py               # SQLAlchemy models: User, Game, GameSession, Transaction
│   ├── auth.py                 # JWT encode/decode, get_current_user[_optional], password hash
│   ├── routers/
│   │   ├── auth.py             # POST /register, /login, GET /me
│   │   ├── wallet.py           # GET /balance, /transactions, /summary, POST /daily-bonus
│   │   ├── games.py            # CRUD + action + rematch for games
│   │   └── lobby.py            # GET /games (waiting games list)
│   ├── services/
│   │   ├── game_manager.py     # Orchestrates lifecycle: create/join/leave/start/action/rematch
│   │   └── wallet.py           # Point transactions, daily bonus, SQL stats aggregates
│   ├── games/
│   │   ├── __init__.py         # Registry & metadata (Blackjack, Poker)
│   │   ├── base.py             # BaseGame, GameAction, GameState, GamePhase
│   │   ├── blackjack.py        # Full Blackjack logic (3:2 BJ, 2× win, push, double, soft-17)
│   │   └── poker.py            # Texas Hold'em skeleton (not playable yet)
│   └── websocket/
│       └── manager.py          # ConnectionManager (per-game & lobby rooms, broadcast)
├── frontend/
│   ├── src/
│   │   ├── main.tsx            # QueryClientProvider, router, app root
│   │   ├── App.tsx             # Routes: /login, /register, /lobby, /game/:id, /game/:id/waiting, /wallet
│   │   ├── api/client.ts       # Axios instance + interceptors (auth, 401 handling)
│   │   ├── hooks/
│   │   │   └── useGameSocket.ts # WS + 3s polling fallback, reconnect guard (code 1000)
│   │   ├── stores/
│   │   │   └── authStore.ts    # Zustand: user, token, points, setAuth/logout
│   │   ├── types/index.ts      # All TS interfaces (User, Game, GameState, WalletSummary, etc.)
│   │   ├── pages/
│   │   │   ├── Lobby.tsx       # GameList (create/join)
│   │   │   ├── WaitingRoom.tsx # Player list, host Start, Leave, auto-redirect
│   │   │   ├── Game.tsx        # Dispatches to BlackjackTable / PokerTable
│   │   │   └── Wallet.tsx      # BalanceDisplay + TransactionHistory
│   │   └── components/
│   │       ├── games/blackjack/BlackjackTable.tsx  # Main game UI
│   │       ├── games/poker/PokerTable.tsx          # Placeholder
│   │       ├── lobby/GameList.tsx
│   │       ├── wallet/BalanceDisplay.tsx
│   │       ├── wallet/TransactionHistory.tsx
│   │       └── common/ (Button, Card, Input, Modal, Layout)
│   └── package.json, vite.config.ts, tailwind.config.js
├── progress.md                 # Real-time checklist (source of truth for status)
├── docker-compose.yml          # (Optional) container setup
└── game_platform.db            # SQLite file (git-ignored in prod)
```

---

## 4. Coding Conventions & Guidelines

### Language
- **Code, comments, variables, types**: English only
- **AI responses / commit messages**: English (caveman/terse style preferred)

### Backend (Python)
- **Imports**: Absolute from `backend/` root (`from services.game_manager import GameManager`)
- **Async**: All I/O endpoints `async def`; services use `async` where they call DB/Wallet
- **DB session**: `db: Session = Depends(get_db)` per request; **WebSocket endpoints create/close own `SessionLocal`**
- **Transactions**: Single `commit` at end of logical unit; `commit=False` on intermediate wallet ops
- **Error handling**: Raise `ValueError` in services → caught in routers → `HTTPException(400/403/409)`
- **Locking**: `with_for_update()` on rows for race safety (rematch, join)
- **No schema changes without ask**; use JSON `state.metadata` for extensible fields (`next_game_id`)

### Frontend (TypeScript/React)
- **Components**: Functional + hooks; PascalCase files (`BlackjackTable.tsx`)
- **State**: React Query for server state; Zustand for auth only
- **API calls**: One call per action; `try/catch/finally` with loading/error states
- **Navigation**: `useNavigate` + programmatic redirects after mutations
- **Real-time**: `useGameSocket(gameId)` hook → invalidates `['game', id]` query on `state_changed`
- **Wallet refetch**: CustomEvent `wallet:refetch` dispatched on game finish / daily bonus
- **Styling**: Tailwind utility classes; dark mode via `dark:` prefix

### General
- **Server is single source of truth** (balance, game state, payouts)
- **Idempotency**: Critical for double-click / concurrent actions (rematch, join)
- **No dead code**: Delete over comment-out
- **Tests**: Inline script (`backend/test_rematch.py`) for critical flows; run with `venv\Scripts\python.exe test_rematch.py`

---

## 5. Database & API Architecture

### Main Models (`backend/models.py`)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Accounts & wallet | `id`, `username`, `email`, `hashed_password`, `points`, `total_games`, `total_wins`, `last_daily_bonus` |
| `games` | Game instances | `id`, `game_type`, `status` (waiting/in_progress/finished/cancelled), `buy_in`, `pot`, `player1_id` (host), `player2_id`, `winner_id`, `state` (JSON), timestamps |
| `game_sessions` | Player participation | `game_id`, `user_id`, `position`, `buy_in`, `payout`, `result` (win/loss/push/bust/blackjack), `left_at` |
| `transactions` | Point ledger | `user_id`, `type` (deposit/withdrawal/game_buyin/game_win/game_loss/daily_bonus/refund), `amount` (+credit/-debit), `balance_after`, `reference_id` (game_id), `description` |

### Major API Endpoints (`backend/routers/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | ❌ | Create account |
| POST | `/api/auth/login` | ❌ | Returns `{access_token, user}` |
| GET | `/api/auth/me` | ✅ | Current user profile |
| GET | `/api/wallet/balance` | ✅ | `{points}` |
| GET | `/api/wallet/summary` | ✅ | SQL-aggregated stats (games_played, wins, losses, pushes, win_rate, total_won, total_lost, net, biggest_win) |
| GET | `/api/wallet/transactions` | ✅ | Paginated ledger |
| POST | `/api/wallet/daily-bonus` | ✅ | Claim 100 pts/day |
| GET | `/api/games/types` | ❌ | List registered games |
| POST | `/api/games/create` | ✅ | Create game (host), deduct buy-in |
| POST | `/api/games/join` | ✅ | Join waiting game, deduct buy-in |
| POST | `/api/games/leave` | ✅ | Leave waiting game, refund |
| POST | `/api/games/start` | ✅ | Host starts game (min players) |
| POST | `/api/games/action` | ✅ | Player action (hit/stand/double) |
| POST | `/api/games/rematch` | ✅ | **NEW** Idempotent rematch (see below) |
| GET | `/api/games/{id}` | Optional | Full game state (dealer hole hidden) |
| GET | `/api/games/my/history` | ✅ | Player's past games |
| GET | `/api/lobby/games` | ❌ | Waiting games for lobby list |

**WebSocket**:
- `ws://host/ws/game/{game_id}?token=` → pushes `{"type":"state_changed"}` → client refetches GET `/api/games/{id}`
- `ws://host/ws/lobby?token=` → pushes `{"type":"lobby_changed","game_id":...}`

---

## 6. Current Status & Roadmap Pointer

**Real-time status lives in `progress.md`** — update it after every completed task.

### ✅ Completed (Task 1 + Task 2)
- **Wallet stats**: SQL aggregates from finished `GameSession`; excludes non-game TX; refetches on game finish
- **Double-down bug fix**: `session.buy_in = bet` (was `bet * 2`)
- **Rematch ("Play Again")**:
  - `POST /api/games/rematch {game_id}` — idempotent, race-safe (`with_for_update`)
  - Stores `next_game_id` in finished game's `state.metadata` (no migration)
  - Only original players; balance check; joins existing WAITING rematch or creates new
  - Returns 409 if next game started/full/cancelled
  - Frontend button: "Play Again (X pts)" / "Join Rematch", disabled with reason when balance < buy-in
- **SQLite connection pool fix**: `NullPool` + WS endpoints manage own DB sessions

### 🟡 Pending / Known Issues
- Join concurrency safety (SQLite `with_for_update` not fully supported) — documented in `progress.md`
- Poker game not playable (skeleton only)
- Discrepancy report for old data (8 games with TX vs GameSession net mismatch) — awaiting decision: leave / backfill / reset

### 🔜 Next Steps (when requested)
1. Decide on old-data discrepancy resolution
2. Implement Poker game logic
3. Add automated test suite (pytest + frontend e2e)
4. Docker / production deployment config

---

## Quick Commands

```bash
# Backend
cd backend
venv\Scripts\python.exe -m uvicorn main:app --reload   # Dev server
venv\Scripts\python.exe test_rematch.py                # Run rematch tests

# Frontend
cd frontend
npm run dev                                            # Vite dev server (port 5173)
npm run build                                          # Type-check + production build
```

---

**Last updated**: 2026-10-19 (auto-sync with `progress.md` after major changes)