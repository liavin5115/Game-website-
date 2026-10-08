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
                   description: str = "", reference_id: Optional[int] = None) -> Transaction:
        """Add points (positive amount)"""
        if amount <= 0:
            raise ValueError("Amount must be positive for add_points")
        return self._create_transaction(user_id, amount, tx_type, description, reference_id)

    def deduct_points(self, user_id: int, amount: int, tx_type: TransactionType,
                      description: str = "", reference_id: Optional[int] = None) -> Transaction:
        """Deduct points (positive amount, stored as negative)"""
        if amount <= 0:
            raise ValueError("Amount must be positive for deduct_points")
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user or user.points < amount:
            raise ValueError("Insufficient points")
        return self._create_transaction(user_id, -amount, tx_type, description, reference_id)

    def _create_transaction(self, user_id: int, amount: int, tx_type: TransactionType,
                            description: str, reference_id: Optional[int]) -> Transaction:
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
        self.db.commit()
        self.db.refresh(tx)
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
        """Get summary stats for dashboard"""
        txs = self.db.query(Transaction).filter(Transaction.user_id == user_id).all()
        deposits = sum(t.amount for t in txs if t.amount > 0 and t.type == TransactionType.DEPOSIT)
        withdrawals = sum(-t.amount for t in txs if t.amount < 0 and t.type == TransactionType.WITHDRAWAL)
        game_wins = sum(t.amount for t in txs if t.amount > 0 and t.type == TransactionType.GAME_WIN)
        game_losses = sum(-t.amount for t in txs if t.amount < 0 and t.type == TransactionType.GAME_LOSS)

        return {
            "total_deposited": deposits,
            "total_withdrawn": withdrawals,
            "total_won": game_wins,
            "total_lost": game_losses,
            "net": game_wins - game_losses + deposits - withdrawals,
        }