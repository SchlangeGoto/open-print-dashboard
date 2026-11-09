# Review rules

## Layout

- `frontend/` — Next.js 16, React 19, Tailwind, shadcn/ui
- `backend/` — FastAPI, SQLModel, Alembic, PostgreSQL
- `mobile/` — Expo / React Native
- `site/` — Next.js marketing site (static export)
- `compose.yml` — Docker Compose stack

## Must check

- Backend model changes include an Alembic migration.
- API request/response changes are reflected in the frontend and mobile clients.
- Auth changes preserve refresh-token rotation and session invalidation.
- No secrets, tokens, printer access codes, real serial numbers, or `.env`
  values in code.
- React effects clean up subscriptions and timers; no hook dependency loops.
- Next.js server/client boundaries: no server-only imports in client components.
- New behavior has a backend test; UI behavior has a smoke test or a clear
  manual test note.
- Docker/Compose changes still work with the documented `.env.example`.

## Ignore

- `package-lock.json`, `uv.lock`, generated files, screenshots, images
- formatting and style already enforced by ESLint, Ruff, or mypy
- pre-existing issues outside the diff
- `.agents/` skill files

## Output

Severity: blocker / high / medium / low. Include `file:line`, the failure
scenario, and a concrete fix. Maximum 15 findings. Say what you did not review.
