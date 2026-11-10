# CI and automation

This repository uses GitHub Actions for three kinds of work:

1. **Deterministic gates** — lint, typecheck, tests, builds. These are the
   checks that should block a merge.
2. **Security and maintenance** — CodeQL, dependency review, Dependabot.
3. **Managed automated review** — CodeRabbit, advisory. It never blocks a merge.

## Workflows

| Workflow | File | Trigger | What it does |
| --- | --- | --- | --- |
| Test Backend | `.github/workflows/test-backend.yml` | Push to `main`, every PR | Starts PostgreSQL + Mailpit, runs `mypy`, `ruff`, migrations, and `pytest` |
| Test Frontend | `.github/workflows/test-frontend.yml` | Push to `main`, every PR | `npm ci`, ESLint, `tsc --noEmit`, production build |
| Test Mobile | `.github/workflows/test-mobile.yml` | PRs touching `mobile/` | ESLint, `tsc --noEmit`, `expo install --check`, Android and iOS JS bundle export |
| Test Site | `.github/workflows/test-site.yml` | PRs touching `site/` | ESLint, `tsc --noEmit`, static export |
| Test Frontend E2E | `.github/workflows/test-e2e.yml` | PRs touching `frontend/` | Playwright smoke tests against the production build in demo mode |
| Pre-commit | `.github/workflows/pre-commit.yml` | Every PR | Runs the pre-commit hooks on changed files |
| Lint Workflows | `.github/workflows/lint-workflows.yml` | Workflow changes, manual | Runs `actionlint` on GitHub Actions files |
| Zizmor | `.github/workflows/zizmor.yml` | Every PR, push to `main`, manual | Security analysis of workflows (template injection, permissions, unpinned actions) |
| OpenSSF Scorecard | `.github/workflows/scorecard.yml` | Push to `main`, weekly, branch-rule changes | Supply-chain posture; publishes SARIF |
| Docker Build | `.github/workflows/docker-build.yml` | PRs touching Docker/Compose/dependency files, manual | Builds the backend image and the production frontend image (no push) |
| Test Docker Compose | `.github/workflows/test-docker-compose.yml` | Docker/Compose/dependency changes, manual | Builds and starts `compose.prod.yml`, checks backend health and frontend |
| Dependency Review | `.github/workflows/dependency-review.yml` | Every PR | Blocks new dependencies with high-severity advisories |
| CodeQL | `.github/workflows/codeql.yml` | Push/PR to `main`, weekly | JavaScript/TypeScript and Python security analysis |
| Build Mobile APK | `.github/workflows/build-mobile-apk.yml` | Manual | Generates the native Android project and uploads a debug APK |
| Release Containers | `.github/workflows/release-containers.yml` | Tags `v*`, manual | Builds and pushes multi-arch backend, frontend, site, and demo images to GHCR |
| Release Android | `.github/workflows/release-android.yml` | Tags `v*`, manual | EAS signed APK; uploads it as an artifact and attaches it to the GitHub Release |
| Dependabot | `.github/dependabot.yml` | Weekly | Grouped npm, uv, GitHub Actions, and Docker updates |

The test and build workflows cancel superseded runs on the same ref, have a
timeout, and use least-privilege `permissions`. All actions are pinned to commit
SHAs; Dependabot keeps them updated.

PR review is handled by **CodeRabbit**, a GitHub App configured in
`.coderabbit.yaml`. It is free for public repositories, does not use a
repository API key, and is advisory. OpenCode is not used in CI; it remains a
local review tool (`/pr-review`).

## Run the same checks locally

Install the hooks once:

```bash
python -m pip install pre-commit
pre-commit install
pre-commit run          # staged files
```

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
`main`, add only checks that run on **every** PR to `main`:

- `test-backend`
- `test-frontend`
- `CodeQL / analyze`
- `dependency-review`

Do **not** require `test-site`, `test-mobile`, or `test-e2e` as they are
path-filtered: they are skipped on unrelated PRs, and a skipped required check
stays pending forever. If you want one stable required check, add an
always-running aggregator job that `needs` the others and requires that single
job instead. Do **not** require `CodeRabbit`; it is advisory.

## Review automation

### CodeRabbit (GitHub App)

- Free for public repositories. No repository API key or provider key is needed.
- Configured in [`.coderabbit.yaml`](../.coderabbit.yaml).
- Reviews PRs targeting `main` and `feat/marketing-site`; drafts are skipped.
- Uses `AGENTS.md` as code guidelines and the path instructions in the config,
  which point to `.github/REVIEW.md`.
- Advisory: it posts comments and a status, but does not block merges.
- Manual commands on a PR: `@coderabbitai review`, `@coderabbitai full review`,
  `@coderabbitai pause`, `@coderabbitai resume`,
  `@coderabbitai configuration`.

### Local OpenCode review

OpenCode is not used in CI. The `/pr-review` command is installed locally at
`~/.config/opencode/commands/pr-review.md`; it is intentionally not committed to
the repository.

```text
/pr-review 10
```

This uses clean-context `reviewer` subagents and `.github/REVIEW.md`. It works
with whichever provider you have configured locally; nothing in GitHub depends
on it.

## Secrets and variables

| Name | Kind | Purpose |
| --- | --- | --- |
| `EXPO_TOKEN` | Secret | EAS Build for `Release Android` |
| `IMAGE_PREFIX` | Variable | GHCR prefix, `ghcr.io/schlangengoto/open-print-dashboard` |

There are no review secrets. CodeRabbit is a GitHub App, and the local OpenCode
review uses your local credentials. `GITHUB_TOKEN` is used automatically for
GHCR publishing.

## Builds and deployment

- **Dashboard**: `compose.prod.yml` builds from source. `compose.ghcr.yml`
  pulls the published backend/frontend images and runs Caddy on 80/443.
  See [`DEPLOYMENT.md`](DEPLOYMENT.md).
- **Frontend image**: `frontend/Dockerfile.prod` runs `next build` with standalone output and
  starts the self-contained `node server.js`. The release image is built with an empty
  `NEXT_PUBLIC_API_URL`, so the browser calls `/api/v1` on the same origin and
  Caddy proxies it to the backend.
- **Container images**: `Release Containers` publishes backend, frontend, site,
  and demo images to GHCR on `v*` tags. The dashboard stack uses
  `compose.ghcr.yml`; the public site and demo use `compose.public.yml`.
- **Mobile debug APK**: `Build Mobile APK` is manual and produces a debug APK
  for testing, not a store artifact.
- **Mobile release**: `Release Android` runs EAS Build on tags and produces a
  **signed APK** named `openprint-dashboard-<tag>.apk`, attached to the GitHub
  Release. Android is sideloaded; there is no Play Store step. iOS is not part
  of the tag workflow because EAS cannot sign an installable iOS build without
  a paid Apple Developer account. See [`DEPLOYMENT.md`](DEPLOYMENT.md).
- **Site and demo**: both are self-hosted from GHCR images through
  `compose.public.yml` and Caddy. There is no Vercel or Cloudflare dependency.

## Hardening backlog

These are the standard next steps once the repository has more contributors or
stricter security requirements:

- **Keep pinned actions updated.** All actions are pinned to commit SHAs;
  Dependabot handles version updates. Review the diff before merging an action
  bump.
- **Put the OpenSSF Scorecard badge in the README.**
- **Add a merge queue** when more than one person merges to `main`. Every
  workflow that provides a required check must also run on `merge_group`.
- **Use reusable workflows or repository templates** if this project grows into
  several repositories. For one repository, separate workflows are clearer.
- **Add a changelog/tagging policy** if releases become frequent.

## Copilot and GitHub Agents

- **Automatic Copilot code review** is disabled in the account's personal
  Copilot settings. The `copilot-pull-request-reviewer` comments on older PRs
  are historical.
- **CodeRabbit** is the managed reviewer for this repository. It is a GitHub
  App, not a workflow, and it does not use a repository API key.
- The repository **Agents** tab is GitHub Copilot's cloud coding agent. Custom
  agents are Copilot profiles in `.github/agents/*.agent.md`. They are
  Copilot-specific and are **not** used by this repository.
- The local OpenCode agent configuration lives in `~/.config/opencode/`, not in
  this repository. Do not put OpenCode agents in `.github/agents/`; that
  directory is for Copilot.

## Troubleshooting

- **A required check is missing**: the workflow may have been skipped by a
  `paths` filter. Run it manually or adjust the ruleset.
- **CodeRabbit did not review a PR**: confirm the app is installed on the repo,
  the PR targets `main` or `feat/marketing-site`, and it is not a draft. Trigger
  it with `@coderabbitai review`.
- **CodeRabbit is too noisy**: change `reviews.profile` to `chill`, tighten
  `path_filters`/`path_instructions`, or pause it with
  `@coderabbitai pause`.
- **A workflow is stuck**: cancel it and rerun. CodeRabbit is advisory; it does
  not need to finish before merging.
- **Dependency review fails**: enable the dependency graph or check the new
  dependency's advisory. The graph is enabled for this repository.
- **Release Containers fails**: check that `IMAGE_PREFIX` is lowercase, the
  workflow has `packages: write`, and the tag starts with `v`.
- **Release Android fails**: set `EXPO_TOKEN`, run `eas init` in `mobile/`, and
  generate the Android keystore with `eas credentials -p android`. The first
  build cannot be non-interactive until that one-time setup is done.
- **Site/demo is not reachable**: point `SITE_DOMAIN`/`DEMO_DOMAIN` at the
  server, open ports 80/443, and run `docker compose -f compose.public.yml ps`
  and `logs caddy`.
