# AzaLens Observability and Release Health

This document describes the source-verified observability contract introduced
in Sprint 4.4. It is intentionally limited to behavior implemented in this
repository.

## Health endpoints

- `GET /health` preserves the original compatibility endpoint and now includes
  the deployment version/commit when the hosting environment exposes it.
- `GET /health/live` proves that the Node.js process can serve HTTP traffic.
- `GET /health/ready` verifies runtime readiness. In production, both core
  market-data provider keys must be configured. Shariah may remain safely in
  `offline`, `cache-only`, or fixture mode.
- `GET /ops/metrics` returns bounded in-memory HTTP and provider aggregates.
  It is open only outside production. Production access requires
  `OBSERVABILITY_METRICS_TOKEN` through either a Bearer token or the
  `X-Observability-Token` header. If no production token is configured, the
  route behaves as not found.

Health responses never make paid provider calls.
Health and metrics responses use `Cache-Control: no-store`.

## Structured events

The backend emits one-line JSON events that hosting log systems can parse:

- `service_started`
- `http_request`
- `provider_operation`
- `unhandled_http_error`

HTTP events include the request ID, method, normalized route, status, duration,
and outcome. They deliberately exclude IP addresses, query strings, request
bodies, ticker symbols, API keys, and provider payloads.

Provider events expose only operational fields: provider, operation, outcome,
duration, cache status, safe error code, timeout/rate-limit flags, and data
mode. When an operation runs inside an HTTP request, its event automatically
inherits that request ID. Provider response bodies and credentials are never
logged.

## Request correlation

Every HTTP response includes `X-Request-ID`.

- A valid incoming `X-Request-ID` is preserved.
- Missing or unsafe values are replaced with a generated UUID.
- The master-analysis response `meta.requestId` is aligned to the HTTP request
  ID before the response is sent.
- Error and 404 responses include the same request ID in their JSON body.

## Metrics contract

Metrics are process-local and reset whenever the service restarts. They are
operational signals, not a durable analytics store.

HTTP metrics include:

- request count and in-flight requests
- 5xx count and failure rate
- status-code totals
- per-route count/failure rate
- average, recent p95, and maximum latency

Provider metrics include:

- operation count, successes, degraded results, failures, and policy-blocked
  operations
- timeout and rate-limit counts
- cache hits and misses
- average, recent p95, and maximum latency
- last outcome, safe error code, and observation time

## Environment controls

| Variable | Purpose |
| --- | --- |
| `OBSERVABILITY_METRICS_TOKEN` | Protects `/ops/metrics` in production. Use a long random secret stored only in the hosting environment. |
| `OBSERVABILITY_STRICT_READINESS` | Makes readiness require core market-provider configuration outside production as well. Production is strict automatically. |
| `SERVICE_VERSION` | Optional release version shown in health responses. |
| `RENDER_GIT_COMMIT` / `VERCEL_GIT_COMMIT_SHA` / `GIT_COMMIT_SHA` | First available commit identifier is exposed in health metadata. |

## Release-health checklist

Before publishing:

1. Confirm the release starts from the current production commit.
2. Confirm the diff contains only intended source/test/documentation files.
3. Run `npm run test:ci` in `backend`.
4. Run `npm run lint` and `npm run build` in `frontend`.
5. Confirm no secrets, `.env` files, dependency directories, or unrelated
   worktree changes are included.

After publishing:

1. Confirm GitHub reliability gates pass.
2. Confirm the frontend returns HTTP 200.
3. Confirm `/health/live` returns HTTP 200 and the deployed commit.
4. Confirm `/health/ready` returns HTTP 200 with `ready: true`.
5. Run a representative `/api/analyze/AAPL` request and retain its request ID.
6. Confirm an `http_request` event and Finnhub/TwelveData provider events share
   the release window.
7. Review 5xx rate, p95 latency, timeout/rate-limit counts, and cache behavior.
8. If health regresses, stop the rollout and return to the last verified
   production commit.

## Automated production release health

The `Production Release Health` GitHub workflow runs:

- after the `Reliability Gates` workflow succeeds on `main`;
- every six hours as a synthetic production check; and
- manually, with an optional expected commit.

The zero-dependency checker validates:

- the Vercel frontend serves the application shell;
- backend liveness is healthy and reports the expected commit;
- strict readiness passes with core market providers configured;
- a representative `AAPL` analysis returns all six workspace contracts;
- response headers and JSON bodies preserve the same request ID; and
- `/ops/metrics` remains fail-closed or, when the shared secret is configured,
  returns the authenticated operational metrics contract.

Truthful status handling is deliberate:

- `PASS` means every check, including authenticated metrics, passed.
- `PASS_WITH_LIMITATIONS` means production contracts passed but metrics remain
  securely unavailable because the monitoring secret is not configured.
- `FAIL` blocks the workflow and identifies the failed contract.

The JSON report is retained as a GitHub Actions artifact for 14 days. The
workflow never prints or stores the metrics token in the report.

### Enable authenticated metrics monitoring

Generate one long random token and store the same value in both locations:

1. Render backend environment:
   `OBSERVABILITY_METRICS_TOKEN`
2. GitHub repository Actions secret:
   `OBSERVABILITY_METRICS_TOKEN`

Never commit this value to the repository or place it in a local `.env` file
that could be uploaded. After both values are active, manually run
`Production Release Health`. The expected result changes from
`PASS_WITH_LIMITATIONS` to `PASS`, and the report begins validating HTTP and
provider latency, failures, timeouts, rate limits, and cache aggregates.

### Local or manual execution

From `backend`:

```bash
npm run health:release
```

Optional environment controls:

| Variable | Purpose |
| --- | --- |
| `HEALTH_FRONTEND_URL` | Frontend origin; defaults to the production Vercel URL. |
| `HEALTH_API_URL` | Backend origin; defaults to the production API URL. |
| `HEALTH_CHECK_SYMBOL` | Representative analysis symbol; defaults to `AAPL`. |
| `EXPECTED_COMMIT` | Requires the backend deployment to match this full or abbreviated commit. |
| `HEALTH_REQUEST_TIMEOUT_MS` | Per-request timeout, capped at 120 seconds. |
| `HEALTH_MAX_DEPLOYMENT_ATTEMPTS` | Liveness polling attempts while a new deployment becomes active. |
| `HEALTH_DEPLOYMENT_POLL_INTERVAL_MS` | Delay between deployment polls, capped at 60 seconds. |
| `HEALTH_REPORT_PATH` | Optional path for the JSON report. |
