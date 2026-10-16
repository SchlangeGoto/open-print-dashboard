# syntax=docker/dockerfile:1

FROM python:3.13

ENV PYTHONUNBUFFERED=1

# Install uv
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#installing-uv
COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /uvx /bin/

# Compile bytecode
ENV UV_COMPILE_BYTECODE=1

# uv Cache
ENV UV_LINK_MODE=copy

WORKDIR /app/

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Workspace root + backend project metadata (for dependency resolution)
COPY pyproject.toml uv.lock /app/
COPY ./backend/pyproject.toml /app/backend/

# Install dependencies only (not the workspace members themselves)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-workspace --package app

COPY ./backend /app/backend/

# Install the backend package itself
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --package app

WORKDIR /app/backend/

CMD ["bash", "scripts/start.sh"]
