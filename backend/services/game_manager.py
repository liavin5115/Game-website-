"""Game Manager - orchestrates game lifecycle"""
import json
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models import Game, GameSession, GameStatus, GameType, User, TransactionType
from games import get_game_class, get_game_metadata, list_games
from games.base import GameAction
from services.wallet import WalletService
from websocket.manager import manager
from config import get_settings


class GameManager:
    def __init__(self, db: Session):
        self.db = db
        self.wallet = WalletService(db)
        self.settings = get_settings()

    def _now_utc(self) -> datetime:
        return datetime.now(timezone.utc)

    def _set_turn_deadline(self, game: Game, game_instance, advance_seq: bool = True) -> None:
        """Set turn_deadline and increment turn_seq in state metadata."""
        if game.status != GameStatus.IN_PROGRESS:
            game.turn_deadline = None
            return

        # Dealer's turn has no timer - check for active players (poker uses "active", blackjack uses "playing")
        state_dict = game_instance.state.to_dict()
        current_player_idx = state_dict.get("current_player", 0)
        players = state_dict.get("players", [])
        if current_player_idx < len(players):
            current_player = players[current_player_idx]
            player_status = current_player.get("status", "")
            if player_status not in ("playing", "active"):
                game.turn_deadline = None
                return

        # Use poker-specific timer for poker games
        if game.game_type == GameType.POKER:
            turn_seconds = self.settings.POKER_TURN_SECONDS
        else:
            turn_seconds = self.settings.TURN_SECONDS

        game.turn_deadline = self._now_utc().replace(tzinfo=None) + \
            __import__('datetime').timedelta(seconds=turn_seconds)

        if advance_seq:
            metadata = state_dict.get("metadata", {})
            metadata["turn_seq"] = metadata.get("turn_seq", 0) + 1
            state_dict["metadata"] = metadata
            game.state = json.dumps(state_dict)
            game_instance.state = game_instance.state.from_dict(state_dict)

    def _check_and_apply_timeout(self, game: Game, game_instance) -> bool:
        """Check if turn_deadline expired and apply auto-action. Returns True if timeout applied.
        Never raises - catches all errors and returns False."""
        if not game.turn_deadline or game.status != GameStatus.IN_PROGRESS:
            return False

        if self._now_utc().replace(tzinfo=None) < game.turn_deadline:
            return False

        # Timeout - apply auto-action for current player
        try:
            state_dict = game_instance.state.to_dict()
            current_player_idx = state_dict.get("current_player", 0)
            players = state_dict.get("players", [])
            if current_player_idx >= len(players):
                # No valid current player - clear deadline
                game.turn_deadline = None
                return False

            current_player = players[current_player_idx]
            player_status = current_player.get("status", "")
            if player_status not in ("playing", "active"):
                # Player not active - clear deadline or recompute
                game.turn_deadline = None
                return False

            player_id = current_player["id"]

            # Update strikes
            metadata = state_dict.get("metadata", {})
            strikes = metadata.get("timeout_strikes", {}).get(str(player_id), 0)
            strikes += 1
            if "timeout_strikes" not in metadata:
                metadata["timeout_strikes"] = {}
            metadata["timeout_strikes"][str(player_id)] = strikes

            # Mark auto action and away if max strikes reached
            current_player["auto_stood"] = True
            if strikes >= self.settings.TURN_TIMEOUT_MAX_STRIKES:
                current_player["status"] = "away"

            # Sync state back to game_instance before applying action
            game_instance.state = game_instance.state.from_dict(state_dict)

            # Apply timeout action: poker = check if allowed else fold; blackjack = stand
            if game.game_type == GameType.POKER:
                action = GameAction(type="check", amount=0)
                try:
                    game_instance.apply_action(player_id, action)
                except ValueError:
                    # Check not allowed (facing bet) -> fold
                    action = GameAction(type="fold", amount=0)
                    try:
                        game_instance.apply_action(player_id, action)
                    except ValueError:
                        # Player can't act (not on turn, not active, etc.) - just skip
                        game.turn_deadline = None
                        return False
            else:
                # Blackjack: auto-stand
                action = GameAction(type="stand", amount=0)
                try:
                    game_instance.apply_action(player_id, action)
                except ValueError:
                    game.turn_deadline = None
                    return False

            # Check if finished
            if game_instance.is_finished():
                game.turn_deadline = None
                self._finish_game(game, game_instance)
                game.state = game_instance.to_json()
                game.pot = 0
            else:
                # Set new turn deadline for next player
                self._set_turn_deadline(game, game_instance, advance_seq=True)
                game.state = game_instance.to_json()
                game.pot = game_instance.state.pot

            # Update state with strikes and auto_stood
            new_state_dict = game_instance.state.to_dict()
            new_state_dict["metadata"] = metadata
            # Preserve turn_seq from _set_turn_deadline
            if "turn_seq" in game_instance.state.to_dict().get("metadata", {}):
                new_state_dict["metadata"]["turn_seq"] = game_instance.state.to_dict()["metadata"]["turn_seq"]
            game.state = json.dumps(new_state_dict)
            game_instance.state = game_instance.state.from_dict(new_state_dict)

            return True
        except Exception as e:
            # Never raise - log and return False
            import logging
            logging.warning(f"_check_and_apply_timeout error for game {game.id}: {e}")
            game.turn_deadline = None
            return False

    def _get_server_time(self) -> datetime:
        return self._now_utc()

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

        # Poker minimum buy-in
        if game_type == "poker" and buy_in < 40:
            raise ValueError("Poker minimum buy-in is 40")

        # Check creator can afford
        if not self.wallet.can_afford(creator_id, buy_in):
            raise ValueError("Insufficient points for buy-in")

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

        # Deduct buy-in from creator with game reference
        self.wallet.deduct_points(
            creator_id,
            buy_in,
            TransactionType.GAME_BUYIN,
            f"Buy-in for {metadata['name']}",
            game.id,
            commit=False
        )

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

        # Lock game row to prevent race on max_players check
        game = self.db.query(Game).filter(Game.id == game_id).with_for_update().first()
        if not game:
            raise ValueError("Game not found")

        if game.status != GameStatus.WAITING:
            raise ValueError("Game is not accepting players")

        # Check player limit under row lock
        metadata = get_game_metadata(game.game_type.value)
        current_players = self.db.query(GameSession).filter(GameSession.game_id == game_id).count()
        if current_players >= metadata["max_players"]:
            raise ValueError("Game is full")

        # Check buy-in
        if not self.wallet.can_afford(user_id, game.buy_in):
            raise ValueError("Insufficient points for buy-in")

        # Poker minimum buy-in
        if game.game_type == GameType.POKER and game.buy_in < 40:
            raise ValueError("Poker minimum buy-in is 40")

        # Deduct buy-in with game reference
        self.wallet.deduct_points(
            user_id,
            game.buy_in,
            TransactionType.GAME_BUYIN,
            f"Buy-in for {metadata['name']}",
            game.id,
            commit=False
        )

        # Add player to game - unique constraint on (game_id, position) prevents race
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
        except IntegrityError as e:
            self.db.rollback()
            # Check which constraint failed
            if "uq_game_position" in str(e):
                raise ValueError("Game is full")
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

    async def apply_action(self, game_id: int, user_id: int, action_type: str, amount: int = 0, turn_seq: int = 0) -> Game:
        game = self.db.query(Game).filter(Game.id == game_id).with_for_update().first()
        if not game:
            raise ValueError("Game not found")

        if game.status != GameStatus.IN_PROGRESS:
            raise ValueError("Game is not in progress")

        game_class = get_game_class(game.game_type.value)
        players_data = self._get_players_data(game_id)
        game_instance = game_class.from_json(game.state, game.buy_in, players_data)

        state_dict = game_instance.state.to_dict()
        metadata = state_dict.get("metadata", {})
        current_turn_seq = metadata.get("turn_seq", 0)

        # Race safety: reject stale turn_seq
        if turn_seq and turn_seq != current_turn_seq:
            raise ValueError("Turn expired")

        # Lazy deadline check - apply timeout if expired
        timeout_applied = self._check_and_apply_timeout(game, game_instance)
        if timeout_applied:
            # Re-read state after timeout
            state_dict = game_instance.state.to_dict()
            metadata = state_dict.get("metadata", {})
            players_list = state_dict.get("players", [])
            cp_idx = state_dict.get("current_player", 0)
            if cp_idx < len(players_list):
                current_player_id = players_list[cp_idx]["id"]
            else:
                current_player_id = None
            if current_player_id is not None and current_player_id != user_id:
                self.db.commit()
                self.db.refresh(game)
                await manager.broadcast_game_state(game_id, {"type": "state_changed"})
                raise ValueError("Turn expired")

        # Verify it's user's turn (after potential timeout)
        current_player_id = state_dict["players"][state_dict["current_player"]]["id"]
        if current_player_id != user_id:
            raise ValueError("Not your turn")

        try:
            # Handle double down - charge additional bet from wallet
            if action_type == "double" and game.game_type == GameType.BLACKJACK:
                player_state = next((p for p in state_dict["players"] if p["id"] == user_id), None)
                if player_state:
                    additional_bet = player_state["bet"]
                    if not self.wallet.can_afford(user_id, additional_bet):
                        raise ValueError("Insufficient points to double down")
                    self.wallet.deduct_points(
                        user_id,
                        additional_bet,
                        TransactionType.GAME_BUYIN,
                        "Game Double",
                        game_id,
                        commit=False
                    )
                    session = self.db.query(GameSession).filter(
                        and_(GameSession.game_id == game.id, GameSession.user_id == user_id)
                    ).first()
                    if session:
                        session.buy_in = player_state["bet"]

            # Reset timeout strikes on manual action
            if "timeout_strikes" in metadata and str(user_id) in metadata["timeout_strikes"]:
                metadata["timeout_strikes"][str(user_id)] = 0

            # Apply action
            action = GameAction(type=action_type, amount=amount)
            game_instance.apply_action(user_id, action)

            # Check if finished
            if game_instance.is_finished():
                game.turn_deadline = None
                self._finish_game(game, game_instance)
            else:
                # Set new turn deadline for next player
                self._set_turn_deadline(game, game_instance, advance_seq=True)
                game.state = game_instance.to_json()
                game.pot = game_instance.state.pot

            self.db.commit()
            self.db.refresh(game)
        except Exception:
            self.db.rollback()
            raise

        # Broadcast update
        await manager.broadcast_state_changed(game_id)

        return game

    def _finish_game(self, game: Game, game_instance) -> None:
        if game.status != GameStatus.IN_PROGRESS:
            return  # Guard against double settlement

        from datetime import datetime
        now = datetime.utcnow()
        game.status = GameStatus.FINISHED
        game.finished_at = now
        game.turn_deadline = None
        game.state = game_instance.to_json()
        # Pot is distributed to players, so reset to 0
        game.pot = 0

        winner_id = game_instance.get_winner()
        if winner_id:
            game.winner_id = winner_id

        payouts = game_instance.get_payouts()

        if game.game_type == GameType.BLACKJACK:
            for player in game_instance.state.players:
                player_id = player["id"]
                payout = payouts.get(player_id, 0)
                status = player.get("result", player.get("status"))

                session = self.db.query(GameSession).filter(
                    and_(GameSession.game_id == game.id, GameSession.user_id == player_id)
                ).first()
                if session:
                    session.payout = payout
                    session.result = status
                    session.left_at = now

                if payout > 0:
                    if status == "blackjack":
                        self.wallet.add_points(
                            player_id,
                            payout,
                            TransactionType.GAME_WIN,
                            "Blackjack",
                            game.id,
                            commit=False
                        )
                    elif status == "win":
                        self.wallet.add_points(
                            player_id,
                            payout,
                            TransactionType.GAME_WIN,
                            "Game Win",
                            game.id,
                            commit=False
                        )
                    elif status == "push":
                        self.wallet.add_points(
                            player_id,
                            payout,
                            TransactionType.REFUND,
                            "Game Push",
                            game.id,
                            commit=False
                        )

                user = self.db.query(User).filter(User.id == player_id).first()
                if user:
                    user.total_games += 1
                    if status in ("win", "blackjack"):
                        user.total_wins += 1

        elif game.game_type == GameType.POKER:
            # Poker: each player gets remaining chips + pot share
            # Determine result per player: win (net > 0), loss (net < 0), push (net == 0)
            for player_state in game_instance.state.players:
                player_id = player_state["id"]
                payout = payouts.get(player_id, 0)
                buy_in = player_state.get("chips", 0) + player_state.get("total_bet", 0)
                # Net = payout - buy_in (but buy_in was already debited at join)
                # So we compare payout to original buy_in
                session = self.db.query(GameSession).filter(
                    and_(GameSession.game_id == game.id, GameSession.user_id == player_id)
                ).first()
                if session:
                    session.payout = payout
                    net = payout - session.buy_in
                    if net > 0:
                        session.result = "win"
                    elif net < 0:
                        session.result = "loss"
                    else:
                        session.result = "push"
                    session.left_at = now

                if payout > 0:
                    self.wallet.add_points(
                        player_id,
                        payout,
                        TransactionType.GAME_WIN,
                        f"Poker settlement",
                        game.id,
                        commit=False
                    )

                user = self.db.query(User).filter(User.id == player_id).first()
                if user:
                    user.total_games += 1
                    if payout > session.buy_in:
                        user.total_wins += 1

    def get_game(self, game_id: int, user_id: Optional[int] = None) -> Optional[Game]:
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            return None

        # Lazy deadline check for in_progress games
        if game.status == GameStatus.IN_PROGRESS:
            game_class = get_game_class(game.game_type.value)
            players_data = self._get_players_data(game_id)
            game_instance = game_class.from_json(game.state, game.buy_in, players_data)
            try:
                self._check_and_apply_timeout(game, game_instance)
            except Exception as e:
                import logging
                logging.warning(f"get_game timeout check error for game {game_id}: {e}")
                game.turn_deadline = None
            try:
                self.db.commit()
            except Exception:
                self.db.rollback()

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
        game.started_at = self._now_utc().replace(tzinfo=None)

        # Initialize game state for play
        players = self._get_players_data(game_id)
        game_class = get_game_class(game.game_type.value)
        game_instance = game_class(game.buy_in, players)
        game_instance.start_game()

        # Initialize turn_seq in metadata
        state_dict = game_instance.state.to_dict()
        if "metadata" not in state_dict:
            state_dict["metadata"] = {}
        state_dict["metadata"]["turn_seq"] = 1
        state_dict["metadata"]["timeout_strikes"] = {}
        game_instance.state = game_instance.state.from_dict(state_dict)

        # Set initial turn deadline
        self._set_turn_deadline(game, game_instance, advance_seq=False)

        try:
            if game_instance.is_finished():
                self._finish_game(game, game_instance)
            else:
                game.state = game_instance.to_json()
                game.pot = game_instance.state.pot

            self.db.commit()
            self.db.refresh(game)
        except Exception:
            self.db.rollback()
            raise

        # Broadcast updates
        await manager.broadcast_game_state(game_id, {"type": "state_changed"})
        await manager.broadcast_lobby_update({"type": "lobby_changed", "game_id": game_id})

        return game

    async def rematch_game(self, game_id: int, user_id: int) -> Game:
        """Create or join a rematch of a finished game. Idempotent and race-safe."""
        import json
        from sqlalchemy.exc import OperationalError

        # Lock the finished game row for update (race-safe)
        game = self.db.query(Game).filter(Game.id == game_id).with_for_update().first()
        if not game:
            raise ValueError("Game not found")

        if game.status != GameStatus.FINISHED:
            raise ValueError("Game is not finished")

        # Verify user was a player in this game
        session = self.db.query(GameSession).filter(
            GameSession.game_id == game_id,
            GameSession.user_id == user_id
        ).first()
        if not session:
            raise ValueError("Not a player in this game")

        # Parse state to check for existing next_game_id
        state_dict = {}
        if game.state:
            if isinstance(game.state, dict):
                state_dict = game.state
            elif isinstance(game.state, str):
                try:
                    state_dict = json.loads(game.state)
                except:
                    state_dict = {}

        metadata = state_dict.get("metadata", {})
        next_game_id = metadata.get("next_game_id")

        # If next_game_id exists, try to join that game
        if next_game_id:
            next_game = self.db.query(Game).filter(Game.id == next_game_id).first()
            if next_game:
                # Check if user is already in the next game
                existing_session = self.db.query(GameSession).filter(
                    GameSession.game_id == next_game_id,
                    GameSession.user_id == user_id
                ).first()
                if existing_session:
                    # Already in the rematch game, return it
                    self.db.refresh(next_game)
                    return next_game

                # Check if next game is still joinable
                if next_game.status == GameStatus.WAITING:
                    next_metadata = get_game_metadata(next_game.game_type.value)
                    current_players = self.db.query(GameSession).filter(
                        GameSession.game_id == next_game_id
                    ).count()
                    if current_players < next_metadata["max_players"]:
                        # Check buy-in
                        if not self.wallet.can_afford(user_id, next_game.buy_in):
                            raise ValueError("Insufficient points for buy-in")

                        # Join the existing rematch game
                        await self.join_game(next_game_id, user_id)
                        self.db.refresh(next_game)
                        return next_game

            # Next game not joinable (started, full, cancelled) - return 409 error
            raise ValueError("Rematch game already started or full. Please create a new game.")

        # Check buy-in before creating new game
        if not self.wallet.can_afford(user_id, game.buy_in):
            raise ValueError("Insufficient points for buy-in")

        # Create new rematch game with same type and buy-in
        # Make the requester the host
        new_game = await self.create_game(user_id, game.game_type.value, game.buy_in)

        # Store next_game_id in the finished game's state metadata
        if "metadata" not in state_dict:
            state_dict["metadata"] = {}
        state_dict["metadata"]["next_game_id"] = new_game.id
        game.state = json.dumps(state_dict)
        self.db.commit()

        # Broadcast lobby update for new game
        await manager.broadcast_lobby_update({"type": "lobby_changed", "game_id": new_game.id})

        return new_game