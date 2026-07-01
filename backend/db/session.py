import os
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session, declarative_base

# Default to SQLite database for easy local execution and staging integration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nutriorder.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """
    Dependency helper providing scoped DB sessions per request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
