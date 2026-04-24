from sqlmodel import SQLModel, create_engine
from app.core.config import config

engine = create_engine(config.database_url)


def create_tables():
    """Create all tables if they don't exist yet."""
    SQLModel.metadata.create_all(engine)
