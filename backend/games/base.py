"""Base game classes - all games inherit from BaseGame"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
from enum import Enum


class GamePhase(str, Enum):
    WAITING = "waiting"
    BETTING = "betting"
    PLAYING = "playing"
    SHOWDOWN = "showdown"
    FINISHED = "finished"


@dataclass
class GameAction:
    """Action a player can take"""
    type: str           # "bet", "fold", "call", "raise", "hit", "stand", etc.
    amount: int = 0     # for bet/raise
    metadata: dict = field(default_factory=dict)


@dataclass
class GameState:
    """Serializable game state"""
    phase: GamePhase = GamePhase.WAITING
    current_player: int = 0
    players: list[dict] = field(default_factory=list)  # [{id, name, chips, cards, bet, status}, ...]
    community_cards: list[str] = field(default_factory=list)
    pot: int = 0
    current_bet: int = 0
    min_raise: int = 0
    winner: int | None = None
    metadata: dict = field(default_factory=dict)  # game-specific data

    def to_dict(self) -> dict:
        return {
            "phase": self.phase.value,
            "current_player": self.current_player,
            "players": self.players,
            "community_cards": self.community_cards,
            "pot": self.pot,
            "current_bet": self.current_bet,
            "min_raise": self.min_raise,
            "winner": self.winner,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "GameState":
        return cls(
            phase=GamePhase(data.get("phase", "waiting")),
            current_player=data.get("current_player", 0),
            players=data.get("players", []),
            community_cards=data.get("community_cards", []),
            pot=data.get("pot", 0),
            current_bet=data.get("current_bet", 0),
            min_raise=data.get("min_raise", 0),
            winner=data.get("winner"),
            metadata=data.get("metadata", {}),
        )


class BaseGame(ABC):
    """Abstract base class for all games"""

    def __init__(self, buy_in: int, players: list[dict]):
        """
        players: [{"id": 1, "username": "user1", "chips": 1000}, ...]
        """
        self.buy_in = buy_in
        self.players = players
        self.state = GameState()
        self._init_game()

    @abstractmethod
    def _init_game(self) -> None:
        """Initialize game-specific state"""
        pass

    @abstractmethod
    def get_valid_actions(self, player_id: int) -> list[str]:
        """Return list of valid action types for player"""
        pass

    @abstractmethod
    def apply_action(self, player_id: int, action: GameAction) -> GameState:
        """Apply action, return new state"""
        pass

    @abstractmethod
    def is_finished(self) -> bool:
        """Check if game is over"""
        pass

    @abstractmethod
    def get_winner(self) -> int | None:
        """Return winning player_id or None"""
        pass

    @abstractmethod
    def get_payouts(self) -> dict[int, int]:
        """Return {player_id: payout_amount}"""
        pass

    def start_game(self) -> None:
        """Start the game - deal cards, set phase to playing"""
        # Default implementation - override in subclasses if needed
        self.state.phase = GamePhase.PLAYING

    def get_state_for_player(self, player_id: int) -> dict:
        """Get state visible to specific player (hide opponent cards)"""
        state_dict = self.state.to_dict()
        # Hide other players' hole cards
        for p in state_dict["players"]:
            if p["id"] != player_id:
                p["cards"] = ["??", "??"] if p["cards"] else []
        return state_dict

    def to_json(self) -> str:
        import json
        return json.dumps(self.state.to_dict())

    @classmethod
    @abstractmethod
    def from_json(cls, json_str: str, buy_in: int, players: list[dict]) -> "BaseGame":
        """Restore game from JSON"""
        pass