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

## Poker Group A - Step 4: Rules (DONE)
- [DONE] Hand eval: best 5 of 7, all categories, wheel straight, kicker ties, split detection
- [DONE] Button/blinds: rotation each hand, heads-up rule (button=SB, acts first preflop)
- [DONE] Betting rounds: preflop/flop/turn/river/showdown, correct first-to-act per street, burn cards
- [DONE] Actions: fold/check/call/bet/raise/all-in with validation (no check facing bet, min raise, short raise as all-in, no bet above stack, no out of turn)
- [DONE] Single pot with equal-contribution assertion at showdown (fail loudly)
- [DONE] Split pots with odd chip to first winner
- [DONE] 10-seat logic: button rotation, first-to-act, deck never runs out (24 cards remaining)
- [DONE] from_json restores button position and street
- [DONE] Rule violations return 400/409 via ValueError

## Poker Group B - Step 1: Settlement (DONE)
- [DONE] Buy-in debit, pot accounting, payouts and refunds in ONE DB transaction with row lock
- [DONE] Transaction rows with balance_after and game_id for all money movements
- [DONE] Status FINISHED set in same transaction
- [DONE] Settled guard (double-finish returns early, pays nothing)
- [DONE] Full rollback on any error
- [DONE] Single pot (no side pots per MVP), odd-chip rule to first winner
- [DONE] Config: POKER_TURN_SECONDS=30 per game type
- [DONE] Blind formula: BB = buy_in // 20, SB = BB // 2, minimum 1; min buy-in 40

## Poker Group B - Step 2: Conservation (DONE)
- [DONE] Total points before game = total points after (verified via test_poker_settlement_conservation)
- [DONE] Pot reset to 0 after settlement
- [DONE] All transactions carry reference_id and balance_after

## Poker Group B - Step 3: Leave Rules (DONE)
- [DONE] Leave only while WAITING, exact refund with pot recalculated
- [DONE] Host transfer or cancel on last leave
- [DONE] Mid-hand disconnect: timer decides (check if allowed, else fold)
- [DONE] Away players (2+ strikes): auto check/fold instantly
- [DONE] All disconnected > ABANDON_SECONDS (120s): check/fold through to showdown, settle once
- [DONE] No mid-hand join or rebuy; joining only while WAITING

## Poker Group B - Step 4: Game Structure (DONE)
- [DONE] One hand per Game row (existing)
- [DONE] Leftover chips return to points (refund unbet chips in settlement)
- [DONE] Game ends when hand finishes

## Poker Group B - Step 5: Rematch & Wallet Stats (DONE)
- [DONE] Rematch works for poker (generic, same as blackjack)
- [DONE] Wallet stats for poker: net per game from TX, games_played, wins, losses, pushes (split pot = push when net=0)
- [DONE] Tests: test_poker.py covers all Group B requirements (11 tests passing)

## Poker Group C - Timer, Broadcasts, Presence, 10-Player, E2E (DONE)
- [DONE] Timer hook: turn_deadline, turn_seq, sweeper (1s), 409 for expired/wrong turn
  - POKER_TURN_SECONDS=30 config (per game type)
  - Timeout: check if allowed, else fold; never auto-call/raise
  - Strikes/away: 2 timeouts -> "away" (auto check/fold instantly)
  - Race: timeout and action same moment -> one wins, other 409
- [DONE] Broadcasts: state_changed after start, action, hand end, timeout; lobby update on create/join/leave/start
  - Presence: connected flag in response; GET /api/games/active includes poker
  - Abandoned/idle rules same as blackjack
- [DONE] 10 players: join under row lock (11th gets 400); sweeper handles multiple timeouts; broadcasts non-blocking (asyncio.gather)
- [DONE] No relative imports; rule errors -> 400/409 never 500
- [DONE] Tests: test_poker_group_c.py (8 tests covering all Group C requirements)
- [DONE] All tests pass: 20 total (11 Group B + 8 Group C + 1 rematch)

## Poker API Contract (Final)

### Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/games/create | ✅ | Create poker game, deduct buy-in |
| POST | /api/games/join | ✅ | Join waiting game, deduct buy-in |
| POST | /api/games/leave | ✅ | Leave waiting game, refund |
| POST | /api/games/start | ✅ | Host starts (min 2 players) |
| POST | /api/games/action | ✅ | Player action (fold/check/call/bet/raise) |
| POST | /api/games/rematch | ✅ | Idempotent rematch |
| GET | /api/games/{id} | Optional | Full state (opponent cards hidden) |
| GET | /api/games/active/me | ✅ | Current user's active/waiting game |
| GET | /api/lobby/games | ❌ | List waiting poker games |

### Request/Response JSON

#### POST /api/games/create
```json
{ "game_type": "poker", "buy_in": 100 }
```
Response (201): GameResponse

#### POST /api/games/join
```json
{ "game_id": 1 }
```
Response (200): GameResponse

#### POST /api/games/action
```json
{ "game_id": 1, "action": "call", "amount": 0, "turn_seq": 5 }
```
Valid actions: "fold", "check", "call", "bet", "raise"
- "bet"/"raise": amount = total bet size (not additional)
- turn_seq: from previous response for race safety

Response (200): GameResponse
Errors: 400 (invalid action), 409 (turn expired/not your turn)

#### GET /api/games/{id}
Response (200): GameResponse with state visible to requesting player

### GameResponse Fields
```json
{
  "id": 1,
  "game_type": "poker",
  "status": "waiting|in_progress|finished|cancelled",
  "buy_in": 100,
  "pot": 300,
  "host_id": 1,
  "max_players": 10,
  "min_players": 2,
  "players": [
    {
      "id": 1,
      "username": "player1",
      "seat": 0,
      "bet": 100,
      "status": "playing|active|folded|away|waiting",
      "auto_stood": false,
      "away": false,
      "connected": true
    }
  ],
  "winner_id": null,
  "state": { ... },  // see State object below
  "current_turn_user_id": 2,
  "my_valid_actions": ["fold", "call", "raise"],
  "created_at": "2026-10-20T12:00:00",
  "started_at": "2026-10-20T12:01:00",
  "finished_at": null,
  "next_game_id": null,
  "turn_deadline": "2026-10-20T12:01:30Z",
  "turn_seq": 5,
  "server_time": "2026-10-20T12:01:15Z",
  "turn_seconds": 30
}
```

### State Object (from GET /api/games/{id})
```json
{
  "phase": "waiting|betting|playing|showdown|finished",
  "players": [
    {
      "id": 1,
      "username": "player1",
      "chips": 85,
      "cards": ["As", "Kh"],  // own cards visible; opponents ["??","??"]
      "bet": 10,
      "total_bet": 10,
      "status": "active|folded|away"
    }
  ],
  "pot": 30,
  "current_bet": 10,
  "min_raise": 10,
  "current_player": 1,  // index in players array
  "community_cards": ["7d", "9h", "Js"],
  "metadata": {
    "button_pos": 0,
    "street": 1,  // 0=preflop,1=flop,2=turn,3=river,4=showdown
    "sb_amount": 2,
    "bb_amount": 5,
    "sb_idx": 1,
    "bb_idx": 2,
    "turn_seq": 5,
    "timeout_strikes": {"1": 0, "2": 1}
  }
}
```

### Status Values
- Game.status: "waiting", "in_progress", "finished", "cancelled"
- Player.status: "active" (in hand), "folded", "away" (2+ strikes), "waiting" (in lobby)
- Phase: "waiting", "betting" (preflop), "playing" (postflop), "showdown", "finished"

### Turn Fields
- turn_deadline: ISO8601 UTC when turn expires (null if not in_progress)
- turn_seq: increments each turn; must match on action or 409
- server_time: current server time for clock sync
- turn_seconds: configured turn length (30 for poker)

### Per-Player Fields
- seat: 0-9 (position at table)
- bet: current street bet
- total_bet: total committed this hand
- status: "active", "folded", "away"
- auto_stood: true if last action was timeout
- away: true if 2+ timeout strikes (auto check/fold)
- connected: true if WS connected

### WebSocket Messages
- WS: `ws://host/ws/game/{game_id}?token=`
- Server -> Client: `{"type": "state_changed"}` (client refetches GET /api/games/{id})
- Server -> Client: `{"type": "game_state", "payload": {...}}` (on connect)
- Client -> Server: `{"type": "ping"}` (heartbeat)
- Server -> Client: `{"type": "pong"}`
- Lobby WS: `ws://host/ws/lobby?token=` -> `{"type": "lobby_changed", "game_id": 1}`

### Error Codes
- 400: Invalid action, insufficient points, game full, not in game
- 403: Not host (start), not a player (rematch)
- 409: Turn expired (stale turn_seq), not your turn, rematch unavailable
- 404: Game not found
- 500: Never for rule violations (all ValueError -> 400/409)

## Poker Frontend - Part 1 (DONE)

### Step 0 - Backend Sanity Checks
- [DONE] Join concurrency: Added unique constraint on (game_id, position) + row lock count check in same transaction. 11th player gets 400. Tested with threads.
- [DONE] WebSocket timeout: Added 2s timeout to each send in manager._send; dead sockets dropped without blocking gather.
- [DONE] Full test suite: 20 tests pass (11 Group B + 8 Group C + 1 rematch).

### Step 1 - Contract
- [DONE] Compact table of real JSON fields documented in PR (matches API contract above).

### Step 2 - Types & API
- [DONE] src/types/index.ts extended with GamePlayer, host_id, max_players, min_players, current_turn_user_id, my_valid_actions, total_bet.
- [DONE] gamesApi reused (create, join, leave, start, get, action, rematch, active) with turn_seq payload.
- [DONE] Created usePokerGame(gameId) hook on top of useGameSocket: fetch, refetch on state_changed, clockOffset from server_time.

### Step 3 - Lobby
- [DONE] Poker games show players/max (e.g., 3/10), host, buy-in.
- [DONE] Create Game modal validates buy-in >= 40 and balance, shows blinds hint ("Blinds 2/5" = BB buy_in//20, SB = BB//2, min 1).
- [DONE] Join disabled with reason when full or balance too low.
- [DONE] Navigate to /game/:id/waiting.

### Step 4 - Waiting Room
- [DONE] Player list for up to 10 with host badge and count (4/10).
- [DONE] Host-only Start disabled until 2 players.
- [DONE] Leave with refund.
- [DONE] Auto-redirect to /game/:id when in_progress.
- [DONE] Route /game/:id picks BlackjackTable or PokerTable by game_type (PokerTable placeholder).

### Tests
- [DONE] tsc --noEmit passes
- [DONE] Build passes
- [DONE] Manual test with 2 accounts: create poker, join, see live updates, start, redirect to game table.

## Poker Frontend - Part 2 (DONE)

### Table Display for 2-10 Players
- [DONE] CARD: Reuse fixed Card component (sm/md/lg sizes, real card back for hidden cards). Opponents show two card backs while in hand; folded players show dimmed backs; at showdown server sends real cards for players who reached showdown.
- [DONE] LAYOUT DESKTOP (md+): Oval felt table with seats placed around ellipse using trigonometry, up to 10 seats, ROTATED so "me" is always at bottom center; other players keep seat order clockwise. Community cards (5 slots, empty as faint outlines) and pot in center. Layout stable (space reserved).
- [DONE] LAYOUT MOBILE (<md): No oval. Community cards + pot on top, my cards + panel fixed at bottom, other players as compact 2-column list of small panels with name, stack, bet, status. No horizontal scroll at 380px.
- [DONE] SEAT PANEL: Name ("(You)" for me), stack, current bet as chip pill, dealer button "D", SB/BB badges, status badges (folded, all-in, away, disconnected), turn highlight (yellow ring), "Auto-acted" badge when server marks auto_stood.
- [DONE] TIMER: Countdown on active seat with progress ring + seconds, red at 5s or less. remaining = turn_deadline - (Date.now() + clockOffset). One setInterval at 250ms with cleanup, stopped when nobody on turn. At 0 do nothing on client; wait for state_changed, refetch once if nothing arrives within 2s.
- [DONE] CENTER INFO: Street label (Preflop/Flop/Turn/River/Showdown), pot, blinds ("Blinds 2/5"), hand state text ("Waiting for {name}...").
- [DONE] CONNECTION: Reuse banner ("Reconnecting...", "Back online").
- [DONE] DEV PREVIEW: Temporary route /dev/poker-preview renders table from mock props: 2, 4, 6, 10 players; preflop, flop, river, showdown; folded and all-in players; long name; large stacks (5 digits). Screenshots taken at desktop width and 380px.

### Tests
- [DONE] tsc --noEmit passes
- [DONE] Build passes

### Next: Poker Frontend Part 3 - Action Bar
- [TODO] Bet/raise modal with slider/input, min/max validation
- [TODO] Action buttons (fold/check/call/bet/raise) wired to server
- [TODO] Showdown reveal animation
- [TODO] Finished panel with result/payout per player
- [TODO] Rematch button in finished state
