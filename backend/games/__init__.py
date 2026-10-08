"""Game registry - add new games here"""
from games.base import BaseGame, GameAction, GameState
from games.poker import PokerGame
from games.blackjack import BlackjackGame

GAME_REGISTRY = {
    "poker": PokerGame,
    "blackjack": BlackjackGame,
}

GAME_METADATA = {
    "poker": {
        "name": "Texas Hold'em Poker",
        "min_players": 2,
        "max_players": 6,
        "default_buy_in": 100,
        "description": "Classic Texas Hold'em",
    },
    "blackjack": {
        "name": "Blackjack",
        "min_players": 1,
        "max_players": 4,
        "default_buy_in": 50,
        "description": "Beat the dealer",
    },
}


def get_game_class(game_type: str) -> type[BaseGame]:
    if game_type not in GAME_REGISTRY:
        raise ValueError(f"Unknown game type: {game_type}")
    return GAME_REGISTRY[game_type]


def get_game_metadata(game_type: str) -> dict:
    return GAME_METADATA.get(game_type, {})


def list_games() -> list[dict]:
    return [
        {"type": k, **v} for k, v in GAME_METADATA.items()
    ]


__all__ = [
    "BaseGame",
    "GameAction",
    "GameState",
    "PokerGame",
    "BlackjackGame",
    "GAME_REGISTRY",
    "GAME_METADATA",
    "get_game_class",
    "get_game_metadata",
    "list_games",
]