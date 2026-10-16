import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.bambu_exceptions import (
    CloudflareError,
    CodeExpiredError,
    CodeIncorrectError,
    CodeRequiredError,
    NotLoggedInError,
)
from app.core.config import settings
from app.core.db import engine
from app.services.printer_service import printer_service

logger = logging.getLogger("uvicorn.error")


async def wait_for_db(max_attempts: int = 30, delay_seconds: float = 2.0) -> None:
    """Wait for the database to accept connections before starting up."""
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < max_attempts:
                await asyncio.sleep(delay_seconds)
    if last_error is not None:
        raise last_error


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    await wait_for_db()
    printer_service.configure_and_connect()
    yield
    printer_service.client.disconnect()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_HOST],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(CloudflareError)
async def cloudflare_error_handler(
    _request: Request, exc: CloudflareError
) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(CodeRequiredError)
async def code_required_error_handler(
    _request: Request, exc: CodeRequiredError
) -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(exc)})


@app.exception_handler(CodeExpiredError)
async def code_expired_error_handler(
    _request: Request, exc: CodeExpiredError
) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(CodeIncorrectError)
async def code_incorrect_error_handler(
    _request: Request, exc: CodeIncorrectError
) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(NotLoggedInError)
async def not_logged_in_error_handler(
    _request: Request, exc: NotLoggedInError
) -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": str(exc)})


@app.exception_handler(requests.RequestException)
async def upstream_error_handler(
    request: Request, _exc: requests.RequestException
) -> JSONResponse:
    logger.exception(
        "Upstream request failed on %s %s", request.method, request.url.path
    )
    return JSONResponse(status_code=502, content={"detail": "Upstream request failed"})


app.include_router(api_router, prefix=settings.API_V1_STR)
