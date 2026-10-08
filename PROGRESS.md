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

## Next Steps
- [DONE] Fix bug #1: Double button
- [DONE] Fix bug #2: Centering  
- [DONE] Fix bug #3: Finished state verification
- [DONE] Fix blackjack win payout calculation (was paying net profit instead of full payout)
- [TODO] Test backend startup (uvicorn in venv)
- [DONE] Verify useGameSocket hook
