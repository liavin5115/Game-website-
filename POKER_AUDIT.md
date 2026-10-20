# Poker Backend Audit — Texas Hold'em (2–10 players)

## Project Summary (5 lines)
Real-time multiplayer game platform with wallet/points economy. Blackjack fully implemented (turn timer, rematch, reconnect, presence). Texas Hold'em Poker registered but skeleton only — not playable. Server is single source of truth; REST + WS share serializer via GET /games/{id}. SQLite + SQLAlchemy, absolute imports, NullPool.

---

## Audit Items

| # | Item | Status | File:Line | Note |
|---|------|--------|-----------|------|
| 1 | Hand evaluation (all categories, wheel straight, best 5 of 7, kickers, ties) | PARTIAL | poker.py:17-110 | 9 ranks OK; wheel straight handled (A=1 appended); evaluates all 7 cards NOT best 5; kicker logic incomplete for some ranks; returns single winner — no split/tie detection |
| 2 | Dealer button, SB/BB, rotation, heads-up rule, blind sizes | BUG | poker.py:133-157 | No button tracking; blinds always players 0 & 1; no rotation; no heads-up rule (button=SB, acts first preflop); blind sizes hardcoded SB=buy_in/20, BB=buy_in/10 (min 5/10); no config |
| 3 | Betting rounds (preflop/flop/turn/river/showdown), first-to-act per street, round ends when bets equal | PARTIAL | poker.py:148-219 | Phases exist but no street tracking; first-to-act always next after BB (not after button); _betting_round_complete checks all active match current_bet ✓; no burn cards |
| 4 | Actions (fold/check/call/bet/raise/all-in), validation, valid-actions list | PARTIAL | poker.py:168-221 | fold/check/call/bet/raise exist; validation: no check facing bet ✓; min_raise = amount//2 (not enforced as min raise size); short raise as all-in NOT handled; no bet above stack (min used); no turn_seq guard for poker; get_valid_actions returns list ✓ |
| 5 | All-in & side pots (up to 9), folded chips stay, odd-chip rule | MISSING | poker.py:286-294 | No side pot logic; get_payouts gives whole pot to single winner; no split pots; no odd-chip rule; folded chips accumulate in pot ✓ |
| 6 | Showdown (only active players, uncontested fold, split pots) | PARTIAL | poker.py:267-284 | Only active evaluated ✓; uncontested pot not handled (get_winner only if finished); no split pots; folded cards never revealed |
| 7 | Game structure: one hand vs table; buy-in:chips 1:1? leftover chips refund? | PARTIAL | models.py:56-80, game_manager.py:329-420 | Game = ONE hand (single state/pot/winner); buy-in = chips 1:1; leftover chips NOT refunded (payouts only to winner); game_sessions track position/buy_in/payout; max_players in GAME_METADATA constant not DB; seat = position 0-9 unique |
| 8 | Player count min 2 max 10 (currently 6) — every max_players/6 location | MISSING | games/__init__.py:15, games/poker.py, game_manager.py:177,630, routers/games.py:53,77,266,311, routers/lobby.py:23,61, frontend/WaitingRoom.tsx:144, frontend/src/pages/Game.tsx:5, frontend/src/components/games/poker/PokerTable.tsx | Backend: GAME_METADATA["poker"].max_players=6 (line 15); game_manager uses metadata["max_players"]; router responses use metadata.get("max_players",2); Frontend: WaitingRoom shows game.max_players; Game.tsx imports PokerTable; PokerTable is placeholder. No hardcoded 6 in poker logic. |
| 9 | Deck: from_json rebuilds sorted without shuffle? community cards predictable? RNG? | BUG | poker.py:13-14,135,308 | from_json (line 308) calls create_deck() → sorted deck, filters known, NO SHUFFLE (blackjack uses SystemRandom.shuffle line 305); community cards in state sent to client via REST/WS before reveal; uses `random` module not SystemRandom |
| 10 | Visibility: each player sees only own hole cards; opponents hidden until showdown; undealt deck/burn cards in REST/WS? | PARTIAL | base.py:112-119, poker.py:296-300, routers/games.py:240-257,270 | BaseGame.get_state_for_player hides opponent cards as ["??","??"]; BUT poker.to_json() serializes ALL hole cards; game_to_response calls get_state_for_player for requesting user ✓; WS broadcasts state_changed → client refetches GET which hides cards; deck_count exposed in to_json (line 299) |
| 11 | REST and WS use same serializer? | DONE | routers/games.py:184-281, websocket/manager.py | Both use game_to_response → get_state_for_player; WS pushes state_changed → client refetches GET |
| 12 | Buy-in debit, pot, payouts, refunds: one transaction? balance_after? finished status same tx? double-settle guard? points conserved? | PARTIAL | game_manager.py:130-138,185-192,329-420, wallet.py:40-68 | Buy-in debited commit=False on join; payouts added commit=False; single commit in _finish_game ✓; balance_after per tx ✓; finished status set same tx ✓; double-settle guard line 330 ✓; points NOT conserved for poker (no side pots, single winner takes all) |
| 13 | Leave/disconnect mid-hand rules | PARTIAL | game_manager.py:456-512,52-95, context.md:16-18 | leave_game only allows WAITING status; mid-hand leave NOT handled; disconnect: timer runs, auto-stand on timeout, money/seat untouched; abandoned round >120s all-disconnected → auto-stand all, settle once |
| 14 | Blackjack turn timer (turn_deadline, turn_seq, sweeper, 409) hooked into poker? configurable per game type? | PARTIAL | game_manager.py:25-50,51-95,240-271, config.py | Timer code exists but checks player.status=="playing" (blackjack); poker uses "active"; _set_turn_deadline called in start_game/apply_action; sweeper runs 1s; TURN_SECONDS=30 global not per game type; no poker config |
| 15 | state_changed broadcast after start/action/hand end/timeout? connected flag? GET /active includes poker? | PARTIAL | game_manager.py:160,218,511,570, router/games.py:151-163,229 | Broadcasts after create/join/leave/start/action ✓; connected flag in response (line 229) ✓; GET /api/games/active/me includes poker ✓; but turn timer not working for poker |
| 16 | Rematch & wallet stats work for poker? | DONE | game_manager.py:575-661, wallet.py:101-138 | Rematch generic (uses next_game_id in metadata) ✓; wallet stats SQL aggregates from GameSession (finished only) ✓ |
| 17 | Relative imports left? rule violations → 500 instead of 400/409? | DONE | grep: no relative imports; routers/games.py:136 | All imports absolute; ValueError → 400/403/409 in router; "Turn expired"/"Not your turn" → 409 ✓ |
| 18 | 10-player rules: blinds/button skip empty/busted seats; first-to-act 10 seats; deck never runs out (28 cards) | MISSING | poker.py, game_manager.py | No button logic; no skip empty/busted; first-to-act not implemented for 10 seats; deck 52 > 28 needed (10×2 hole + 5 board + 3 burn) ✓ |
| 19 | Concurrency: join 10 players under row lock; broadcast count per action; sweeper multiple timeouts | PARTIAL | game_manager.py:164-224,241,581,51-95 | apply_action & rematch use with_for_update ✓; join_game NO lock on game row (race on max_players check); broadcast per action to all connected; sweeper processes all games sequentially 1s |

---

## Prioritized BUGs and MISSING Items

### Critical (Block playable poker)
1. **BUG #9**: `from_json` rebuilds deck in sorted order without shuffle — predictable draws after restore
2. **BUG #2**: No dealer button, no blind rotation, no heads-up rule — blinds always players 0/1
3. **MISSING #5**: No side pots / all-in logic — single winner takes all, no split pots
4. **BUG #1**: Hand evaluation doesn't select best 5 of 7; no tie/split detection
5. **MISSING #18**: 10-player rules absent (button skip, first-to-act, blind movement)
6. **MISSING #8**: max_players=6 in metadata — must be 10 (backend + frontend locations listed)

### High
7. **BUG #10**: `to_json` exposes all hole cards; only GET hides via get_state_for_player
8. **PARTIAL #3**: Betting rounds lack street tracking, burn cards, correct first-to-act per street
9. **PARTIAL #4**: Min-raise not enforced; short all-in raise not handled; no turn_seq for poker
10. **PARTIAL #12**: Points not conserved (no side pots); leftover chips not refunded
11. **PARTIAL #13**: Mid-hand leave not handled; disconnect auto-stand only
12. **PARTIAL #14**: Turn timer not hooked for poker (status "active" vs "playing"); not configurable per game

### Medium
13. **PARTIAL #6**: Showdown doesn't handle uncontested fold or split pots
14. **PARTIAL #15**: Timer not working for poker affects timeout handling
15. **PARTIAL #19**: join_game lacks row lock on game (race on max_players)

---

## Questions You Must Answer (at least Item 7)

1. **Game structure (Item 7)**: Is a "game" ONE hand, or a table playing MANY hands until players leave? Current code: one hand per Game row.
2. **Buy-in → chips**: Confirmed 1:1? (Current: players get chips = buy_in)
3. **Leftover chips**: When hand ends, are remaining chips paid back to wallet? (Current: only winner gets payout; others get 0 — chips lost)
4. **Side pots / all-in**: Required for MVP? (Adds significant complexity)
5. **Blind sizes**: Configurable per table? Fixed ratio to buy_in? (Current: SB=buy_in/20, BB=buy_in/10)
6. **Turn timer for poker**: Enable? Same 30s? Different? Per-table configurable?
7. **Max players**: Change to 10 now? (Requires metadata update + frontend seat rendering)
8. **Rake / house fee**: Any? (Current: 0%)
9. **Mid-hand join / rebuy**: Allowed? (Current: only WAITING)
10. **Disconnect mid-hand**: Fold immediately? Auto-check/fold? Current: auto-stand on timeout only.

---

## Commit Note
File written to project root. No code changed. Awaiting decisions on questions above.