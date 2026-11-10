# syntax=docker/dockerfile:1

FROM python:3.13@sha256:ecbe213fb818d557fd19db4078244339e2e2e52874f9c81052d3094ea114d797

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
    uv sync --frozen --no-install-workspace --package app --no-dev

# The app runs as a normal user. The entrypoint fixes ownership of the data
# volume (which may predate this change), then drops privileges.
RUN groupadd --gid 1000 app && \
    useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash app && \
    mkdir -p /app/data && chown -R app:app /app/data

COPY ./backend /app/backend/
COPY backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Install the backend package itself
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --package app --no-dev

WORKDIR /app/backend/

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bash", "scripts/start.sh"]
