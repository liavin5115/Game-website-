from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from config import get_settings, BASE_DIR

settings = get_settings()

db_url = settings.DATABASE_URL
if db_url.startswith("sqlite:///./") or db_url == "sqlite:///game_platform.db":
    db_rel = db_url.replace("sqlite:///./", "").replace("sqlite:///", "")
    db_path = (BASE_DIR / db_rel).resolve().as_posix()
    db_url = f"sqlite:///{db_path}"

# Use NullPool for SQLite to avoid connection pool exhaustion
# SQLite doesn't handle concurrent connections well with pooling
engine = create_engine(
    db_url,
    connect_args={"check_same_thread": False} if "sqlite" in db_url else {},
    poolclass=NullPool,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import models  # noqa
    Base.metadata.create_all(bind=engine)