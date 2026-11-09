## What

<!-- What changed, and why? -->

## How to test

<!-- Exact commands or steps a reviewer can run. -->

- [ ] Backend: `uv run bash scripts/lint.sh` and `uv run bash scripts/test.sh`
- [ ] Frontend: `npm run lint`, `npm run typecheck`, `npm run build`
- [ ] Mobile: `npm run lint`, `npm run typecheck`
- [ ] Site: `npm run lint`, `npx tsc --noEmit`, `npm run build`
- [ ] Added or updated tests
- [ ] Added an Alembic migration if models changed
- [ ] Updated `.env.example` / docs if configuration changed
- [ ] Attached screenshots for UI changes

## Risk and rollback

<!-- What could break, and how do we revert it? -->

---

Keep PRs small when possible. Aim for under 400 changed lines; split large
work into stacked PRs. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).
