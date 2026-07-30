# AzaLens Product Build Status

Last updated: 2026-07-30

## Current foundation

- Premium dual-theme application shell: built and under pre-commit QA.
- Analysis workspaces: foundation built; live modules remain subject to data and product validation.
- Settings: **BUILT LOCALLY — browser-scoped preferences only.** Theme, reduced motion, and default analysis workspace are functional and saved locally. Account, cross-device sync, alerts, and user-isolated storage are explicitly labelled unavailable until the accounts phase.
- Watchlist Scanner v1: **BUILT LOCALLY, NOT YET DEPLOYED.** Manual,
  user-selected scans are limited to 20 watchlist equities and one
  daily-history request per selected symbol. Results are evidence observations,
  never trade signals. Scanner performs zero Shariah and fundamentals calls.

## Premium Experience Foundation backlog

- Introduce a distinct high-emphasis type treatment for price, verdict, and confidence after the functional correction pass is stable.
- Design one original signature AzaLens visual treatment for evidence/confluence or the AI Verdict panel.
- Keep both identity tasks below correctness, data provenance, chart rendering, and Shariah-pipeline verification in priority.

## Release-capture rule

- Crop editor chrome, branch/status bars, terminals, and other development tooling from production UI captures.

## Verified Status (2026-07-28)

- **Baseline commit:** No commit `bc3d978` exists in this repository. Current `main` HEAD should always be treated as the baseline of record.
- **Sprint 4.2 (Security/Privacy): Not built.** No authentication, no authorization/tiers, no rate limiting, no audit logging. Present: helmet, gitignored secrets, partial input validation.
- **Sprint 4.5 (Test Architecture): Not built.** No test framework, no coverage tooling, no CI. Present: manual Node scripts under `backend/tests/`, three of which are real assertion tests.
- **Tier/permission gating: Not built.** No entitlement checks exist anywhere in the codebase. `frontend/src/permissions/` is an empty placeholder.
