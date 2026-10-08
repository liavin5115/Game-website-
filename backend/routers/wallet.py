"""Wallet/Points endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from auth import get_current_user
from models import User, Transaction, TransactionType
from services.wallet import WalletService
from config import get_settings

router = APIRouter(prefix="/wallet", tags=["wallet"])
settings = get_settings()


class BalanceResponse(BaseModel):
    points: int


class TransactionResponse(BaseModel):
    id: int
    type: str
    amount: int
    balance_after: int
    description: str | None
    reference_id: int | None
    created_at: str


class DailyBonusResponse(BaseModel):
    claimed: bool
    amount: int
    new_balance: int
    message: str


class SummaryResponse(BaseModel):
    total_deposited: int
    total_withdrawn: int
    total_won: int
    total_lost: int
    net: int


@router.get("/balance", response_model=BalanceResponse)
def get_balance(current_user: User = Depends(get_current_user)):
    return {"points": current_user.points}


@router.get("/transactions", response_model=list[TransactionResponse])
def get_transactions(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wallet = WalletService(db)
    txs = wallet.get_transactions(current_user.id, limit, offset)
    return [
        {
            "id": t.id,
            "type": t.type.value,
            "amount": t.amount,
            "balance_after": t.balance_after,
            "description": t.description,
            "reference_id": t.reference_id,
            "created_at": t.created_at.isoformat(),
        }
        for t in txs
    ]


@router.post("/daily-bonus", response_model=DailyBonusResponse)
def claim_daily_bonus(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wallet = WalletService(db)
    tx = wallet.claim_daily_bonus(current_user.id)
    if tx:
        return {
            "claimed": True,
            "amount": tx.amount,
            "new_balance": tx.balance_after,
            "message": f"Claimed {tx.amount} points!"
        }
    return {
        "claimed": False,
        "amount": 0,
        "new_balance": current_user.points,
        "message": "Already claimed today. Come back tomorrow!"
    }


@router.get("/summary", response_model=SummaryResponse)
def get_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wallet = WalletService(db)
    return wallet.get_transaction_summary(current_user.id)