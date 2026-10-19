"""Wallet/Point service - all point transactions go through here"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import User, Transaction, TransactionType
from config import get_settings

settings = get_settings()


class WalletService:
    def __init__(self, db: Session):
        self.db = db

    def get_balance(self, user_id: int) -> int:
        user = self.db.query(User).filter(User.id == user_id).first()
        return user.points if user else 0

    def add_points(self, user_id: int, amount: int, tx_type: TransactionType,
                   description: str = "", reference_id: Optional[int] = None,
                   commit: bool = True) -> Transaction:
        """Add points (positive amount)"""
        if amount <= 0:
            raise ValueError("Amount must be positive for add_points")
        return self._create_transaction(user_id, amount, tx_type, description, reference_id, commit=commit)

    def deduct_points(self, user_id: int, amount: int, tx_type: TransactionType,
                      description: str = "", reference_id: Optional[int] = None,
                      commit: bool = True) -> Transaction:
        """Deduct points (positive amount, stored as negative)"""
        if amount <= 0:
            raise ValueError("Amount must be positive for deduct_points")
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user or user.points < amount:
            raise ValueError("Insufficient points")
        return self._create_transaction(user_id, -amount, tx_type, description, reference_id, commit=commit)

    def _create_transaction(self, user_id: int, amount: int, tx_type: TransactionType,
                            description: str, reference_id: Optional[int],
                            commit: bool = True) -> Transaction:
        user = self.db.query(User).filter(User.id == user_id).with_for_update().first()
        if not user:
            raise ValueError("User not found")

        new_balance = user.points + amount
        if new_balance < 0:
            raise ValueError("Insufficient points")

        user.points = new_balance
        user.updated_at = datetime.utcnow()

        tx = Transaction(
            user_id=user_id,
            type=tx_type,
            amount=amount,
            balance_after=new_balance,
            description=description,
            reference_id=reference_id,
        )
        self.db.add(tx)
        if commit:
            self.db.commit()
            self.db.refresh(tx)
        else:
            self.db.flush()
        return tx

    def can_afford(self, user_id: int, amount: int) -> bool:
        user = self.db.query(User).filter(User.id == user_id).first()
        return user is not None and user.points >= amount

    def claim_daily_bonus(self, user_id: int) -> Optional[Transaction]:
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        today = date.today()
        if user.last_daily_bonus and user.last_daily_bonus.date() == today:
            return None  # Already claimed today

        user.last_daily_bonus = datetime.utcnow()
        return self.add_points(
            user_id,
            settings.DAILY_BONUS,
            TransactionType.DAILY_BONUS,
            f"Daily login bonus ({settings.DAILY_BONUS} points)"
        )

    def get_transactions(self, user_id: int, limit: int = 50, offset: int = 0) -> list[Transaction]:
        return (
            self.db.query(Transaction)
            .filter(Transaction.user_id == user_id)
            .order_by(Transaction.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

    def get_transaction_summary(self, user_id: int) -> dict:
        """Get summary stats for finished games using SQL aggregates"""
        from sqlalchemy import func, case
        from models import Game, GameSession, GameStatus

        row = self.db.query(
            func.count(GameSession.id).label("games_played"),
            func.sum(case((GameSession.payout > GameSession.buy_in, 1), else_=0)).label("wins"),
            func.sum(case((GameSession.payout < GameSession.buy_in, 1), else_=0)).label("losses"),
            func.sum(case((GameSession.payout == GameSession.buy_in, 1), else_=0)).label("pushes"),
            func.coalesce(func.sum(case((GameSession.payout > GameSession.buy_in, GameSession.payout - GameSession.buy_in), else_=0)), 0).label("total_won"),
            func.coalesce(func.sum(case((GameSession.payout < GameSession.buy_in, GameSession.buy_in - GameSession.payout), else_=0)), 0).label("total_lost"),
            func.coalesce(func.max(case((GameSession.payout > GameSession.buy_in, GameSession.payout - GameSession.buy_in), else_=0)), 0).label("biggest_win"),
        ).join(Game, GameSession.game_id == Game.id)\
         .filter(GameSession.user_id == user_id, Game.status == GameStatus.FINISHED)\
         .first()

        games_played = int(row.games_played or 0) if row else 0
        wins = int(row.wins or 0) if row else 0
        losses = int(row.losses or 0) if row else 0
        pushes = int(row.pushes or 0) if row else 0
        total_won = int(row.total_won or 0) if row else 0
        total_lost = int(row.total_lost or 0) if row else 0
        biggest_win = int(row.biggest_win or 0) if row else 0
        net = total_won - total_lost
        win_rate = int(round((wins / games_played) * 100)) if games_played > 0 else 0

        return {
            "games_played": games_played,
            "wins": wins,
            "losses": losses,
            "pushes": pushes,
            "win_rate": win_rate,
            "total_won": total_won,
            "total_lost": total_lost,
            "net": net,
            "biggest_win": biggest_win,
        }