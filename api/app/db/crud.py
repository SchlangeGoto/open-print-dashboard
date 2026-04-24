from sqlmodel import Session

from app.db.database import engine
from app.db.models import Settings


def get_credentials() -> dict:
    with Session(engine) as session:
        email_setting = session.get(Settings, "bambu_cloud_email")
        password_setting = session.get(Settings, "bambu_cloud_password")
        return {
            "email": email_setting.value if email_setting else None,
            "password": password_setting.value if password_setting else None,
        }


def get_cloud_token() -> str | None:
    with Session(engine) as session:
        setting = session.get(Settings, "bambu_cloud_token")
        return setting.value if setting else None


def save_token(token: str) -> None:
    with Session(engine) as session:
        setting = session.get(Settings, "bambu_cloud_token")
        if setting:
            setting.value = token
        else:
            session.add(Settings(key="bambu_cloud_token", value=token))
        session.commit()


def save_credentials(email: str, password: str) -> None:
    with Session(engine) as session:
        email_setting = session.get(Settings, "bambu_cloud_email")
        if email_setting:
            email_setting.value = email
        else:
            session.add(Settings(key="bambu_cloud_email", value=email))

        password_setting = session.get(Settings, "bambu_cloud_password")
        if password_setting:
            password_setting.value = password
        else:
            session.add(Settings(key="bambu_cloud_password", value=password))
        session.commit()
