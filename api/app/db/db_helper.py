from sqlmodel import Session

from app.db.database import engine
from app.db.models import Settings


def get_credentials() -> dict:
    with Session(engine) as session:
        print(session.get(Settings, "bambu_cloud_email"))
        return {
            "email": session.get(Settings, "bambu_cloud_email").value,
            "password": session.get(Settings, "bambu_cloud_password").value,
        }


def get_cloud_token_db() -> str | None:
    with Session(engine) as session:
        setting = session.get(Settings, "bambu_cloud_token")
        return setting.value if setting else None

def save_token(token: str) -> bool:
    with Session(engine) as session:
        session.add(Settings(key="bambu_cloud_token", value=token))
        session.commit()
    return True

def save_credentials(email: str, password: str) -> bool:
    with Session(engine) as session:
        session.add(Settings(key="bambu_cloud_email", value=email))
        session.add(Settings(key="bambu_cloud_password", value=password))
        session.commit()
    return True

