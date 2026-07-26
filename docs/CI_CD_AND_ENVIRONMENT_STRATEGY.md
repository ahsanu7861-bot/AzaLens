# Sprint 4.7 — CI/CD and Environment Strategy

## Promotion model

| Environment | Source | Purpose | Secrets |
|---|---|---|---|
| Development | Local branch | Fast local work with fixtures and provider calls disabled by default | Local `.env`, never committed |
| Preview | Pull request | Vercel UI review plus all deterministic reliability gates | Preview-scoped provider credentials only when required |
| Staging | Exact candidate commit | Production-like release-health validation before promotion | GitHub `staging` environment and staging-only provider keys |
| Production | Protected `main` | Customer traffic | GitHub/Vercel/Render production-scoped secrets |

No credential may be copied between staging and production. Repository-level
secrets should be avoided when an environment-scoped secret is supported.

## Required PR gates

Every pull request must pass:

1. Backend deterministic contracts and migration validation.
2. Frontend lint, unit tests, WCAG contrast, TypeScript and production build.
3. Performance budgets.
4. Browser, mobile, keyboard, reduced-motion, accessibility and visual tests.
5. Immutable backend/frontend source archives, SHA-256 manifest and GitHub
   build-provenance attestation.
6. Successful preview deployment.

Configure `main` branch protection to require all four Reliability Gates jobs
and the Vercel preview checks, disallow force pushes, and require the branch to
be current before merge.

## Migration safety

Migrations live in `backend/migrations` and use
`YYYYMMDDHHMMSS_description.(sql|js)`. Releases use expand/backfill/contract:

1. Add backward-compatible schema.
2. Deploy code that supports old and new schema.
3. Backfill with an idempotent job.
4. Remove old schema in a later release after rollback expiry.

The CI gate rejects malformed or duplicate migration timestamps. A release
containing a destructive migration requires a documented restore checkpoint.

## Feature flags

`/version` exposes flag state without exposing secrets. Defaults are safe/off:

| Flag | Default | Scope |
|---|---:|---|
| `FEATURE_SCANNER_ENABLED` | false | Scanner/discovery rollout |
| `FEATURE_PORTFOLIO_PRO_ENABLED` | false | Pro personalization |
| `FEATURE_LIVE_SHARIAH_ENABLED` | false | Paid live Shariah provider |

The live Shariah flag additionally requires live data mode and a configured
Halal Terminal key. Enable high-risk flags in development, then staging, then
production; never enable them globally first.

## Staged release and rollback

1. Merge only a green candidate.
2. Deploy the exact candidate SHA to staging.
3. Run **Staging Release** against that SHA; environment validation and the
   six-workspace release-health contract must pass.
4. Promote the unchanged SHA to production.
5. Reliability Gates and Production Release Health verify the production
   commit. Retain all reports for 30 days.
6. If production health fails, use **Rollback Production** with the failed SHA,
   last known-good ancestor and the protected confirmation. The workflow makes
   a traceable revert commit—never a force push—and normal deployment hooks
   redeploy it.

Provider consoles should also retain their native prior deployment so an
infrastructure-only rollback remains possible while source rollback executes.

## Release evidence

Each Reliability Gates run emits commit-addressed source archives, a manifest
containing size and SHA-256 digests, and GitHub build-provenance attestations.
The tested tree, preview tree, staging tree and production tree must be the same
commit. Any code change restarts the promotion sequence.
