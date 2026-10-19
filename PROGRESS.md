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

## Frontend Types & API
- [PARTIAL] src/types/game.ts - basic types exist in types/index.ts but not complete
- [DONE] gamesApi (create, join, leave, start, get, action)
- [TODO] useGameSocket hook implementation verification

## Frontend Pages
- [DONE] Lobby with Join/Open buttons and navigation
- [DONE] Waiting room /game/:id/waiting (player list, host-only Start, Leave, auto-redirect)
- [DONE] Game table renders correctly (BlackjackTable.tsx)
- [DONE] Removed dev preview route (/dev/blackjack-preview not found)

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
- [TODO] Test backend startup (uvicorn in venv)
- [DONE] Verify useGameSocket hook
