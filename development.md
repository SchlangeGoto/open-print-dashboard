# OpenPrintDashboard - Development

## Requirements

- [uv](https://docs.astral.sh/uv/) for the Python backend
- [Node.js](https://nodejs.org/) (20.9+) and npm for the Next.js frontend
- [Docker](https://www.docker.com/) and Docker Compose (for PostgreSQL and Mailpit)

## Local Development

Run PostgreSQL and Mailpit in Docker Compose, and the FastAPI and Next.js servers locally.

Start the supporting services:

```bash
docker compose up -d db mailpit
```

### Backend

From the `backend` directory:

```bash
uv sync
uv run bash scripts/prestart.sh   # run migrations + initial data
uv run fastapi dev
```

The API is available at <http://localhost:8000>, with interactive docs at <http://localhost:8000/docs>.

### Frontend

From the `frontend` directory:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

The frontend talks to the backend at `http://localhost:8000` (override with `NEXT_PUBLIC_API_URL`).

The UI is built with [shadcn/ui](https://ui.shadcn.com) components in
`frontend/components/ui`. To add a new component:

```bash
cd frontend
npx shadcn@latest add <component>
```

The generated components import the `cn` helper from the `cn` package and Radix
primitives from `radix-ui`. Customize shared primitives (for example extra `Badge`
variants) directly in `frontend/components/ui`.

### Mailpit

[Mailpit](https://mailpit.axllent.org) captures all emails sent by the app instead of
delivering them. The web UI is at <http://localhost:8025>.

The backend reads its SMTP settings from `.env` (`SMTP_HOST`, `SMTP_PORT`, ...). With Docker
Compose the backend points at the `mailpit` service on port `1025`; when run locally it points
at `localhost:11025` (Mailpit's SMTP port is published on `11025` to avoid clashing with
services that commonly use `1025`).

Emails are sent for:

- New accounts (the setup wizard's first account, and any account an admin creates)
- Password recovery

Email is optional: if `SMTP_HOST` or `EMAILS_FROM_EMAIL` are not set, sending is skipped.

## Full Stack with Docker Compose

```bash
docker compose up -d --build
```

The image builds use [BuildKit](https://docs.docker.com/build/buildkit/) cache mounts for
`uv` and `npm`, so repeat builds are fast. BuildKit ships with current Docker Engine/Desktop;
if `docker buildx version` fails, install the `buildx` CLI plugin (e.g. `docker-buildx-plugin`).

Services:

- App (frontend): <http://localhost:3000>
- Backend API + docs: <http://localhost:8000> / <http://localhost:8000/docs>
- Mailpit: <http://localhost:8025>

The `backend` service mounts `./backend` and runs `fastapi dev`, so code changes reload
automatically. The `frontend` service runs `next dev`.

## The `.env` File

Copy `.env.example` to `.env` and adjust as needed. Docker Compose uses it for variable
interpolation and passes the values each container needs.

## Migrations

Models live in `backend/app/models.py` and are managed with Alembic. After changing a model:

```bash
cd backend
uv run alembic revision --autogenerate -m "Add something"
uv run alembic upgrade head
```

Commit the generated file under `backend/app/alembic/versions/`.

If you don't want migrations at all, uncomment `SQLModel.metadata.create_all(engine)` in
`backend/app/core/db.py` and remove the `alembic upgrade head` line from `backend/scripts/prestart.sh`.

## Linting and Tests

Backend (from `backend`):

```bash
uv run bash scripts/lint.sh    # mypy + ruff
uv run bash scripts/test.sh    # pytest + coverage (requires PostgreSQL)
```

Frontend (from `frontend`):

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## CI

GitHub Actions workflows in `.github/workflows/`:

- `test-backend.yml` — starts PostgreSQL + Mailpit, runs lint and the backend test suite
- `test-frontend.yml` — installs dependencies, runs lint, typecheck, and build
