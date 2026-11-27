import logging
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any

import requests
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel

from app.api.deps import get_current_active_superuser
from app.core.config import settings

logger = logging.getLogger("uvicorn.error")

router = APIRouter(
    prefix="/system",
    tags=["system"],
    dependencies=[Depends(get_current_active_superuser)],
)

_TAG_RE = re.compile(r"^\d+\.\d+\.\d+$")
_latest_cache: tuple[float | None, str | None, str | None] = (None, None, None)
_LATEST_TTL_SECONDS = 300


class UpdateStatus(SQLModel):
    current_version: str
    latest_version: str | None = None
    update_available: bool = False
    release_url: str | None = None
    updater_available: bool = False
    state: str = "unavailable"
    message: str | None = None
    updated_at: str | None = None


class UpdateRequest(SQLModel):
    tag: str


def _version_tuple(value: str) -> tuple[int, ...] | None:
    if not _TAG_RE.fullmatch(value):
        return None
    return tuple(int(part) for part in value.split("."))


def _latest_release() -> tuple[str | None, str | None]:
    global _latest_cache
    now = time.monotonic()
    cached_at, tag, url = _latest_cache
    if cached_at is not None and now - cached_at < _LATEST_TTL_SECONDS:
        return tag, url

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "OpenPrintDashboard",
    }
    if settings.UPDATE_GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.UPDATE_GITHUB_TOKEN}"
    try:
        response = requests.get(
            f"https://api.github.com/repos/{settings.UPDATE_REPO}/releases/latest",
            headers=headers,
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
        tag = str(data.get("tag_name") or "").lstrip("v") or None
        url = data.get("html_url")
        if not isinstance(url, str) or not url.startswith("https://github.com/"):
            url = None
        if tag and not _TAG_RE.fullmatch(tag):
            tag = None
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Could not check the latest release: %s", exc)
        tag, url = None, None
    _latest_cache = (now, tag, url)
    return tag, url


def _protocol_dir() -> Path:
    return Path(settings.UPDATER_DIR)


def _reserve_queue(request_dir: Path) -> None:
    """Create the queue reservation atomically.

    ``O_EXCL`` makes the create the reservation, so two requests cannot both
    pass a "nothing queued yet" check and then publish. The worker removes the
    file once it has consumed the request.
    """
    fd = os.open(request_dir / "queued", os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)


def _read_updater_status() -> dict[str, str]:
    directory = _protocol_dir()
    if not (directory / "ready").exists():
        return {}
    heartbeat = directory / "heartbeat"
    try:
        if time.time() - heartbeat.stat().st_mtime > 60:
            return {
                "state": "stale",
                "message": "The updater sidecar is not responding",
            }
        status: dict[str, str] = {}
        for line in (directory / "status").read_text().splitlines():
            key, _, value = line.partition("=")
            if key:
                status[key] = value
        return status
    except OSError:
        return {}


@router.get("/update", response_model=UpdateStatus)
def read_update_status() -> Any:
    current = settings.APP_VERSION
    latest, url = _latest_release()
    status = _read_updater_status()
    updater_available = bool(status) and status.get("state") != "stale"
    available = False
    latest_tuple = _version_tuple(latest) if latest else None
    current_tuple = _version_tuple(current)
    if latest_tuple is not None and current_tuple is not None:
        available = latest_tuple > current_tuple
    return UpdateStatus(
        current_version=current,
        latest_version=latest,
        update_available=available,
        release_url=url,
        updater_available=updater_available,
        state=status.get("state", "idle" if status else "unavailable"),
        message=status.get("message") or None,
        updated_at=status.get("updated_at") or None,
    )


@router.post("/update", response_model=UpdateStatus)
def request_update(payload: UpdateRequest) -> Any:
    tag = payload.tag.strip().lstrip("v")
    if not _TAG_RE.fullmatch(tag):
        raise HTTPException(status_code=422, detail="Release tag must be X.Y.Z")
    protocol = _protocol_dir()
    updater = _read_updater_status()
    if not updater or updater.get("state") == "stale":
        raise HTTPException(
            status_code=503,
            detail="The updater sidecar is not installed or not responding",
        )
    if updater.get("state") == "blocked":
        # A stuck recovery journal has to be cleared by hand. Queuing now would
        # start an update as soon as the operator clears it, without asking.
        raise HTTPException(
            status_code=409,
            detail="The updater needs manual intervention before it accepts another update",
        )
    current_version = _version_tuple(settings.APP_VERSION)
    requested_version = _version_tuple(tag)
    if current_version is not None and requested_version is not None:
        if requested_version < current_version:
            raise HTTPException(
                status_code=409,
                detail="Downgrades are not supported from the dashboard",
            )
    request_dir = protocol / "request"
    request_file = request_dir / "request"
    queue_file = request_dir / "queued"
    if request_file.exists() or queue_file.exists() or (protocol / "lock").exists():
        raise HTTPException(status_code=409, detail="An update is already queued")
    try:
        _reserve_queue(request_dir)
    except FileExistsError as exc:
        raise HTTPException(
            status_code=409, detail="An update is already queued"
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=503, detail="Could not queue the update"
        ) from exc
    try:
        fd, tmp_name = tempfile.mkstemp(dir=request_dir, prefix=".request.")
    except OSError as exc:
        queue_file.unlink(missing_ok=True)
        raise HTTPException(
            status_code=503, detail="Could not queue the update"
        ) from exc
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w") as tmp:
            tmp.write(tag + "\n")
            tmp.flush()
            os.fsync(tmp.fileno())
        # A hard link publishes the finished file atomically and fails if a
        # request already exists, so the worker never reads a partial tag.
        os.link(tmp_path, request_file)
    except FileExistsError as exc:
        queue_file.unlink(missing_ok=True)
        raise HTTPException(
            status_code=409, detail="An update is already queued"
        ) from exc
    except OSError as exc:
        queue_file.unlink(missing_ok=True)
        raise HTTPException(
            status_code=503, detail="Could not queue the update"
        ) from exc
    finally:
        tmp_path.unlink(missing_ok=True)
    logger.warning("Queued OpenPrintDash update to %s", tag)
    status = read_update_status()
    status.state = "queued"
    status.message = f"Update to {tag} queued"
    return status
