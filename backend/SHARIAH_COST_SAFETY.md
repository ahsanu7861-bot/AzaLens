# Shariah provider cost safety

AzaLens blocks paid Shariah-provider traffic by default. A live request is
possible only when all three controls allow it:

1. `SHARIAH_DATA_MODE=live`
2. `HALAL_TERMINAL_LIVE_ENABLED=true`
3. `HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET` is a positive number with enough
   estimated tokens remaining

Outside production, a fourth explicit control is required:

4. `HALAL_TERMINAL_ALLOW_LIVE_IN_DEV=true`

This development-only override prevents a leftover local `.env` from spending
paid provider tokens. Production does not require or read this override.

The safe development defaults require no environment changes:

```text
SHARIAH_DATA_MODE=offline
HALAL_TERMINAL_LIVE_ENABLED=false
HALAL_TERMINAL_ALLOW_LIVE_IN_DEV=false
HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET=0
HALAL_TERMINAL_ESTIMATED_TOKENS_PER_REQUEST=10
```

## Runtime modes

- `offline`: never reads fixtures and never contacts Halal Terminal.
- `fixture`: reads `{SYMBOL}.json` from `backend/fixtures/shariah`.
- `cache-only`: returns an existing in-process cached result or an unavailable
  result; it never contacts Halal Terminal.
- `live`: permits a provider call only after the explicit live flag and monthly
  budget guard both pass.

The usage ledger is stored at
`backend/storage/halal-terminal-usage.json` and is excluded from Git. It may
survive a process restart on the same filesystem, but persistence is not
guaranteed across hosting restarts or deployments unless the storage path is
backed by durable storage. The guard reserves a conservative estimated cost
before each request because the provider response does not currently expose a
trusted token-usage total.

Ledger updates use an exclusive local lock. If another backend process is
already reserving tokens, the new request is blocked instead of risking an
overspend.

The protected `/ops/metrics` response includes a `halalTerminalBudget` object.
Its values are explicitly labelled as local estimates and its ledger
persistence as `not-guaranteed`. The Halal Terminal account dashboard remains
authoritative for actual provider token usage and balance.

Do not enable live mode during routine frontend or backend development. Do not
commit API keys or licensed provider responses as fixtures.
