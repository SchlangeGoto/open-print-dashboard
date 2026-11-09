# Contributing

Thanks for helping. This repository is a polyglot monorepo: a FastAPI backend,
a Next.js dashboard, an Expo mobile app, and a static marketing site.

## Before you start

- Read [`docs/SETUP.md`](docs/SETUP.md) for local setup.
- Read [`docs/CI.md`](docs/CI.md) for what CI runs and how to reproduce it.
- Read [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) before changing Docker or
  deployment behavior.
- For security issues, follow [`SECURITY.md`](SECURITY.md) instead of opening a
  public issue.

## Install the local hooks

```bash
python -m pip install pre-commit
pre-commit install
```

Run all hooks once:

```bash
pre-commit run --all-files
```

The hooks check YAML/JSON/TOML, trailing whitespace, end-of-file, merge
conflicts, large files, and Ruff on backend Python. CI runs the same hooks on
changed files.

## Commands

Backend, from `backend/`:

```bash
uv sync
uv run bash scripts/lint.sh
uv run bash scripts/test.sh
```

Frontend, from `frontend/`:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
```

Mobile, from `mobile/`:

```bash
npm ci
npm run lint
npm run typecheck
npx expo install --check
```

Site, from `site/`:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

## Pull requests

- Use conventional commits: `feat(scope): ...`, `fix(scope): ...`, `chore: ...`.
- Keep PRs small. Aim for under 400 changed lines; split larger work into
  stacked PRs. Review quality drops sharply above ~1,000 lines.
- One concern per PR. Refactors, features, and dependency bumps should not be
  mixed unless they are inseparable.
- Include tests for behavior changes. Backend behavior needs a pytest test;
  UI behavior needs a Playwright smoke test or a clear manual test note.
- Model changes require an Alembic migration under
  `backend/app/alembic/versions/`.
- API request/response changes must be reflected in the frontend and mobile
  clients.
- Update `.env.example` and docs when configuration changes.
- Never commit `.env`, tokens, printer access codes, or real serial numbers.

## Review

- CI must pass. The deterministic checks are the gate; AI review is advisory.
- Review the diff, not only the summary.
- For large or stacked PRs, merge bottom-up and rebase the next branch after
  each merge.
- If a PR touches auth, secrets, migrations, or Docker, request a second look.

## Reporting bugs and requesting features

Use the issue templates. Include reproduction steps, environment details, and
logs with secrets removed.
