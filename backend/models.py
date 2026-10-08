from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Enum, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from database import Base


class GameType(PyEnum):
    POKER = "poker"
    BLACKJACK = "blackjack"
    # Add new games here


class GameStatus(PyEnum):
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class TransactionType(PyEnum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    GAME_BUYIN = "game_buyin"
    GAME_WIN = "game_win"
    GAME_LOSS = "game_loss"
    DAILY_BONUS = "daily_bonus"
    REFUND = "refund"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    total_games: Mapped[int] = mapped_column(Integer, default=0)
    total_wins: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_daily_bonus: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    games_as_player1: Mapped[list["Game"]] = relationship("Game", foreign_keys="Game.player1_id", back_populates="player1")
    games_as_player2: Mapped[list["Game"]] = relationship("Game", foreign_keys="Game.player2_id", back_populates="player2")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    game_sessions: Mapped[list["GameSession"]] = relationship("GameSession", back_populates="user", cascade="all, delete-orphan")


class Game(Base):
    """Game instance - a match between players"""
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_type: Mapped[GameType] = mapped_column(Enum(GameType), nullable=False, index=True)
    status: Mapped[GameStatus] = mapped_column(Enum(GameStatus), default=GameStatus.WAITING, nullable=False)
    buy_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pot: Mapped[int] = mapped_column(Integer, default=0)
    winner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    player1_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    player2_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Game-specific state (JSON)
    state: Mapped[str] = mapped_column(String, default="{}")  # JSON serialized game state

    # Relationships
    player1: Mapped["User"] = relationship("User", foreign_keys=[player1_id], back_populates="games_as_player1")
    player2: Mapped[Optional["User"]] = relationship("User", foreign_keys=[player2_id], back_populates="games_as_player2")
    winner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[winner_id])
    sessions: Mapped[list["GameSession"]] = relationship("GameSession", back_populates="game", cascade="all, delete-orphan")


class GameSession(Base):
    """Player's participation in a game (for multi-player games, history)"""
    __tablename__ = "game_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    game_id: Mapped[int] = mapped_column(Integer, ForeignKey("games.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)  # seat position
    buy_in: Mapped[int] = mapped_column(Integer, default=0)
    payout: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # win/loss/draw
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    game: Mapped["Game"] = relationship("Game", back_populates="sessions")
    user: Mapped["User"] = relationship("User", back_populates="game_sessions")

    __table_args__ = (
        UniqueConstraint('game_id', 'user_id', name='uq_game_user'),
    )


class Transaction(Base):
    """Point/wallet transaction log"""
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # positive = credit, negative = debit
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=True)
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # game_id, etc.
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="transactions")

    __table_args__ = (
        Index("ix_transactions_user_created", "user_id", "created_at"),
    )