# Game Platform Progress Checklist

## Backend
- [DONE] Broadcasts of state_changed after create/join/leave/start/action in game_manager.py (+ lobby update)
  - File: backend/services/game_manager.py lines 132, 187, 319, 358
- [DONE] One serializer shared by REST and WS; dealer hole card not in JSON while hidden
  - File: backend/routers/games.py, backend/games/blackjack.py
- [PARTIAL] Response shape: id, game_type, status, buy_in, pot, host_id, min_players, max_players, players[], current_turn_user_id, my_valid_actions
  - Missing: host_id, min_players, max_players fields in response
- [TODO] Join concurrency safety (SQLite doesn't support with_for_update)
- [DONE] Valid actions logic for double (chips >= bet check at blackjack.py:76)
- [DONE] Reconnect & Presence (Heartbeat, Presence, Abandoned rounds, Idle waiting rooms)
  - Heartbeat: client ping 20s, server pong, close after 60s no activity
  - Presence: manager tracks connected players per game, broadcasts state_changed on connect/disconnect
  - Game response includes per-player connected: bool (from manager)
  - Disconnect does NOT pause game - timer runs, auto-stand on timeout, money/seat untouched
  - Abandoned rounds: all players disconnected > ABANDON_SECONDS (120s default) -> auto-stand all, play dealer, settle once
  - Idle waiting rooms: no connected players for WAITING_IDLE_MINUTES (15 min default) -> cancel with refund in ONE transaction
  - GET /api/games/active/me returns in_progress or waiting game for current user
  - GET /api/games/{id} for finished game works for its players with result/payout

## Frontend Types & API
- [PARTIAL] src/types/game.ts - basic types exist in types/index.ts but not complete
- [DONE] gamesApi (create, join, leave, start, get, action, active)
- [DONE] useGameSocket hook - ping 20s, immediate refetch on open, refetch on online/visibilitychange, exponential backoff with jitter (cap 10s), polling fallback, stop on unmount/logout, no reconnect on 1000/4001/4003/4004

## Frontend Pages
- [DONE] Lobby with Join/Open buttons and navigation
- [DONE] Waiting room /game/:id/waiting (player list, host-only Start, Leave, auto-redirect)
- [DONE] Game table renders correctly (BlackjackTable.tsx)
- [DONE] Removed dev preview route (/dev/blackjack-preview not found)
- [DONE] Reconnection banner: "Reconnecting..." while socket down, "Back online" after
- [DONE] Disconnected badge on other players' panels when connected=false
- [DONE] Action buttons disabled while disconnected
- [DONE] Resume: on login/app load GET /api/games/active/me -> redirect to /game/{id} (in_progress) or /game/{id}/waiting (waiting) or show "Return to game" banner
- [DONE] Page refresh mid-round rebuilds from server including timer
- [DONE] Finished round while away shows finished panel with result/payout, balance refreshes

## Known Bugs to Fix
1. [DONE] Double button missing - removed chip check from get_valid_actions() since game chips don't reflect user balance
2. [DONE] Table container centered with max-w-5xl mx-auto
3. [DONE] Finished state: result badges with payout, balance refresh, Back to Lobby button - verified at BlackjackTable.tsx:222-263

## Additional Issues Fixed
- [DONE] Game state chips don't reflect actual user balance - added wallet check in apply_action for double down
- [DONE] Double down now charges additional bet from user's actual points
- [DONE] WebSocket reconnection loop - accept() before close(), check close code 1000
- [DONE] Blackjack per-player settlement against house (win pays 2x bet, blackjack pays 3:2, push refunds bet, bust/loss 0)
- [DONE] Double down atomic transaction debit with description 'Game Double' and doubled payout
- [DONE] Atomic single DB transaction for game finish & settlement with double-settle guard
- [DONE] Frontend result badges read server-side payout & result properties
- [DONE] Cryptographic SystemRandom RNG and deck reshuffle in from_json (fixes deterministic card draw bug)
- [DONE] Safe deck draw with reshuffle if exhausted
- [DONE] Dealer natural check in start_game for instant resolution & settlement
- [DONE] Added UI rules indicator in Blackjack table ("Dealer hits soft 17 • Blackjack pays 3:2")
- [DONE] Fixed auth redirect loop between /lobby and /login (verified auth state on load, single logout on 401, preserved /auth/login error handling, unauthenticated polling guards)
- [DONE] Configured stable SECRET_KEY loading from .env with explicit 401 error reasons (Token expired, Invalid token, User not found)
- [DONE] Fixed Wallet Stats: SQL aggregates based on finished game sessions (games_played, wins, losses, pushes, win_rate, total_won, total_lost, net, biggest_win), excluded non-game transactions and left games
- [DONE] Fixed double down buy_in recording bug (was 4x bet, now 2x) in game_manager.py:197
- [DONE] Wallet page refetches stats after game finishes via CustomEvent
- [DONE] Added "Play Again" (rematch) feature for Blackjack:
  - POST /api/games/rematch {game_id} - idempotent, race-safe with row lock
  - Stores next_game_id in finished game's state metadata (no schema change)
  - Only players from original game can rematch; checks balance >= buy_in
  - If next_game_id exists and game is WAITING with room, joins it; else creates new
  - Concurrent calls return same game; double-click safe
  - Returns 409 if next game already started/full/cancelled
  - Frontend: "Play Again (X pts)" button in finished state, shows "Join Rematch" if next_game_id exists, disabled with reason when balance < buy_in
  - Solo play works (min_players=1); wallet stats refetch after rematch round
- [DONE] Fixed SQLite connection pool exhaustion (QueuePool timeout) by:
  - Using NullPool in database.py (no pooling, new connection per request)
  - WebSocket endpoints now create/close their own DB sessions instead of using Depends(get_db) which held connections for connection lifetime

## Discrepancy Report (Old Data)
- liavin (id=3): 6/14 finished games have TX vs GameSession net mismatch
  - Game 21: double down buy_in bug (fixed going forward)
  - Games 27,29,31,32,33: old 1x payout bug + missing buy-in ref_id in TX
- rafa (id=4): 2/4 finished games mismatch (Games 33,34) - missing buy-in ref_id in TX
- GameSession data is correct per requirements (corrected payouts). Transactions are incomplete (missing buy-in ref_ids, old 1x payout).
- Awaiting decision: leave / backfill / reset stats for mismatched games

## Next Steps
- [DONE] Fix bug #1: Double button
- [DONE] Fix bug #2: Centering  
- [DONE] Fix bug #3: Finished state verification
- [DONE] Fix blackjack win payout calculation (was paying net profit instead of full payout)
- [DONE] Fix auth 401 redirect loop
- [DONE] Task 1: Fix wallet stats (double down bug fixed, refetch on game finish, discrepancies reported)
- [DONE] Task 2: Add "Play again" (rematch) to blackjack
- [DONE] Task 3: Add turn timer to blackjack
  - [DONE] Backend: turn_deadline column on games table (nullable DATETIME, indexed)
  - [DONE] Backend: TURN_SECONDS=30, TURN_TIMEOUT_MAX_STRIKES=2 config
  - [DONE] Backend: On game start/turn change: set turn_deadline = now + TURN_SECONDS, turn_seq++
  - [DONE] Backend: Timeout = automatic STAND (same code path), mark auto_stood=true
  - [DONE] Backend: Strikes: 2 timeouts in a row -> status "away" (auto-stands instantly)
  - [DONE] Backend: Background sweeper task (every 1s) + lazy check in GET /api/games/{id} and POST /api/games/action
  - [DONE] Backend: Race safety with turn_seq, single DB transaction with row lock
  - [DONE] Backend: Game response adds turn_deadline, turn_seq, server_time, turn_seconds, per-player auto_stood/away
  - [DONE] Frontend: Countdown progress bar + seconds, red at 5s, clockOffset from server_time
  - [DONE] Frontend: One setInterval at 250ms with cleanup
  - [DONE] Frontend: Never decide at 0 on client, wait for server push, refetch after 2s if nothing
  - [DONE] Frontend: "Auto-stand (timed out)" badge, "Away" badge
  - [DONE] Frontend: Buttons disabled at 0 and during request, send turn_seq, 409 -> silent refetch + toast
  - [DONE] Frontend: Reserve space for countdown (layout stability)
- [DONE] Test backend startup (uvicorn in venv)
- [DONE] Verify useGameSocket hook
- [DONE] Task 4: Add Reconnect & Presence
  - [DONE] Backend: Heartbeat ping/pong, 60s timeout, presence tracking
  - [DONE] Backend: Abandoned round sweeper (ABANDON_SECONDS=120)
  - [DONE] Backend: Idle waiting room cancellation with refund (WAITING_IDLE_MINUTES=15)
  - [DONE] Backend: GET /api/games/active/me endpoint
  - [DONE] Frontend: Ping every 20s, refetch on open/online/visible, backoff+jitter (cap 10s), polling fallback
  - [DONE] Frontend: Connection banner, disconnected badges, disabled buttons
  - [DONE] Frontend: Resume on login/load with active game redirect/banner
  - [DONE] Frontend: tsc --noEmit and build pass

## Poker Group A - Step 1: Deck & RNG (DONE)
- [DONE] Use SystemRandom for cryptographic RNG
- [DONE] Shuffle once at hand start, keep deck server-side only
- [DONE] Never serialize deck or burn cards to client (removed deck_count from to_json)
- [DONE] from_json rebuilds deck and reshuffles (not sorted order)

## Poker Group A - Step 2: Visibility (DONE)
- [DONE] One serializer (GET) shared by REST and WS
- [DONE] Override get_state_for_player in PokerGame
- [DONE] During play: hide all opponent hole cards
- [DONE] At showdown: reveal only active players' cards
- [DONE] Folded players' cards stay hidden forever
- [DONE] Uncontested pot (single active): no cards revealed

## Poker Group A - Step 3: Player Count (DONE)
- [DONE] max_players 6 → 10 in GAME_METADATA (games/__init__.py)
- [DONE] Verified not stored in DB rows or seed data
- [DONE] Seat assignment uses position 0-9 (GameSession.position)
- [DONE] Blackjack unchanged (max_players=4)
