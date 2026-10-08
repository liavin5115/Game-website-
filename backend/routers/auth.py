"""Auth endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from database import get_db
from models import User, TransactionType
from auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user
)
from services.wallet import WalletService

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    points: int
    total_games: int
    total_wins: int


@router.post("/register", response_model=TokenResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    # Check existing
    if db.query(User).filter(User.username == request.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    user = User(
        username=request.username,
        email=request.email,
        hashed_password=get_password_hash(request.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Give initial points
    wallet = WalletService(db)
    wallet.add_points(
        user.id,
        wallet.get_balance(user.id),  # This will add the default points
        TransactionType.DEPOSIT,
        description="Welcome bonus"
    )

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "user": user_to_dict(user)}


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "user": user_to_dict(user)}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return user_to_dict(current_user)


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "points": user.points,
        "total_games": user.total_games,
        "total_wins": user.total_wins,
    }