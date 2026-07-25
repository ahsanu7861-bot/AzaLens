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
