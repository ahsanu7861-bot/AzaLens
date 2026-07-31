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

Twelve Data quote, search, profile, and fundamentals adapters must only be enabled after endpoint access, normalized field parity, tests, rate limits, and commercial terms are verified.
