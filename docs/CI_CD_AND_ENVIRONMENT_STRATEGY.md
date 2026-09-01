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

## Visual baseline acceptance

Accepted visual baselines live in `frontend/e2e/*.spec.ts-snapshots/`. There are
24 of them and every one is a Linux PNG, because Reliability Gates compares on
`ubuntu-latest`. Changing one is a deliberate, separately authorised act — never
a side effect of running the tests.

**Ordinary verification is permanently non-writing.** `frontend/playwright.config.ts`
sets `updateSnapshots: "none"` unconditionally. Under that mode a baseline that
is missing or outside tolerance is a hard test failure; the accepted PNG is not
touched, and a missing baseline produces no image at all.

**`--update-snapshots` alone is refused.** Playwright resolves the effective
mode as `takeFirst(configCLIOverrides.updateSnapshots, userConfig.updateSnapshots,
"missing")`, so a bare `-u` on the command line outranks the config file. The
`globalSetup` guard in `frontend/e2e/globalSetup.ts` therefore inspects the
*resolved* `FullConfig.updateSnapshots` and aborts before any worker starts.
Running `npx playwright test --grep @visual -u` fails with a deterministic error
and writes nothing.

**`CI=1` is not an authorisation mechanism.** It never was — it only ever
selected a config branch, and it could not close the command-line override. It
now has no bearing at all on snapshot writing. `CI=1 npx playwright test --grep
@visual -u` is refused exactly like the command above.

**Acceptance requires one explicit opt-in.** The only authorisation is the
environment variable `AZALENS_ACCEPT_BASELINES` set to exactly `1`. Any other
value — `0`, `true`, whitespace, anything else non-empty — is rejected as invalid
configuration rather than treated as consent. The opt-in supplied without an
active write mode is rejected as an operator error, and an update mode the guard
does not recognise fails closed.

**Accepted baselines must be generated on Linux.** With the opt-in present the
guard refuses any platform other than `linux`, including when `-u` is on the
command line. A macOS/Darwin baseline can never satisfy Linux CI, so producing
one is forbidden, not merely discouraged; CI additionally fails if any
`*-darwin.png` appears anywhere under `frontend/`, excluding `node_modules/`.

**Candidate capture is separate from acceptance.** `npm run visual:candidates`
and the methodology/technical candidate specs call `page.screenshot()` into the
gitignored `frontend/candidate-artifacts/`,
`frontend/methodology-candidate-artifacts/` and
`frontend/technical-candidate-artifacts/` directories. They never call
`toHaveScreenshot`, so they cannot write a baseline by any path. Candidates are
review evidence, never an accepted baseline.

The one supported acceptance command, on Linux only:

```bash
npm run test:visual:accept-linux
```

which expands to `AZALENS_ACCEPT_BASELINES=1 playwright test --grep @visual
--update-snapshots=changed`. It replaces the former `test:visual:update`, which
was unguarded and would happily write Darwin baselines on a developer Mac.

Running that command produces candidate *bytes on disk*; it does not accept
them. Reviewing the resulting diff and committing it remain separate steps that
require their own human authorisation, and the positive write control — the
exercise that deliberately deletes one baseline to prove the route works — must
be run only in a disposable Linux environment, never against a working
checkout that anything else depends on.

Normal CI enforces all of this automatically. After the visual run, Reliability
Gates runs two independent `if: always()` proofs: a filesystem proof that the
worktree is clean, no committed snapshot path changed and no Darwin baseline
exists; and a log proof that searches the captured visual log for the five
historical snapshot-write markers — `writing actual`, `doesn't exist`, `did not
match`, `--update-snapshots` and `Writing missing snapshot` — failing the job if
any is present. Before this, those five markers were only ever checked by hand
on individual runs.

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
