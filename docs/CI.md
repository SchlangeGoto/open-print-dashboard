# CI and automation

This repository uses GitHub Actions for three kinds of work:

1. **Deterministic gates** — lint, typecheck, tests, builds. These are the
   checks that should block a merge.
2. **Security and maintenance** — CodeQL, dependency review, Dependabot.
3. **Advisory AI review** — best-effort PR feedback. It never blocks a merge.

## Workflows

| Workflow | File | Trigger | What it does |
| --- | --- | --- | --- |
| Test Backend | `.github/workflows/test-backend.yml` | Push to `main`, every PR | Starts PostgreSQL + Mailpit, runs `mypy`, `ruff`, migrations, and `pytest` |
| Test Frontend | `.github/workflows/test-frontend.yml` | Push to `main`, every PR | `npm ci`, ESLint, `tsc --noEmit`, production build |
| Test Mobile | `.github/workflows/test-mobile.yml` | PRs touching `mobile/` | ESLint, `tsc --noEmit`, `expo install --check`, Android and iOS JS bundle export |
| Test Site | `.github/workflows/test-site.yml` | PRs touching `site/` | ESLint, `tsc --noEmit`, static export |
| Test Frontend E2E | `.github/workflows/test-e2e.yml` | PRs touching `frontend/` | Playwright smoke tests against the production build in demo mode |
| Docker Build | `.github/workflows/docker-build.yml` | PRs touching Docker/Compose/dependency files, manual | Builds the backend image and the production frontend image (no push) |
| Dependency Review | `.github/workflows/dependency-review.yml` | Every PR | Blocks new dependencies with high-severity advisories |
| CodeQL | `.github/workflows/codeql.yml` | Push/PR to `main`, weekly | JavaScript/TypeScript and Python security analysis |
| AI PR Review | `.github/workflows/ai-review.yml` | PR opened/updated/ready | Advisory AI review with a filtered inline diff |
| Build Mobile APK | `.github/workflows/build-mobile-apk.yml` | Manual | Generates the native Android project and uploads a debug APK |
| Dependabot | `.github/dependabot.yml` | Weekly | Grouped npm, uv, GitHub Actions, and Docker updates |

All workflows cancel superseded runs on the same ref, have a timeout, and use
least-privilege `permissions`.

## Run the same checks locally

Backend, from `backend/`:

```bash
uv sync
uv run bash scripts/lint.sh
uv run bash scripts/test.sh        # needs PostgreSQL
```

Frontend, from `frontend/`:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
NEXT_PUBLIC_DEMO_MODE=true npm run build
npx playwright install chromium
npm run test:e2e
```

Mobile, from `mobile/`:

```bash
npm ci
npm run lint
npm run typecheck
npx expo install --check
npx expo export --platform android --output-dir dist-android
npx expo export --platform ios --output-dir dist-ios
```

Site, from `site/`:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

## Branch protection

`main` has a repository ruleset named **Protect main**:

- Pull request required
- Force pushes blocked
- Branch deletion blocked
- No admin bypass

Required status checks are intentionally not enabled yet: `main` still uses the
old `api/` + `web/` layout and has no workflows. After the migration PR lands on
`main`, add these as required checks:

- `test-backend`
- `test-frontend`
- `test-site`
- `test-mobile`
- `CodeQL`
- `dependency-review`

Do **not** require `AI PR Review`; it is advisory and can be slow or skipped.

## Secrets and variables

| Name | Kind | Purpose |
| --- | --- | --- |
| `AI_REVIEW_API_KEY` | Secret | Provider key for the AI review job |
| `AI_REVIEW_MODEL` | Variable | Model id, default `opencode-go/deepseek-v4.1-flash` |
| `AI_REVIEW_VARIANT` | Variable | Reasoning variant, default `high` |

The workflow maps `AI_REVIEW_API_KEY` to the environment variable the current
runner expects. The naming is provider-agnostic even though the current runner
is OpenCode's GitHub action.

`OPENCODE_API_KEY` may still exist as a legacy secret for older stacked
branches. Remove it after those branches rebase onto the current CI.

## AI review details

- It skips drafts, fork PRs (no secrets), and PRs over 80 files or 12k
  additions.
- It inlines a filtered diff: lockfiles, images, build output, `.next`, and
  Expo exports are excluded.
- It runs read-only: no edits, no shell, no web search.
- It is `continue-on-error` and timed out at 15 minutes, so it cannot block a
  merge.
- For a reliable local review, use:

  ```text
  /pr-review 10
  ```

  This uses clean-context `reviewer` subagents and `.github/REVIEW.md`.

To change provider or model, update `AI_REVIEW_MODEL` and
`AI_REVIEW_API_KEY`. If the new provider is not supported by the current
OpenCode runner, replace the `Run AI review` step with that provider's runner.

## Builds and deployment

- **Dashboard**: the deployable artifact is the Docker image. Use
  `compose.prod.yml` for production; `compose.yml` is the development stack.
  See [`DEPLOYMENT.md`](DEPLOYMENT.md).
- **Frontend image**: `frontend/Dockerfile.prod` runs `next build` and
  `next start`. `NEXT_PUBLIC_API_URL` is baked in at build time.
- **Mobile APK**: `Build Mobile APK` is a manual workflow. It produces a
  **debug** APK, signed with the debug keystore. It is for testing, not store
  distribution.
- **iOS**: no IPA build is configured. That needs macOS or EAS Build.
- **Site**: CI builds the static export; deployment is handled outside this
  repository.
- **Images**: CI builds Docker images but does not push them to a registry.
  Publishing to GHCR is a possible next step.

### Why the mobile APK is manual

A release APK/AAB needs a signing keystore and store metadata. Those secrets
should not run on pull requests. For release builds, use EAS Build with an
`EXPO_TOKEN`, or add a tag-triggered workflow with a keystore stored as a
secret.

## Copilot and GitHub Agents

- **Automatic Copilot code review** is disabled in the account's personal
  Copilot settings. The `copilot-pull-request-reviewer` comments on older PRs
  are historical.
- The repository **Agents** tab is GitHub Copilot's cloud coding agent. Custom
  agents are Copilot profiles in `.github/agents/*.agent.md`. They are
  Copilot-specific and are **not** used by this repository.
- The local agent configuration lives in `.opencode/agents/` and
  `.opencode/commands/`. Do not put OpenCode agents in `.github/agents/`; that
  directory is for Copilot.

## Troubleshooting

- **A required check is missing**: the workflow may have been skipped by a
  `paths` filter. Run it manually or adjust the ruleset.
- **A PR from a fork has no AI review**: fork PRs do not receive repository
  secrets. A maintainer can review manually or run `/pr-review` locally.
- **A PR is too large for AI review**: split it. The job skips PRs over 80
  files or 12k additions by design.
- **A workflow is stuck**: cancel it and rerun. The AI review is advisory; it
  does not need to finish before merging.
- **Dependency review fails**: enable the dependency graph or check the new
  dependency's advisory. The graph is enabled for this repository.
