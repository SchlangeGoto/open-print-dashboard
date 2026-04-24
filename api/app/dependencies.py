from sqlmodel import Session

from app.db.database import engine


def get_session():
    """
    FastAPI dependency — gives a route a database session
    and closes it automatically when the request is done.
    """
    with Session(engine) as session:
        yield session
