import logging
from typing import Any

import requests
from sqlmodel import Session, col, delete, select

from app.core.db import engine
from app.models import PushToken, User

logger = logging.getLogger("uvicorn.error")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH_SIZE = 100
TIMEOUT_SECONDS = 8


def send_push_to_all(
    *, title: str, body: str, data: dict[str, Any] | None = None
) -> int:
    """Send a notification to every registered device.

    The dashboard is single-tenant, so every active account may see a print.
    Failures are logged and never block the print path.
    """
    try:
        with Session(engine) as session:
            tokens = session.exec(
                select(PushToken.token)
                .join(User, User.id == PushToken.user_id)
                .where(User.is_active)
            ).all()
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not load push tokens: %s", exc)
        return 0
    if not tokens:
        return 0

    sent = 0
    for start in range(0, len(tokens), BATCH_SIZE):
        chunk = tokens[start : start + BATCH_SIZE]
        messages = [
            {
                "to": token,
                "title": title,
                "body": body,
                "sound": "default",
                "channelId": "default",
                "data": data or {},
            }
            for token in chunk
        ]
        response = None
        for attempt in range(2):
            try:
                response = requests.post(
                    EXPO_PUSH_URL, json=messages, timeout=TIMEOUT_SECONDS
                )
                response.raise_for_status()
                break
            except (requests.RequestException, ValueError) as exc:
                if attempt == 0:
                    continue
                logger.warning("Could not send %s push messages: %s", len(chunk), exc)
        if response is None:
            continue
        try:
            tickets = response.json().get("data") or []
        except ValueError:
            continue

        dead: list[str] = []
        for token, ticket in zip(chunk, tickets, strict=False):
            if ticket.get("status") == "ok":
                sent += 1
                continue
            details = ticket.get("details") or {}
            logger.warning(
                "Expo rejected a push message: %s", details.get("error", ticket)
            )
            if details.get("error") == "DeviceNotRegistered":
                dead.append(token)
        if dead:
            with Session(engine) as session:
                session.execute(delete(PushToken).where(col(PushToken.token).in_(dead)))
                session.commit()
    return sent


def notify_print_finished(*, title: str, failed: bool) -> None:
    send_push_to_all(
        title="Print failed" if failed else "Print finished",
        body=title,
        data={"type": "print", "status": "failed" if failed else "finished"},
    )


def notify_spool_loaded(*, filament: str, printer: str, spool_id: str) -> None:
    send_push_to_all(
        title="Spool loaded",
        body=f"{filament} is loaded in {printer}",
        data={"type": "spool", "spool_id": spool_id},
    )
