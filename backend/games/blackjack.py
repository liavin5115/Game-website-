"""Blackjack implementation"""
import random
from typing import Optional
from .base import BaseGame, GameAction, GameState, GamePhase


RANKS = "23456789TJQKA"
SUITS = "cdhs"
RANK_VALUE = {r: i for i, r in enumerate(RANKS, 2)}
# J,Q,K = 10, A = 11 or 1
BLACKJACK_VALUE = {**{r: i for i, r in enumerate(RANKS, 2)}, "T": 10, "J": 10, "Q": 10, "K": 10, "A": 11}


def create_deck() -> list[str]:
    return [r + s for r in RANKS for s in SUITS]


def hand_value(cards: list[str]) -> tuple[int, bool]:
    """Return (best_value, is_soft) for blackjack hand"""
    total = 0
    aces = 0
    for card in cards:
        rank = card[0]
        total += BLACKJACK_VALUE[rank]
        if rank == "A":
            aces += 1

    # Adjust aces from 11 to 1 if bust
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1

    is_soft = aces > 0 and total <= 21
    return (total, is_soft)


def is_blackjack(cards: list[str]) -> bool:
    return len(cards) == 2 and hand_value(cards)[0] == 21


class BlackjackGame(BaseGame):
    def __init__(self, buy_in: int, players: list[dict]):
        super().__init__(buy_in, players)

    def _init_game(self) -> None:
        self.deck = create_deck()
        self.dealer_cards: list[str] = []
        self.dealer_hidden: bool = True

        # Initialize empty state - cards dealt in start_game()
        self.state.players = [
            {"id": p["id"], "username": p["username"], "chips": p["chips"],
             "cards": [], "bet": 0, "status": "waiting", "doubled": False}
            for p in self.players
        ]
        self.state.phase = GamePhase.WAITING

    def _check_initial_blackjacks(self) -> None:
        dealer_bj = is_blackjack(self.dealer_cards)
        for player in self.state.players:
            if is_blackjack(player["cards"]):
                if dealer_bj:
                    player["status"] = "push"
                else:
                    player["status"] = "blackjack"

    def get_valid_actions(self, player_id: int) -> list[str]:
        player = next((p for p in self.state.players if p["id"] == player_id), None)
        if not player or player["status"] not in ("playing", "blackjack"):
            return []

        if player["status"] == "blackjack":
            return []

        actions = ["hit", "stand"]
        # Can double if: 2 cards, hasn't doubled, and has enough chips for another bet
        if len(player["cards"]) == 2 and not player.get("doubled"):
            actions.append("double")
        # Split not implemented for simplicity
        return actions

    def apply_action(self, player_id: int, action: GameAction) -> GameState:
        player = next((p for p in self.state.players if p["id"] == player_id), None)
        if not player or player["status"] != "playing":
            return self.state

        if action.type == "hit":
            player["cards"].append(self.deck.pop())
            value, _ = hand_value(player["cards"])
            if value > 21:
                player["status"] = "bust"
            elif value == 21:
                player["status"] = "stand"  # Auto-stand on 21

        elif action.type == "stand":
            player["status"] = "stand"

        elif action.type == "double":
            if len(player["cards"]) != 2:
                raise ValueError("Cannot double")
            # Chip check happens in game_manager via wallet
            player["bet"] *= 2
            player["total_bet"] = player["bet"]
            player["doubled"] = True
            player["cards"].append(self.deck.pop())
            value, _ = hand_value(player["cards"])
            if value > 21:
                player["status"] = "bust"
            else:
                player["status"] = "stand"

        # Update state
        self._sync_player_state(player)

        # Check if all players done
        if all(p["status"] in ("stand", "bust", "blackjack", "push") for p in self.state.players):
            self._play_dealer()

        return self.state

    def _sync_player_state(self, player: dict) -> None:
        for p in self.state.players:
            if p["id"] == player["id"]:
                p["cards"] = player["cards"]
                p["bet"] = player["bet"]
                p["status"] = player["status"]
                p["chips"] = player["chips"]
                p["doubled"] = player.get("doubled", False)
                break

    def _play_dealer(self) -> None:
        self.dealer_hidden = False
        self.state.metadata["dealer_hidden"] = False
        self.state.community_cards = self.dealer_cards.copy()

        while True:
            value, is_soft = hand_value(self.dealer_cards)
            if value >= 17:
                if value == 17 and is_soft:  # Hit soft 17
                    self.dealer_cards.append(self.deck.pop())
                    self.state.community_cards = self.dealer_cards.copy()
                    continue
                break
            self.dealer_cards.append(self.deck.pop())
            self.state.community_cards = self.dealer_cards.copy()

        self.state.metadata["dealer_cards"] = self.dealer_cards
        self._resolve_hands()
        self.state.phase = GamePhase.FINISHED

    def _resolve_hands(self) -> None:
        dealer_value, _ = hand_value(self.dealer_cards)
        dealer_bust = dealer_value > 21
        dealer_bj = is_blackjack(self.dealer_cards)

        for player in self.state.players:
            if player["status"] == "bust":
                continue  # Already lost
            if player["status"] == "blackjack":
                if dealer_bj:
                    player["status"] = "push"
                else:
                    player["status"] = "win"
                continue

            player_value, _ = hand_value(player["cards"])
            if dealer_bust or player_value > dealer_value:
                player["status"] = "win"
            elif player_value == dealer_value:
                player["status"] = "push"
            else:
                player["status"] = "loss"

    def is_finished(self) -> bool:
        return self.state.phase == GamePhase.FINISHED

    def get_winner(self) -> Optional[int]:
        if not self.is_finished():
            return None
        # Multiple winners possible in blackjack
        winners = [p["id"] for p in self.state.players if p["status"] in ("win", "blackjack")]
        return winners[0] if winners else None

    def get_payouts(self) -> dict[int, int]:
        payouts = {}
        for player in self.state.players:
            bet = player["bet"]
            if player["status"] == "blackjack":
                payouts[player["id"]] = int(bet * 2.5)  # 3:2 payout
            elif player["status"] == "win":
                payouts[player["id"]] = bet * 2  # 1:1
            elif player["status"] == "push":
                payouts[player["id"]] = bet  # Return bet
            else:
                payouts[player["id"]] = 0  # Loss
        return payouts

    def start_game(self) -> None:
        """Deal cards and begin play"""
        random.shuffle(self.deck)

        # Deal to players
        for i, player in enumerate(self.players):
            player["cards"] = [self.deck.pop(), self.deck.pop()]
            player["bet"] = self.buy_in
            player["status"] = "playing"
            player["total_bet"] = self.buy_in
            player["doubled"] = False

        # Update state
        self.state.players = [
            {"id": p["id"], "username": p["username"], "chips": p["chips"],
             "cards": p["cards"], "bet": p["bet"], "status": p["status"], "doubled": False}
            for p in self.players
        ]
        self.dealer_cards = [self.deck.pop(), self.deck.pop()]
        self.state.community_cards = [self.dealer_cards[0], "??"]
        self.state.phase = GamePhase.PLAYING
        self.state.current_player = 0
        self.state.pot = sum(p["bet"] for p in self.state.players)
        self.state.metadata = {"dealer_cards": self.dealer_cards, "dealer_hidden": True}

        self._check_initial_blackjacks()

    def get_state_for_player(self, player_id: int) -> dict:
        """Get state visible to specific player - in blackjack, all player cards are public, only dealer hole card hidden"""
        state_dict = self.state.to_dict()
        # In blackjack, all player cards are visible - no hiding
        return state_dict

    def to_json(self) -> str:
        import json
        data = self.state.to_dict()
        # Hide dealer hole card when dealer_hidden is true
        if self.dealer_hidden:
            data["community_cards"] = [self.dealer_cards[0], "??"] if self.dealer_cards else []
            # Remove metadata.dealer_cards to prevent leak
            if "dealer_cards" in data.get("metadata", {}):
                del data["metadata"]["dealer_cards"]
        else:
            data["community_cards"] = self.dealer_cards
            data["metadata"]["dealer_cards"] = self.dealer_cards
        return json.dumps(data)

    @classmethod
    def from_json(cls, json_str: str, buy_in: int, players: list[dict]) -> "BlackjackGame":
        import json
        data = json.loads(json_str)
        game = cls(buy_in, players)
        game.state = GameState.from_dict(data)
        game.deck = create_deck()
        game.dealer_cards = data.get("dealer_cards", [])
        game.dealer_hidden = data.get("dealer_hidden", True)

        # Remove known cards from deck
        known = set()
        for p in game.state.players:
            known.update(p["cards"])
        known.update(game.dealer_cards)
        game.deck = [c for c in game.deck if c not in known]
        return game