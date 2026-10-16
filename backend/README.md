# OpenPrintDashboard - Backend

The backend is a FastAPI application following the structure of the
[full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template).

## Requirements

- [uv](https://docs.astral.sh/uv/)
- PostgreSQL (run with `docker compose up -d db`)
- Mailpit (optional, for emails — `docker compose up -d mailpit`)

## Local Development

From this directory:

```bash
uv sync
uv run bash scripts/prestart.sh   # run migrations + create initial data
uv run fastapi dev
```

The API is at <http://localhost:8000> and the OpenAPI docs at <http://localhost:8000/docs>.
All endpoints live under `/api/v1`.

## Layout

| Path | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, CORS, exception handlers, lifespan (starts MQTT) |
| `app/api/deps.py` | DB session + current-user dependencies |
| `app/api/routes/` | Route modules (`login`, `users`, `filaments`, `spools`, `prints`, `printers`, `bambu`, `settings`, `setup`, `utils`) |
| `app/core/` | `config.py`, `db.py`, `security.py`, `store.py`, `commands.py` |
| `app/services/` | `bambu_client.py` (MQTT), `bambu_cloud.py` (cloud REST), `printer_service.py` |
| `app/models.py` | SQLModel models (UUID primary keys) |
| `app/crud.py` | Database access helpers |
| `app/utils.py` | Email rendering/sending and password-reset tokens |
| `app/alembic/` | Migrations |

## Authentication

Email + password, JWT bearer tokens. `POST /api/v1/login/access-token` returns a token;
protected routes expect `Authorization: Bearer <token>`.

The first account is created by the setup wizard via `POST /api/v1/users/signup`
(only allowed while no account exists). Alternatively set `FIRST_SUPERUSER` and
`FIRST_SUPERUSER_PASSWORD` in `.env` to have `scripts/prestart.sh` create it.

## Migrations

```bash
uv run alembic revision --autogenerate -m "Describe the change"
uv run alembic upgrade head
```

## Tests

```bash
uv run bash scripts/test.sh
```

Tests run against PostgreSQL (and the database is cleaned between runs). Start it with
`docker compose up -d db mailpit` first or they will wait for the database.

## Lint

```bash
uv run bash scripts/lint.sh   # mypy + ruff
uv run bash scripts/format.sh # auto-fix + format
```
