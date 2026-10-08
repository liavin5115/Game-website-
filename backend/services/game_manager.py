"""Game Manager - orchestrates game lifecycle"""
import json
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models import Game, GameSession, GameStatus, GameType, User, TransactionType
from games import get_game_class, get_game_metadata, list_games
from games.base import GameAction
from services.wallet import WalletService
from websocket.manager import manager


class GameManager:
    def __init__(self, db: Session):
        self.db = db
        self.wallet = WalletService(db)

    def list_available_games(self) -> list[dict]:
        return list_games()

    async def create_game(self, creator_id: int, game_type: str, buy_in: Optional[int] = None) -> Game:
        # Validate game type
        metadata = get_game_metadata(game_type)
        if not metadata:
            raise ValueError(f"Unknown game type: {game_type}")

        # Check buy-in
        if buy_in is None:
            buy_in = metadata["default_buy_in"]
        if buy_in <= 0:
            raise ValueError("Buy-in must be positive")

        # Check creator can afford
        if not self.wallet.can_afford(creator_id, buy_in):
            raise ValueError("Insufficient points for buy-in")

        # Deduct buy-in from creator
        self.wallet.deduct_points(
            creator_id,
            buy_in,
            TransactionType.GAME_BUYIN,
            f"Buy-in for {metadata['name']}",
        )

        # Create game
        game = Game(
            game_type=GameType(game_type),
            status=GameStatus.WAITING,
            buy_in=buy_in,
            pot=buy_in,  # creator's buy-in goes to pot
            player1_id=creator_id,
        )
        self.db.add(game)
        self.db.flush()

        # Create session for creator
        session = GameSession(
            game_id=game.id,
            user_id=creator_id,
            position=0,
            buy_in=buy_in,
        )
        self.db.add(session)

        # Initialize game state
        game_class = get_game_class(game_type)
        creator = self.db.query(User).filter(User.id == creator_id).first()
        players_data = [{"id": creator_id, "username": creator.username, "chips": buy_in}]
        game_instance = game_class(buy_in, players_data)
        game.state = game_instance.to_json()

        self.db.commit()
        self.db.refresh(game)

        # Broadcast lobby update
        await manager.broadcast_lobby_update({"type": "lobby_changed", "game_id": game.id})

        return game

    async def join_game(self, game_id: int, user_id: int) -> GameSession:
        from sqlalchemy.exc import IntegrityError

        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")

        if game.status != GameStatus.WAITING:
            raise ValueError("Game is not accepting players")

        # Check player limit
        metadata = get_game_metadata(game.game_type.value)
        current_players = self.db.query(GameSession).filter(GameSession.game_id == game_id).count()
        if current_players >= metadata["max_players"]:
            raise ValueError("Game is full")

        # Check buy-in
        if not self.wallet.can_afford(user_id, game.buy_in):
            raise ValueError("Insufficient points for buy-in")

        # Deduct buy-in
        self.wallet.deduct_points(
            user_id,
            game.buy_in,
            TransactionType.GAME_BUYIN,
            f"Buy-in for {metadata['name']}",
        )

        # Add player to game - unique constraint prevents duplicate joins
        position = current_players
        session = GameSession(
            game_id=game_id,
            user_id=user_id,
            position=position,
            buy_in=game.buy_in,
        )
        self.db.add(session)

        try:
            # Update game state
            game.pot += game.buy_in

            # Rebuild game instance with all players
            players = self._get_players_data(game_id)
            game_class = get_game_class(game.game_type.value)
            game_instance = game_class(game.buy_in, players)
            game.state = game_instance.to_json()

            self.db.commit()
            self.db.refresh(session)

            # Broadcast updates
            await manager.broadcast_game_state(game_id, {"type": "state_changed"})
            await manager.broadcast_lobby_update({"type": "lobby_changed", "game_id": game_id})

            return session
        except IntegrityError:
            self.db.rollback()
            raise ValueError("Already in this game")

    def _get_players_data(self, game_id: int) -> list[dict]:
        sessions = (
            self.db.query(GameSession)
            .filter(GameSession.game_id == game_id)
            .order_by(GameSession.position)
            .all()
        )
        users = self.db.query(User).filter(User.id.in_([s.user_id for s in sessions])).all()
        user_map = {u.id: u for u in users}
        return [
            {"id": s.user_id, "username": user_map[s.user_id].username, "chips": s.buy_in}
            for s in sessions
        ]

    async def apply_action(self, game_id: int, user_id: int, action_type: str, amount: int = 0) -> Game:
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")

        if game.status != GameStatus.IN_PROGRESS:
            raise ValueError("Game is not in progress")

        # Verify it's user's turn
        game_class = get_game_class(game.game_type.value)
        players_data = self._get_players_data(game_id)
        game_instance = game_class.from_json(game.state, game.buy_in, players_data)

        state_dict = game_instance.state.to_dict()
        current_player_id = state_dict["players"][state_dict["current_player"]]["id"]
        if current_player_id != user_id:
            raise ValueError("Not your turn")

        # Handle double down - charge additional bet from wallet
        if action_type == "double" and game.game_type.value == "blackjack":
            player_state = next((p for p in state_dict["players"] if p["id"] == user_id), None)
            if player_state:
                additional_bet = player_state["bet"]
                if not self.wallet.can_afford(user_id, additional_bet):
                    raise ValueError("Insufficient points to double down")
                self.wallet.deduct_points(
                    user_id,
                    additional_bet,
                    TransactionType.GAME_BUYIN,
                    f"Double down in blackjack game",
                    game_id
                )

        # Apply action
        action = GameAction(type=action_type, amount=amount)
        game_instance.apply_action(user_id, action)

        # Check if finished
        if game_instance.is_finished():
            self._finish_game(game, game_instance)
        else:
            game.state = game_instance.to_json()

        self.db.commit()
        self.db.refresh(game)

        # Broadcast update
        await manager.broadcast_game_state(game_id, {"type": "state_changed"})

        return game

    def _finish_game(self, game: Game, game_instance) -> None:
        game.status = GameStatus.FINISHED
        game.finished_at = __import__('datetime').datetime.utcnow()
        game.state = game_instance.to_json()

        winner_id = game_instance.get_winner()
        if winner_id:
            game.winner_id = winner_id

        # Process payouts
        payouts = game_instance.get_payouts()
        for player_id, payout in payouts.items():
            session = self.db.query(GameSession).filter(
                and_(GameSession.game_id == game.id, GameSession.user_id == player_id)
            ).first()
            if session:
                session.payout = payout
                session.result = "win" if payout > session.buy_in else "loss" if payout < session.buy_in else "draw"
                session.left_at = __import__('datetime').datetime.utcnow()

                if payout > session.buy_in:
                    profit = payout - session.buy_in
                    self.wallet.add_points(
                        player_id,
                        profit,
                        TransactionType.GAME_WIN,
                        f"Won {game.game_type.value} game",
                        game.id
                    )
                elif payout < session.buy_in:
                    loss = session.buy_in - payout
                    self.wallet.deduct_points(
                        player_id,
                        loss,
                        TransactionType.GAME_LOSS,
                        f"Lost {game.game_type.value} game",
                        game.id
                    )

        # Update user stats
        for player_id, payout in payouts.items():
            user = self.db.query(User).filter(User.id == player_id).first()
            if user:
                user.total_games += 1
                if payout > game.buy_in:
                    user.total_wins += 1

    def get_game(self, game_id: int, user_id: Optional[int] = None) -> Optional[Game]:
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            return None

        # Return state visible to user
        if user_id:
            game_class = get_game_class(game.game_type.value)
            players_data = self._get_players_data(game_id)
            game_instance = game_class.from_json(game.state, game.buy_in, players_data)
            game.state = json.dumps(game_instance.get_state_for_player(user_id))

        return game

    def get_user_games(self, user_id: int, status: Optional[GameStatus] = None) -> list[Game]:
        query = self.db.query(Game).join(GameSession).filter(GameSession.user_id == user_id)
        if status:
            query = query.filter(Game.status == status)
        return query.order_by(Game.created_at.desc()).all()

    def get_lobby_games(self, game_type: Optional[str] = None) -> list[Game]:
        query = self.db.query(Game).filter(Game.status == GameStatus.WAITING)
        if game_type:
            query = query.filter(Game.game_type == GameType(game_type))
        return query.order_by(Game.created_at.desc()).limit(20).all()

    async def leave_game(self, game_id: int, user_id: int) -> None:
        """Remove player from waiting game and refund buy-in"""
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")

        if game.status != GameStatus.WAITING:
            raise ValueError("Can only leave waiting games")

        session = self.db.query(GameSession).filter(
            and_(GameSession.game_id == game_id, GameSession.user_id == user_id)
        ).first()
        if not session:
            raise ValueError("Not in this game")

        # Refund buy-in
        self.wallet.add_points(
            user_id,
            session.buy_in,
            TransactionType.REFUND,
            f"Left {game.game_type.value} game",
            game_id
        )

        # Remove session
        self.db.delete(session)
        game.pot -= session.buy_in

        # Handle host transfer if host leaves
        if game.player1_id == user_id:
            remaining = self.db.query(GameSession).filter(
                GameSession.game_id == game_id
            ).order_by(GameSession.position).first()

            if remaining:
                game.player1_id = remaining.user_id
            else:
                # Last player, cancel game
                game.status = GameStatus.CANCELLED

        # Clear player2_id if that player leaves
        if game.player2_id == user_id:
            game.player2_id = None

        # Rebuild game state without leaving player
        if game.status == GameStatus.WAITING:
            players = self._get_players_data(game_id)
            if players:
                game_class = get_game_class(game.game_type.value)
                game_instance = game_class(game.buy_in, players)
                game.state = game_instance.to_json()

        self.db.commit()

        # Broadcast updates
        await manager.broadcast_game_state(game_id, {"type": "state_changed"})
        await manager.broadcast_lobby_update({"type": "lobby_changed", "game_id": game_id})

    async def start_game(self, game_id: int, user_id: int) -> Game:
        """Start a waiting game (host only)"""
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")

        if game.status != GameStatus.WAITING:
            raise ValueError("Game is not waiting")

        if game.player1_id != user_id:
            raise ValueError("Only the host can start the game")

        # Check minimum players
        metadata = get_game_metadata(game.game_type.value)
        current_players = self.db.query(GameSession).filter(
            GameSession.game_id == game_id
        ).count()

        if current_players < metadata["min_players"]:
            raise ValueError(f"Need at least {metadata['min_players']} players to start")

        # Start the game
        game.status = GameStatus.IN_PROGRESS
        game.started_at = __import__('datetime').datetime.utcnow()

        # Initialize game state for play
        players = self._get_players_data(game_id)
        game_class = get_game_class(game.game_type.value)
        game_instance = game_class(game.buy_in, players)
        game_instance.start_game()
        game.state = game_instance.to_json()

        self.db.commit()
        self.db.refresh(game)

        # Broadcast updates
        await manager.broadcast_game_state(game_id, {"type": "state_changed"})
        await manager.broadcast_lobby_update({"type": "lobby_changed", "game_id": game_id})

        return game