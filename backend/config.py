from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    APP_NAME: str = "Game Platform"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./game_platform.db"

    # Auth
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Points
    INITIAL_POINTS: int = 1000
    DAILY_BONUS: int = 100

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]

    class Config:
        env_file = str(BASE_DIR / ".env")
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()