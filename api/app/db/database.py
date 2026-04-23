from sqlmodel import SQLModel, create_engine, Session
from app.core.config import config

engine = create_engine(config.database_url)

def create_tables():
    """Create all tables if they don't exist yet."""
    SQLModel.metadata.create_all(engine)

def get_session():
    """
    FastAPI dependency — gives a route a database session
    and closes it automatically when the request is done.
    """
    with Session(engine) as session:
        yield session
