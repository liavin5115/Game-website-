"""Texas Hold'em Poker implementation"""
import random
from typing import Optional
from .base import BaseGame, GameAction, GameState, GamePhase


# Card utilities
RANKS = "23456789TJQKA"
SUITS = "cdhs"  # clubs, diamonds, hearts, spades
RANK_VALUE = {r: i for i, r in enumerate(RANKS, 2)}


def create_deck() -> list[str]:
    return [r + s for r in RANKS for s in SUITS]


def evaluate_hand(cards: list[str]) -> tuple[int, list[int]]:
    """
    Evaluate 5-7 card hand, return (hand_rank, tiebreakers)
    Hand ranks: 9=Royal Flush, 8=Straight Flush, 7=Four Kind, 6=Full House,
                5=Flush, 4=Straight, 3=Three Kind, 2=Two Pair, 1=Pair, 0=High Card
    """
    if len(cards) < 5:
        return (0, [])

    # Parse cards
    ranks = [RANK_VALUE[c[0]] for c in cards]
    suits = [c[1] for c in cards]

    # Count ranks
    rank_counts = {}
    for r in ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1

    # Sort by count desc, then rank desc
    sorted_counts = sorted(rank_counts.items(), key=lambda x: (x[1], x[0]), reverse=True)

    # Check flush
    flush_suit = None
    for s in SUITS:
        if suits.count(s) >= 5:
            flush_suit = s
            break

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
    if flush_suit and straight_high:
        flush_cards = [c for c in cards if c[1] == flush_suit]
        flush_ranks = sorted({RANK_VALUE[c[0]] for c in flush_cards}, reverse=True)
        if 14 in flush_ranks:
            flush_ranks.append(1)
        for i in range(len(flush_ranks) - 4):
            if flush_ranks[i] - flush_ranks[i + 4] == 4:
                if flush_ranks[i] == 14:
                    return (9, [])  # Royal flush
                return (8, [flush_ranks[i]])  # Straight flush

    # Four of a kind
    if sorted_counts[0][1] == 4:
        quad = sorted_counts[0][0]
        kicker = max(r for r in ranks if r != quad)
        return (7, [quad, kicker])

    # Full house
    if sorted_counts[0][1] == 3 and sorted_counts[1][1] >= 2:
        trips = sorted_counts[0][0]
        pair = sorted_counts[1][0]
        return (6, [trips, pair])

    # Flush
    if flush_suit:
        flush_ranks = sorted([RANK_VALUE[c[0]] for c in cards if c[1] == flush_suit], reverse=True)
        return (5, flush_ranks[:5])

    # Straight
    if straight_high:
        return (4, [straight_high])

    # Three of a kind
    if sorted_counts[0][1] == 3:
        trips = sorted_counts[0][0]
        kickers = sorted([r for r in ranks if r != trips], reverse=True)[:2]
        return (3, [trips] + kickers)

    # Two pair
    if sorted_counts[0][1] == 2 and sorted_counts[1][1] == 2:
        high_pair = max(sorted_counts[0][0], sorted_counts[1][0])
        low_pair = min(sorted_counts[0][0], sorted_counts[1][0])
        kicker = max(r for r in ranks if r not in (high_pair, low_pair))
        return (2, [high_pair, low_pair, kicker])

    # One pair
    if sorted_counts[0][1] == 2:
        pair = sorted_counts[0][0]
        kickers = sorted([r for r in ranks if r != pair], reverse=True)[:3]
        return (1, [pair] + kickers)

    # High card
    return (0, sorted(ranks, reverse=True)[:5])


class PokerGame(BaseGame):
    def __init__(self, buy_in: int, players: list[dict]):
        super().__init__(buy_in, players)

    def _init_game(self) -> None:
        self.deck = create_deck()

        # Initialize empty state - cards dealt in start_game()
        self.state.players = [
            {"id": p["id"], "username": p["username"], "chips": p["chips"],
             "cards": [], "bet": 0, "status": "active"}
            for p in self.players
        ]
        self.state.phase = GamePhase.WAITING
        self.state.pot = 0
        self.state.current_bet = 0
        self.state.min_raise = self.buy_in // 10 or 10
        self.state.current_player = 0
        self.state.community_cards = []

    def start_game(self) -> None:
        """Deal cards and begin betting"""
        random.shuffle(self.deck)

        # Deal 2 cards to each player
        for i, player in enumerate(self.players):
            player["cards"] = [self.deck.pop(), self.deck.pop()]
            player["bet"] = 0
            player["status"] = "active"
            player["total_bet"] = 0

        # Update state
        self.state.players = [
            {"id": p["id"], "username": p["username"], "chips": p["chips"],
             "cards": p["cards"], "bet": 0, "status": "active"}
            for p in self.players
        ]
        self.state.phase = GamePhase.BETTING

        # Post blinds (simplified: first player posts small, second posts big)
        if len(self.players) >= 2:
            sb = self.buy_in // 20 or 5
            bb = self.buy_in // 10 or 10
            self._post_blind(0, sb)
            self._post_blind(1, bb)

    def _post_blind(self, player_idx: int, amount: int) -> None:
        player = self.state.players[player_idx]
        actual = min(amount, player["chips"])
        player["bet"] = actual
        player["chips"] -= actual
        player["total_bet"] += actual
        self.state.pot += actual
        self.state.current_bet = max(self.state.current_bet, actual)

    def get_valid_actions(self, player_id: int) -> list[str]:
        player = next((p for p in self.state.players if p["id"] == player_id), None)
        if not player or player["status"] != "active":
            return []

        actions = ["fold"]
        if player["bet"] < self.state.current_bet:
            actions.append("call")
        if player["chips"] > 0:
            actions.extend(["bet", "raise"])
        if self.state.current_bet == 0:
            actions.append("check")
        return actions

    def apply_action(self, player_id: int, action: GameAction) -> GameState:
        player = next((p for p in self.state.players if p["id"] == player_id), None)
        if not player or player["status"] != "active":
            return self.state

        if action.type == "fold":
            player["status"] = "folded"
        elif action.type == "check":
            if self.state.current_bet > 0:
                raise ValueError("Cannot check, must call or raise")
        elif action.type == "call":
            call_amount = self.state.current_bet - player["bet"]
            actual = min(call_amount, player["chips"])
            player["bet"] += actual
            player["chips"] -= actual
            player["total_bet"] += actual
            self.state.pot += actual
        elif action.type in ("bet", "raise"):
            amount = action.amount
            if action.type == "raise":
                amount += self.state.current_bet
            amount = min(amount, player["chips"] + player["bet"])
            if amount <= player["bet"]:
                raise ValueError("Invalid bet/raise amount")
            additional = amount - player["bet"]
            player["bet"] = amount
            player["chips"] -= additional
            player["total_bet"] += additional
            self.state.pot += additional
            self.state.current_bet = amount
            self.state.min_raise = max(self.state.min_raise, amount // 2)

        # Move to next player
        self._next_player()

        # Check if betting round complete
        if self._betting_round_complete():
            self._advance_phase()

        return self.state

    def _next_player(self) -> None:
        active_players = [p for p in self.state.players if p["status"] == "active"]
        if not active_players:
            return

        current_idx = self.state.current_player
        for _ in range(len(self.state.players)):
            current_idx = (current_idx + 1) % len(self.state.players)
            if self.state.players[current_idx]["status"] == "active":
                self.state.current_player = current_idx
                break

    def _betting_round_complete(self) -> bool:
        active = [p for p in self.state.players if p["status"] == "active"]
        if len(active) <= 1:
            return True
        # All active players have matched current_bet
        return all(p["bet"] == self.state.current_bet for p in active)

    def _advance_phase(self) -> None:
        # Reset bets for next round
        for p in self.state.players:
            p["bet"] = 0
        self.state.current_bet = 0

        if self.state.phase == GamePhase.BETTING:
            # Deal flop (3 cards)
            self.state.community_cards = [self.deck.pop() for _ in range(3)]
            self.state.phase = GamePhase.PLAYING
        elif self.state.phase == GamePhase.PLAYING:
            if len(self.state.community_cards) < 5:
                # Turn or River
                self.state.community_cards.append(self.deck.pop())
            else:
                self.state.phase = GamePhase.SHOWDOWN
        elif self.state.phase == GamePhase.SHOWDOWN:
            self.state.phase = GamePhase.FINISHED

        # Next player to act (first active after dealer)
        self._next_player()

    def is_finished(self) -> bool:
        return self.state.phase == GamePhase.FINISHED

    def get_winner(self) -> Optional[int]:
        if not self.is_finished():
            return None

        active = [p for p in self.state.players if p["status"] == "active"]
        if len(active) == 1:
            return active[0]["id"]

        # Evaluate hands
        best_score = (-1, [])
        winner_id = None
        for player in active:
            all_cards = player["cards"] + self.state.community_cards
            score = evaluate_hand(all_cards)
            if score > best_score:
                best_score = score
                winner_id = player["id"]
        return winner_id

    def get_payouts(self) -> dict[int, int]:
        winner_id = self.get_winner()
        payouts = {}
        for player in self.state.players:
            if player["id"] == winner_id:
                payouts[player["id"]] = self.state.pot
            else:
                payouts[player["id"]] = 0
        return payouts

    def to_json(self) -> str:
        import json
        data = self.state.to_dict()
        data["deck_count"] = len(self.deck)
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
        return game