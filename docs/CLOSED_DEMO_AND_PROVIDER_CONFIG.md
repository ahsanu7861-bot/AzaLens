# Closed demo and provider configuration

The landing page (`/`) remains public. When the closed-demo gate is enabled, the application workspace and every provider-backed API route require a valid, HttpOnly access cookie.

## Production environment variables

```text
CLOSED_DEMO_ENABLED=true
CLOSED_DEMO_ACCESS_CODE=<a private code of at least 8 characters>
CLOSED_DEMO_SIGNING_SECRET=<a random secret of at least 32 characters>
```

Do not commit either secret. Generate the signing secret in your hosting dashboard or password manager. Disable the gate with `CLOSED_DEMO_ENABLED=false` only after provider display rights are confirmed.

## Capability-based providers

Existing behavior is preserved by these defaults:

```text
QUOTE_PROVIDER=finnhub
PROFILE_PROVIDER=finnhub
SEARCH_PROVIDER=finnhub
HISTORY_PROVIDER=twelve_data
FUNDAMENTALS_PROVIDER=finnhub
```

Each capability can be migrated independently. An unsupported provider/capability combination fails explicitly instead of silently returning incorrect data. Finnhub has not been deleted or disabled.

Twelve Data quote, search, profile, and fundamentals adapters now exist and are covered by deterministic zero-network tests, but they must only be **enabled** after endpoint access, plan coverage, normalized field parity, rate limits, cache transition, and commercial terms are verified. Existence is not authorization.

### Two configuration traps worth knowing about

`FUNDAMENTALS_PROVIDER` governs `getFundamentals` only. The mounted Fundamentals
workspace is populated from the company profile that the market engine fetches,
so `PROFILE_PROVIDER` is the variable that decides what a user actually sees on
that screen. Before PR A the distinction was worse: `getFundamentals` re-entered
the profile capability, so `FUNDAMENTALS_PROVIDER` could be silently overridden
by `PROFILE_PROVIDER`. It now dispatches on its own capability.

`PROFILE_PROVIDER=twelve_data` and `FUNDAMENTALS_PROVIDER=twelve_data` each
require `TWELVE_DATA_PROFILE_ENABLED=true`. Set both, or neither.

Setting only the first now **refuses to boot** in staging and production:
environment validation reports `PROVIDER_CAPABILITY_FLAG_DISABLED`, the startup
assertion throws, and strict readiness reports `not_ready`. The service never
reaches a request. The runtime `PROVIDER_CAPABILITY_DISABLED` guard remains in
the dispatch layer as defence in depth, but it is no longer the first line of
defence.

Before PR A this configuration silently returned a complete Finnhub profile, so
a deployment could look migrated while every profile was still being bought from
Finnhub.

### Provider keys are required by selection, not unconditionally

Boot validation derives its required secrets from the active capability
selection. Under the defaults above, `FINNHUB_API_KEY` and `TWELVE_DATA_API_KEY`
are both still required in staging and production, exactly as before. A selection
that uses no Finnhub capability no longer demands a Finnhub key, and a selected
provider whose key is missing still fails boot clearly, naming the capability
that required it. No key value is ever printed.

The selection itself is validated first, against a per-capability list of the
providers each capability is actually implemented for. An unknown, misspelled or
blank provider is refused rather than quietly requiring no key at all — which is
what used to let a typo boot green and fail on the first real request.

### Verifying which provider is actually serving a capability

The token-protected `/ops/metrics` endpoint reports the selected provider per
capability, the resolved market-data delay and its source variable, and whether
any cross-provider fallback is enabled — configuration names and provider ids
only, never key values or quotas. Compare that selection against the per-provider
call counters in the same response to confirm that a configured provider is the
one actually being called. The public health endpoints are unchanged and expose
no provider configuration.
