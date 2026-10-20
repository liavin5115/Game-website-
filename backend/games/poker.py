"""Texas Hold'em Poker implementation"""
import random
import itertools
from typing import Optional
from games.base import BaseGame, GameAction, GameState, GamePhase
from config import get_settings

_rng = random.SystemRandom()

# Card utilities
RANKS = "23456789TJQKA"
SUITS = "cdhs"  # clubs, diamonds, hearts, spades
RANK_VALUE = {r: i for i, r in enumerate(RANKS, 2)}

# Poker constants
MIN_BUY_IN = 40
BLIND_DIVISOR = 20  # BB = buy_in // 20


def create_deck() -> list[str]:
    return [r + s for r in RANKS for s in SUITS]


def shuffle_deck(deck: list[str]) -> None:
    """Shuffle deck in place using cryptographic RNG."""
    _rng.shuffle(deck)


def calculate_blinds(buy_in: int) -> tuple[int, int]:
    """Calculate (SB, BB) from buy_in. BB = buy_in // 20, SB = BB // 2, minimum 1."""
    bb = max(buy_in // BLIND_DIVISOR, 1)
    sb = max(bb // 2, 1)
    return sb, bb


def evaluate_hand(cards: list[str]) -> tuple[int, list[int]]:
    """
    Evaluate best 5-card hand from 5-7 cards, return (hand_rank, tiebreakers).
    Hand ranks: 9=Royal Flush, 8=Straight Flush, 7=Four Kind, 6=Full House,
                5=Flush, 4=Straight, 3=Three Kind, 2=Two Pair, 1=Pair, 0=High Card
    """
    if len(cards) < 5:
        return (0, [])

    best_score = (-1, [])
    # Try all 5-card combinations (best 5 of 7)
    for combo in itertools.combinations(cards, 5):
        score = _evaluate_5cards(list(combo))
        if score > best_score:
            best_score = score
    return best_score


def _evaluate_5cards(cards: list[str]) -> tuple[int, list[int]]:
    """Evaluate exactly 5 cards."""
    ranks = [RANK_VALUE[c[0]] for c in cards]
    suits = [c[1] for c in cards]

    # Count ranks
    rank_counts = {}
    for r in ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1

    # Sort by count desc, then rank desc
    sorted_counts = sorted(rank_counts.items(), key=lambda x: (x[1], x[0]), reverse=True)

    # Check flush
    flush = len(set(suits)) == 1

    # Check straight
    unique_ranks = sorted(set(ranks), reverse=True)
    # Handle Ace-low straight (A,2,3,4,5)
    if 14 in unique_ranks:
        unique_ranks.append(1)

    straight_high = 0
    for i in range(len(unique_ranks) - 4):
        if unique_ranks[i] - unique_ranks[i + 4] == 4:
            straight_high = unique_ranks[i]
            break

    # Straight flush / Royal flush
    if flush and straight_high:
        if straight_high == 14:
            return (9, [])  # Royal flush
        return (8, [straight_high])  # Straight flush

    # Four of a kind
    if sorted_counts[0][1] == 4:
        quad = sorted_counts[0][0]
        kicker = sorted_counts[1][0]
        return (7, [quad, kicker])

    # Full house
    if sorted_counts[0][1] == 3 and sorted_counts[1][1] == 2:
        trips = sorted_counts[0][0]
        pair = sorted_counts[1][0]
        return (6, [trips, pair])

    # Flush
    if flush:
        flush_ranks = sorted(ranks, reverse=True)
        return (5, flush_ranks)

    # Straight
    if straight_high:
        return (4, [straight_high])

    # Three of a kind
    if sorted_counts[0][1] == 3:
        trips = sorted_counts[0][0]
        kickers = sorted([r for r in ranks if r != trips], reverse=True)
        return (3, [trips] + kickers)

    # Two pair
    if sorted_counts[0][1] == 2 and sorted_counts[1][1] == 2:
        high_pair = max(sorted_counts[0][0], sorted_counts[1][0])
        low_pair = min(sorted_counts[0][0], sorted_counts[1][0])
        kicker = sorted_counts[2][0]
        return (2, [high_pair, low_pair, kicker])

    # One pair
    if sorted_counts[0][1] == 2:
        pair = sorted_counts[0][0]
        kickers = sorted([r for r in ranks if r != pair], reverse=True)
        return (1, [pair] + kickers)

    # High card
    return (0, sorted(ranks, reverse=True))


class PokerGame(BaseGame):
    def __init__(self, buy_in: int, players: list[dict]):
        super().__init__(buy_in, players)
        # Button position (index in players list)
        self.button_pos = 0
        # Street tracking: 0=preflop, 1=flop, 2=turn, 3=river, 4=showdown
        self.street = 0
        # Last aggressor for first-to-act determination
        self.last_aggressor = None
        # Last player to act (for betting round completion)
        self.last_to_act = None
        # Last player who acted (for betting round completion)
        self.last_actor = None

    def _init_game(self) -> None:
        self.deck = create_deck()

        sb_amount, bb_amount = calculate_blinds(self.buy_in)
        min_raise = bb_amount  # Min raise = BB

        self.state.players = [
            {"id": p["id"], "username": p["username"], "chips": p["chips"],
             "cards": [], "bet": 0, "total_bet": 0, "status": "active"}
            for p in self.players
        ]
        self.state.phase = GamePhase.WAITING
        self.state.pot = 0
        self.state.current_bet = 0
        self.state.min_raise = min_raise
        self.state.current_player = 0
        self.state.community_cards = []
        # Store button position and street in metadata
        self.state.metadata = {
            "button_pos": 0,
            "street": 0,
            "sb_amount": sb_amount,
            "bb_amount": bb_amount,
        }

    def start_game(self) -> None:
        """Deal cards and begin betting"""
        shuffle_deck(self.deck)

        # Deal 2 cards to each player
        for i, player in enumerate(self.players):
            player["cards"] = [self.deck.pop(), self.deck.pop()]
            player["bet"] = 0
            player["total_bet"] = 0
            player["status"] = "active"

        # Update state
        self.state.players = [
            {"id": p["id"], "username": p["username"], "chips": p["chips"],
             "cards": p["cards"], "bet": 0, "total_bet": 0, "status": "active"}
            for p in self.players
        ]
        self.state.phase = GamePhase.BETTING
        self.street = 0
        self.state.metadata["street"] = 0

        # Post blinds with button rotation
        self._post_blinds()

        # Set first to act preflop: UTG (after BB)
        self._set_first_to_act_preflop()

    def _get_active_indices(self) -> list[int]:
        """Return list of player indices who are active (not folded, not busted)."""
        return [i for i, p in enumerate(self.state.players) if p["status"] == "active" and p["chips"] >= 0]

    def _get_next_active(self, start_idx: int) -> int:
        """Get next active player index after start_idx, wrapping around."""
        n = len(self.state.players)
        for offset in range(1, n + 1):
            idx = (start_idx + offset) % n
            if self.state.players[idx]["status"] == "active":
                return idx
        return start_idx

    def _post_blinds(self) -> None:
        """Post small and big blinds with button rotation."""
        n = len(self.state.players)
        if n < 2:
            return

        active = self._get_active_indices()
        if len(active) < 2:
            return

        sb_amount = self.state.metadata["sb_amount"]
        bb_amount = self.state.metadata["bb_amount"]

        if n == 2:
            # Heads-up: button posts SB, acts first preflop
            btn = self.button_pos % n
            sb_idx = btn
            bb_idx = (btn + 1) % n
        else:
            # 3+: SB is next after button, BB is next after SB
            sb_idx = self._get_next_active(self.button_pos)
            bb_idx = self._get_next_active(sb_idx)

        self._post_blind(sb_idx, sb_amount, is_sb=True)
        self._post_blind(bb_idx, bb_amount, is_sb=False)

        # Store blind positions for first-to-act logic
        self.state.metadata["sb_idx"] = sb_idx
        self.state.metadata["bb_idx"] = bb_idx

        # Track last to act for this street (preflop = BB)
        self.last_to_act = self.state.players[bb_idx]["id"]
        self.last_aggressor = self.state.players[bb_idx]["id"]

    def _post_blind(self, player_idx: int, amount: int, is_sb: bool) -> None:
        player = self.state.players[player_idx]
        actual = min(amount, player["chips"])
        player["bet"] = actual
        player["chips"] -= actual
        player["total_bet"] += actual
        self.state.pot += actual
        self.state.current_bet = max(self.state.current_bet, actual)

    def _set_first_to_act_preflop(self) -> None:
        """Set first to act preflop: UTG (after BB) or button in heads-up."""
        n = len(self.state.players)
        if n == 2:
            # Heads-up: button acts first preflop
            self.state.current_player = self.button_pos % n
        else:
            # UTG: first active after BB
            bb_idx = self.state.metadata.get("bb_idx", 1)
            self.state.current_player = self._get_next_active(bb_idx)

    def _set_first_to_act_postflop(self) -> None:
        """Set first to act postflop: button in heads-up, first active after button otherwise."""
        n = len(self.state.players)
        if n == 2:
            self.state.current_player = self.button_pos % n
        else:
            self.state.current_player = self._get_next_active(self.button_pos)

    def get_valid_actions(self, player_id: int) -> list[str]:
        player = next((p for p in self.state.players if p["id"] == player_id), None)
        if not player or player["status"] != "active":
            return []

        actions = ["fold"]
        facing_bet = player["bet"] < self.state.current_bet

        if facing_bet:
            actions.append("call")
            # All-in raise (short raise) allowed when calling would put all-in
            if player["chips"] > 0:
                actions.append("raise")  # includes all-in raise
        else:
            actions.append("check")
            if player["chips"] > 0:
                actions.append("bet")
        return actions

    def apply_action(self, player_id: int, action: GameAction) -> GameState:
        player = next((p for p in self.state.players if p["id"] == player_id), None)
        if not player or player["status"] != "active":
            raise ValueError("Not your turn or not active")

        # Verify it's player's turn
        current_player = self.state.players[self.state.current_player]
        if current_player["id"] != player_id:
            raise ValueError("Not your turn")

        facing_bet = player["bet"] < self.state.current_bet
        min_raise = self.state.min_raise

        if action.type == "fold":
            player["status"] = "folded"

        elif action.type == "check":
            if facing_bet:
                raise ValueError("Cannot check, must call or raise")

        elif action.type == "call":
            call_amount = self.state.current_bet - player["bet"]
            actual = min(call_amount, player["chips"])
            player["bet"] += actual
            player["chips"] -= actual
            player["total_bet"] += actual
            self.state.pot += actual
            # If all-in call, player stays active but can't bet further
            if player["chips"] == 0:
                pass  # Still active, just all-in

        elif action.type in ("bet", "raise"):
            amount = action.amount  # Total bet size for both bet and raise
            previous_bet = self.state.current_bet

            # Validate amount
            if amount > player["chips"] + player["bet"]:
                raise ValueError("Bet exceeds stack")
            if amount <= player["bet"]:
                raise ValueError("Invalid bet/raise amount")

            # Min raise check (unless all-in)
            if action.type == "raise" and player["chips"] > amount - player["bet"]:
                min_total = previous_bet + min_raise
                if amount < min_total:
                    raise ValueError(f"Minimum raise is {min_raise}")

            additional = amount - player["bet"]
            player["bet"] = amount
            player["chips"] -= additional
            player["total_bet"] += additional
            self.state.pot += additional
            self.state.current_bet = amount
            # Min raise for next player: size of this raise
            if action.type == "raise":
                raise_size = amount - previous_bet
                self.state.min_raise = max(min_raise, raise_size)
            self.last_aggressor = player_id

        else:
            raise ValueError(f"Invalid action: {action.type}")

        # Track who just acted
        self.last_actor = player_id

        # Check if only one active player remains -> uncontested pot
        active = [p for p in self.state.players if p["status"] == "active"]
        if len(active) == 1:
            self.state.phase = GamePhase.FINISHED
            return self.state

        # Move to next player
        self._next_player()

        # Check if betting round complete
        if self._betting_round_complete():
            self._advance_phase()

        return self.state

    def _next_player(self) -> None:
        active = [p for p in self.state.players if p["status"] == "active"]
        if len(active) <= 1:
            return

        current_idx = self.state.current_player
        n = len(self.state.players)
        for _ in range(n):
            current_idx = (current_idx + 1) % n
            if self.state.players[current_idx]["status"] == "active":
                self.state.current_player = current_idx
                break

    def _betting_round_complete(self) -> bool:
        active = [p for p in self.state.players if p["status"] == "active"]
        if len(active) <= 1:
            return True

        # All active players must have matched current_bet
        if not all(p["bet"] == self.state.current_bet for p in active):
            return False

        # Round completes when last_to_act has just acted (and all bets matched)
        if self.last_to_act is None:
            return True

        return self.last_actor == self.last_to_act

    def _advance_phase(self) -> None:
        # Reset bets for next round
        for p in self.state.players:
            p["bet"] = 0
        self.state.current_bet = 0
        self.last_aggressor = None

        if self.state.phase == GamePhase.BETTING:
            # Deal flop (3 cards) - burn 1, deal 3
            self.deck.pop()  # burn
            self.state.community_cards = [self.deck.pop() for _ in range(3)]
            self.state.phase = GamePhase.PLAYING
            self.street = 1
            self.state.metadata["street"] = 1
            self._set_first_to_act_postflop()
            n = len(self.state.players)
            if n == 2:
                self.last_to_act = self.state.players[1 - self.button_pos]["id"]
            else:
                self.last_to_act = self.state.players[self.button_pos]["id"]
        elif self.state.phase == GamePhase.PLAYING:
            if len(self.state.community_cards) == 3:
                # Turn - burn 1, deal 1
                self.deck.pop()  # burn
                self.state.community_cards.append(self.deck.pop())
                self.street = 2
                self.state.metadata["street"] = 2
                self._set_first_to_act_postflop()
                n = len(self.state.players)
                if n == 2:
                    self.last_to_act = self.state.players[1 - self.button_pos]["id"]
                else:
                    self.last_to_act = self.state.players[self.button_pos]["id"]
            elif len(self.state.community_cards) == 4:
                # River - burn 1, deal 1
                self.deck.pop()  # burn
                self.state.community_cards.append(self.deck.pop())
                self.street = 3
                self.state.metadata["street"] = 3
                self._set_first_to_act_postflop()
                n = len(self.state.players)
                if n == 2:
                    self.last_to_act = self.state.players[1 - self.button_pos]["id"]
                else:
                    self.last_to_act = self.state.players[self.button_pos]["id"]
            else:
                # River betting complete -> showdown/finished
                self.state.phase = GamePhase.FINISHED
                self.street = 4
                self.state.metadata["street"] = 4
        elif self.state.phase == GamePhase.SHOWDOWN:
            self.state.phase = GamePhase.FINISHED

    def is_finished(self) -> bool:
        return self.state.phase == GamePhase.FINISHED

    def _evaluate_all_active(self) -> list[tuple[int, int, list[int]]]:
        """Return list of (player_id, hand_rank, tiebreakers) for all active players."""
        results = []
        for player in self.state.players:
            if player["status"] == "active":
                all_cards = player["cards"] + self.state.community_cards
                score = evaluate_hand(all_cards)
                results.append((player["id"], score[0], score[1]))
        return results

    def get_winners(self) -> list[int]:
        """Return list of winning player IDs (can be multiple for split pots)."""
        if not self.is_finished():
            return []

        active = [p for p in self.state.players if p["status"] == "active"]
        if len(active) == 1:
            return [active[0]["id"]]

        # Evaluate all active hands
        evaluations = self._evaluate_all_active()
        if not evaluations:
            return []

        # Find best score
        best_rank = max(e[1] for e in evaluations)
        best_players = [e for e in evaluations if e[1] == best_rank]

        if len(best_players) == 1:
            return [best_players[0][0]]

        # Tie on hand rank - compare tiebreakers
        best_tiebreakers = max(e[2] for e in best_players)
        winners = [e[0] for e in best_players if e[2] == best_tiebreakers]
        return winners

    def get_winner(self) -> Optional[int]:
        """Return single winner ID (first in split pot)."""
        winners = self.get_winners()
        return winners[0] if winners else None

    def get_payouts(self) -> dict[int, int]:
        """Calculate payouts with single pot, split among winners, odd chip to first winner.
        Each player gets: remaining chips (unbet) + share of pot.
        Folded players' chips stay in pot (already in total_bet).
        """
        winners = self.get_winners()
        payouts = {p["id"]: 0 for p in self.state.players}

        if not winners:
            return payouts

        # Assert equal contributions for all non-folded players at showdown
        # Only enforce if we're past preflop (street > 0) since blinds create
        # natural inequality that gets resolved in the first betting round.
        active = [p for p in self.state.players if p["status"] == "active"]
        if len(active) > 1 and self.street > 0:
            contributions = [p["total_bet"] for p in active]
            if len(set(contributions)) > 1:
                import logging
                logging.error(f"UNEQUAL CONTRIBUTIONS at showdown: {[(p['id'], p['total_bet']) for p in active]}")
                raise ValueError(f"Unequal contributions at showdown: {contributions}")

        pot = self.state.pot
        split = pot // len(winners)
        odd_chip = pot % len(winners)

        # Each player gets their remaining chips back + pot share if winner
        for player in self.state.players:
            pid = player["id"]
            payouts[pid] = player["chips"]  # Refund unbet chips
            if pid in winners:
                idx = winners.index(pid)
                payouts[pid] += split + (1 if idx < odd_chip else 0)

        return payouts

    def get_state_for_player(self, player_id: int) -> dict:
        """Get state visible to specific player.
        - During play: hide all opponent hole cards
        - At showdown: reveal cards ONLY for active players who reached showdown
        - Folded players' cards stay hidden forever
        - Uncontested pot (single active player): no cards revealed
        """
        state_dict = self.state.to_dict()
        phase = state_dict.get("phase", "waiting")
        players = state_dict.get("players", [])

        # Count active players (not folded)
        active_players = [p for p in players if p.get("status") == "active"]

        # Determine if cards should be revealed
        # Reveal only at showdown/finished, and only for active players
        reveal_cards = phase in ("showdown", "finished") and len(active_players) > 1

        for p in state_dict["players"]:
            if p["id"] != player_id:
                if reveal_cards and p.get("status") == "active":
                    # Show hole cards for active players at showdown
                    pass  # Keep actual cards
                else:
                    # Hide: during play, folded players, uncontested pot
                    p["cards"] = ["??", "??"] if p["cards"] else []
        return state_dict

    def to_json(self) -> str:
        import json
        data = self.state.to_dict()
        # Store button, street, and turn tracking in metadata for restoration
        data["metadata"]["button_pos"] = self.button_pos
        data["metadata"]["street"] = self.street
        data["metadata"]["last_to_act"] = self.last_to_act
        data["metadata"]["last_actor"] = self.last_actor
        data["metadata"]["last_aggressor"] = self.last_aggressor
        return json.dumps(data)

    @classmethod
    def from_json(cls, json_str: str, buy_in: int, players: list[dict]) -> "PokerGame":
        import json
        data = json.loads(json_str)
        game = cls(buy_in, players)
        game.state = GameState.from_dict(data)
        game.deck = create_deck()
        # Remove known cards from deck
        known = set()
        for p in game.state.players:
            known.update(p["cards"])
        known.update(game.state.community_cards)
        game.deck = [c for c in game.deck if c not in known]
        shuffle_deck(game.deck)
        # Restore button, street, and turn tracking
        metadata = data.get("metadata", {})
        game.button_pos = metadata.get("button_pos", 0)
        game.street = metadata.get("street", 0)
        game.last_to_act = metadata.get("last_to_act", None)
        game.last_actor = metadata.get("last_actor", None)
        game.last_aggressor = metadata.get("last_aggressor", None)
        return game