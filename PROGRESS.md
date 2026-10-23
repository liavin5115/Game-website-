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

## Poker Frontend - Part 3 (DONE)

### Action Bar, Results, Rematch, Full Test
- [DONE] ACTION BAR: Fixed at bottom (mobile), desktop bar. Fold, Check/Call {amount}, Bet, Raise buttons. Only shows server-valid actions, disabled with reason. Enabled only on my turn, disabled while request in flight and while disconnected. turn_seq sent with each action. 409 → silent refetch + toast.
- [DONE] BET/RAISE CONTROL: Slider + number input using server min/max, quick buttons (Min, ½ Pot, Pot, All-in), amount clamped, converted with Number(), touch-friendly. Confirm button "Raise to {amount}".
- [DONE] FOLD CONFIRMATION: Fold that would be free check shows confirm step.
- [DONE] SHOWDOWN AND RESULT: Winners highlighted, revealed cards for showdown players, result + payout from server ("+85", "-20", "Split +40"). Uncontested pot shows winner without cards. Balance refreshes.
- [DONE] FINISHED PANEL: "Play Again ({buy_in} pts)" with rematch (disabled with reason when balance too low, "Join Rematch" when next_game_id exists, 409 → message + "Back to lobby") and "Back to Lobby".
- [DONE] RESUME AND RECONNECT: Refresh mid-hand rebuilds table/timer/cards from server; active-game banner/redirect works for poker; finished-while-away shows finished panel.
- [DONE] RULES PANEL: Collapsible "Rules" panel (blinds buy_in//20 and half, no rake, leftover refunded, 30s/turn, timeout = check or fold).
- [DONE] tsc --noEmit passes, build passes, no temporary logs or dev preview route.
# #   P o k e r   F r o n t e n d   -   B u g   F i x :   F u l l - s c r e e n   f e l t   b a c k g r o u n d   ( D O N E ) 
 
 
 
 # # #   R o o t   C a u s e 
 
 -   m e   w a s   a   G a m e P l a y e r   ( f r o m   g a m e . p l a y e r s )   n o t   a   P l a y e r S t a t e   ( f r o m   g a m e . s t a t e . p l a y e r s ) ,   s o   m e . c h i p s   a n d   m e . c a r d s   w e r e   u n d e f i n e d 
 
 -   R o o t   e l e m e n t   h a d   m i n - h - s c r e e n   c o v e r i n g   n a v b a r   a r e a 
 
 -   N o   e r r o r   b o u n d a r y   t o   c a t c h   r e n d e r   c r a s h e s 
 
 -   N o   v i s i b l e   l o a d i n g   s t a t e   w h e n   d a t a   w a s   m i s s i n g 
 
 
 
 # # #   F i x e s 
 
 -   m e   n o w   r e s o l v e d   f r o m   g a m e S t a t e . p l a y e r s   ( P l a y e r S t a t e   w i t h   c h i p s / c a r d s ) 
 
 -   A d d e d   E r r o r B o u n d a r y   a r o u n d   P o k e r T a b l e   i n   G a m e . t s x 
 
 -   R o o t   e l e m e n t   c h a n g e d   t o   m i n - h - [ c a l c ( 1 0 0 v h - 8 r e m ) ]   t o   n o t   c o v e r   n a v b a r 
 
 -   A d d e d   v i s i b l e   l o a d i n g   s p i n n e r   a n d   e r r o r   s t a t e 
 
 -   D e s k t o p   t a b l e   c o n t a i n e r :   a d d e d   m i n - h - [ 4 0 0 p x ]   t o   p r e v e n t   z e r o - h e i g h t   c o l l a p s e 
 
 -   t s c   - - n o E m i t   p a s s e s ,   b u i l d   p a s s e s 
 
 
## Poker Frontend - Bug Fix: Full-screen felt background (DONE)

### Root Cause
- me was a GamePlayer (from game.players) not a PlayerState (from game.state.players), so me.chips and me.cards were undefined
- Root element had min-h-screen covering navbar area
- No error boundary to catch render crashes
- No visible loading state when data was missing

### Fixes
- me now resolved from gameState.players (PlayerState with chips/cards)
- Added ErrorBoundary around PokerTable in Game.tsx
- Root element changed to min-h-[calc(100vh-8rem)] to not cover navbar
- Added visible loading spinner and error state
- Desktop table container: added min-h-[400px] to prevent zero-height collapse
- tsc --noEmit passes, build passes


## Bug Fix: Poker 500 on GET /api/games/{id} (DONE)

### Root Cause
- _check_and_apply_timeout raised ValueError when current player was not active or not on turn
- get_game didn't catch the error -> 500
- Timeout didn't advance turn/deadline properly -> stale deadline -> sweeper logged same error every second
- After timeout, game could finish but deadline wasn't cleared

### Fixes
- _check_and_apply_timeout now never raises (catches all errors, clears deadline)
- Properly advances turn, sets new deadline, finishes game after timeout
- get_game catches errors from _check_and_apply_timeout
- Router returns 400 for ValueError, never 500
- Sweeper logs warning (not error) and rolls back
- Frontend: error state with Retry button, loading spinner
- Frontend: isMyTurn from server current_turn_user_id vs my user id
- All 19 poker tests pass
- Backend process did NOT restart (no 'Shutting down' or 'Started reloader' in logs)


## Bug Fix: Poker turn not advancing (DONE)

### Root Cause
1. last_to_act and last_actor were NOT serialized in to_json/from_json - after round-trip, last_to_act became None, causing _betting_round_complete to always return True, advancing street after every action
2. _set_first_to_act_postflop always used _get_next_active(button) which skips button - wrong for heads-up where button acts first postflop
3. last_to_act was set to button in heads-up postflop - should be non-button (last to act)
4. Frontend myPlayer was always first player in game.players array, not the current user - isMyTurn was wrong for player 2

### Fixes
- Serialized last_to_act, last_actor, last_aggressor in to_json/from_json
- _set_first_to_act_postflop handles heads-up (button acts first)
- last_to_act set to non-button in heads-up postflop
- Frontend myPlayer found by current user id from auth store
- All 19 poker tests pass, repro script shows correct turn alternation

## Bug Fix: Poker Timer, Betting, UTC Timestamps & Seat Layout (DONE)

### Evidence
- Browser trace: the seat displayed 5s remaining while the server deadline was already 3.7s in the past; after a re-render the ring froze at 27s.
- Raw `GET /api/games/{id}` for both players: `turn_deadline` and `server_time` ended in `Z`, but `created_at` / `started_at` were naive (no zone).
- 3-user betting repro: all 30 legal actions returned HTTP 200. Failures came from the client (timer kept buttons enabled past the deadline; `openBetModal` read `GamePlayer.chips` = undefined and `bet` = buy-in instead of `PlayerState`).
- Targeted API cases: wrong user 409, stale `turn_seq` 409, action after deadline 409, below-minimum 400, min/mid/max/all-in 200.

### Root Causes & Fixes

#### 1. Countdown re-anchored backwards on every render
- **Cause**: `clockOffset` was recomputed on every render from a frozen `server_time` with a fresh `Date.now()`. Every tick moved the virtual clock backwards, so `remaining` grew or stalled.
- **Fix**: `usePokerGame` recomputes the offset only when the `server_time` string changes. `remainingSeconds` = `turn_deadline - (Date.now() + offset)`. At 0 the value stays at 0 until `state_changed`; one refetch is issued after 2s if no event arrives. The timer stops when no player is on turn.
- **Clock skew**: `frontend/src/lib/serverTime.ts` parses `Z`, `+00:00`, and naive timestamps as UTC, so a wrong client clock does not change the countdown.

#### 2. Betting used stale/guessed values
- **Cause**: Min/max were guessed in the UI; the modal read the wrong player object; `turn_seq=0` slipped through `if turn_seq`; in-flight state was not reset on 409; older GET responses could overwrite newer state.
- **Fix**:
  - Backend exposes `my_action_limits` (`min_bet_to`, `min_raise_to`, `max_bet_to`) and uses `int | None = None` for `turn_seq` with a strict comparison.
  - UI sends the current `turn_seq`, converts amounts with `Number()`, clamps, and rounds to integers.
  - Older GET responses are ignored by `turn_seq`; the in-flight flag is always reset.
  - 409 triggers a silent refetch plus "Your turn expired"; the bet modal resets between turns.

#### 3. Mixed naive/aware datetimes
- **Cause**: Some serializers emitted naive datetimes, so the browser interpreted them in local time.
- **Fix**: `backend/timeutils.py::to_utc_iso` emits one UTC ISO format with a zone (`Z` / `+00:00`), applied in `games.py`, `lobby.py`, and `wallet.py`. The frontend treats a missing zone as UTC.

#### 4. Seat layout at 6-10 players
- **Cause**: Equal-angle spacing bunches seats on the narrow sides of the ellipse; tall seats (badges + bet pill + status) then overlap. The heads-up seats also had a double offset.
- **Fix**:
  - Equal-arc spacing along the ellipse (not equal angle), so side seats get more vertical room.
  - Compact seats for 6+ players: `xs` cards, tighter gaps, inline bet next to the stack, badge priority so the status row cannot wrap.
  - Crowded tables use `min-h-[540px]` and `w-full max-w-6xl`; heads-up/3-player keep the regular seat size.
  - Heads-up: me at (50%, 80%), opponent at (50%, 20%). Others clockwise on the ellipse edge.
  - Timer and D/SB/BB badges share one fixed top row; no overlap and no off-screen ring.

### Verification

#### API tests (`backend/test_poker_api.py`)
11 passed:
- 3 users create/join/start, action ordering, BB option
- wrong user 409, stale `turn_seq=0` 409, old `turn_seq` 409, action after deadline 409
- min / mid / max / all-in 200, below-minimum 400
- full hand to showdown

#### Frontend unit tests (`frontend/src/lib/serverTime.test.ts`)
8 passed: `Z`, `+00:00`, naive timestamps, and remaining math with a +5 minute client clock offset.

#### Build / types
- `npx tsc --noEmit`: pass
- `npm run build`: pass
- No separate lint script is defined in `frontend/package.json`.

#### Full backend suite
`pytest -q`: **5 failed, 32 passed, 1 error**. All failures/errors are the pre-existing manual live-server scripts:
- `test_fixes.py::{test_websocket_broadcast, test_serializer, test_response_shape, test_money_tracking, test_user_login}`
- `test_websocket_client.py::test_broadcast`

These are not caused by this change and were left untouched.

#### Layout measurements (desktop viewport 800x620)
| Players | Table | Result |
|---|---|---|
| 2 | 712x434 | me (50,80) 153x167, opponent (50,20) 140x148; no overlaps, both inside |
| 3 | 712x434 | me (50,80) 153x167, sides at y=33; no overlaps, all inside |
| 6 | 712x540 | compact 112x113 (129 with status); no overlaps, none outside |
| 10 | 712x540 | compact 112x113 (129 with status); no overlaps, none outside |

Timer rings are 32px in regular seats and 24px in compact seats; both fit the fixed badge row (the ring ends 4px before the name). Bets are inline with the stack on every seat, so no separate pill adds height.

Mobile at 380px (same-origin 380px iframe, `clientWidth` 372): mobile stacked layout active, 2-column Opponents grid, `scrollWidth` 372 = `clientWidth` after the navbar fix (no horizontal scroll).

### Data-loss warning
`backend/test_poker.py`, `backend/test_poker_group_c.py`, and `backend/test_rematch.py` clean up by deleting **all rows from the live `games` table** (there is no test-DB isolation). Do not run the full suite against a database that contains real games; use a disposable/test database. The layout/repro games in this environment were wiped by that cleanup.

### Manual e2e checklist (Playwright is not installed)
1. Three users create/join/start a poker game; the countdown ticks from 30 and resets on each action.
2. Set the client clock 5 minutes off; the countdown still matches the server deadline.
3. At 0 the timer holds; the next `state_changed` advances the turn; with no event, a refetch happens after 2s.
4. Each user acts in turn (fold/check/call/bet/raise); min/max come from the server; below-minimum is rejected; all-in works.
5. Act from a stale tab after the turn changed: verify 409, "Your turn expired", refetch, and no stuck spinner.
6. Try to act out of turn: verify 409 and no state corruption.
7. Refresh mid-hand: same cards, stack, turn, and countdown; no duplicate timers.
8. Desktop 2/3/6/10: no seat/badge/timer overlap; me bottom center; others clockwise.
9. 380px: stacked layout, 2-column Opponents grid, no horizontal scroll.
10. Finish a hand to showdown; verify result modal and rematch still work.
