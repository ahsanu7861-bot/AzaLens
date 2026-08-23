# AzaLens — Provider Dependency & Replaceability Audit

**Updated:** 2026-08-22 (sections 1–9 as written 2026-07-31; section 10 records PR A)
**Current production baseline:** `5099287` (`main`)
**Purpose:** document the verified provider architecture, Twelve Data profile-parity results, licensing posture, and the safe migration sequence. This is an engineering audit, not legal advice.

---

## 1. Current provider responsibilities

| Capability | Current provider | Current path | Migration status |
|---|---|---|---|
| Live quote | Finnhub | `finnhubProvider.js` via `marketDataProvider.js` | Configurable capability exists |
| Company profile | Finnhub | Bundled into Finnhub's quote flow | Must be separated in `marketEngine.js` |
| Symbol search | Finnhub | Search route/provider adapter path | Keep until Twelve Data search parity is implemented and tested |
| Historical OHLCV | Twelve Data | `/time_series` via `twelveDataProvider.js` | Proven in production |
| Shariah screening | Halal Terminal | Dedicated normalized compliance service | Kept; not part of market-data replacement |

`marketDataProvider.js` already exists and exposes capability-oriented dispatch. The remaining architectural gap is that `marketEngine.js` requests only quote and history, while Finnhub's quote implementation also fetches the company profile. Consequently, changing `PROFILE_PROVIDER` alone does not yet make profile retrieval independent.

---

## 2. Verified Twelve Data company-profile parity

Live API tests were performed on 2026-07-31 with AAPL. No API keys are recorded in this document.

| Required field | Twelve Data source | Verified result |
|---|---|---|
| Name | `/profile` | Available |
| Sector | `/profile` | Available |
| Industry | `/profile` | Available |
| Website | `/profile` | Available |
| Exchange | `/profile` and `/stocks` | Available |
| MIC code | `/profile` and `/stocks` | Available |
| Currency | `/stocks` | Available, listing-specific |
| Logo | `/logo` | Available as a separate URL response |
| IPO/listing date | Not returned by tested endpoints | Missing |

The correct Twelve Data profile endpoint is `/profile`, not `/fundamentals/profile`. The logo endpoint is `/logo`.

### Listing-selection requirement

`/stocks?symbol=AAPL` returned multiple international listings with different currencies, exchanges, MIC codes, countries, and instrument types. AzaLens must never select the first symbol match blindly.

Selection must prefer, in order:

1. An explicitly requested MIC code or exchange.
2. The exchange/MIC returned by the primary profile or quote response.
3. For an unqualified US ticker, the matching US primary listing and common-stock instrument type.
4. A compatible currency and country only as secondary evidence.

The adapter must not silently substitute a foreign listing or depositary receipt.

---

## 3. Existing normalized profile contract

The downstream AzaLens contract currently includes:

- `name`
- `ticker`
- `country`
- `currency`
- `exchange`
- `industry`
- `ipoDate`
- `website`
- `logo`
- `source`
- `retrievedAt`

The migration should add `sector` as a backward-compatible optional field. Existing fields and response envelopes must remain unchanged.

---

## 4. Required adapter work

The capability configuration should remain independent:

```env
QUOTE_PROVIDER=finnhub
HISTORY_PROVIDER=twelve_data
PROFILE_PROVIDER=finnhub
SEARCH_PROVIDER=finnhub
SHARIAH_PROVIDER=halal_terminal
```

Implementation sequence:

1. Split Finnhub quote retrieval from Finnhub profile retrieval.
2. Add Twelve Data profile retrieval and normalization using `/profile`, `/stocks`, and `/logo`.
3. Implement deterministic listing selection using MIC/exchange context.
4. Make `marketEngine.js` request quote and profile as separate capabilities.
5. Merge the normalized profile into the existing market response without changing downstream contracts.
6. Preserve Finnhub as the IPO-date enrichment source and complete fallback.
7. Cache the combined profile for six hours and deduplicate simultaneous in-flight requests.
8. Route search through its configured capability and preserve existing filters and response shape.
9. Remove hardcoded provider names from generic engine response paths where they misrepresent the active provider.

No provider code should be deleted during this phase.

---

## 5. Failure and fallback policy

- If Twelve Data profile retrieval succeeds but IPO date is missing, Finnhub may enrich only `ipoDate` without overwriting valid Twelve Data fields.
- If Twelve Data profile retrieval fails or cannot identify the correct listing, fall back to the complete Finnhub profile.
- If optional logo retrieval fails, return the remaining profile rather than failing the analysis.
- Never combine currency from one listing with exchange or profile data from another.
- Preserve current quote, history, caching, scanner, and analysis behavior throughout the migration.

---

## 6. Tests required before configuration changes

Add or extend tests for:

- Provider configuration and dispatch.
- Existing normalized company-profile contract.
- Twelve Data profile normalization.
- `sector` as a backward-compatible addition.
- Canonical listing selection across duplicate international symbols.
- Rejection of foreign listings and depositary receipts when a primary common-stock listing is required.
- Finnhub IPO-date enrichment.
- Complete Finnhub fallback on Twelve Data failure.
- Optional logo failure.
- Six-hour cache behavior.
- In-flight request deduplication.
- No regression to quote, history, scanner, search, and master-analysis responses.

The full backend CI suite must pass before switching any production provider configuration.

---

## 7. Closed-demo gate status

The closed-demo gate is complete and live as of commit `5099287`.

- The landing page remains public.
- Dashboard and protected workspace routes require the invitation code.
- Server-side validation protects provider-backed API access.
- The production cookie is secure, HTTP-only, cross-site compatible, and persists for 12 hours.
- CORS, credential transport, cookie storage, refresh persistence, and `authorized:true` status were verified in production.
- All 25 backend CI suites passed for the deployed gate fix.

The gate reduces unrestricted exposure during development. It does not itself grant market-data display or redistribution rights.

---

## 8. Licensing posture

No provider licence purchase is required during the current closed-development phase solely to continue engineering work.

Before public beta, obtain written commercial quotations and confirm:

- External/client-facing display rights.
- Redistribution restrictions.
- Exchange-specific and add-on fees.
- Real-time versus delayed-data permissions.
- Attribution requirements.
- Rate limits and production support.

Tahir Khan should review the commercial terms before AzaLens opens unrestricted public access. Provider pricing and rights should be reverified at quotation time because they can change and may depend on exchanges, usage, and distribution model.

---

## 9. Decision and safe migration sequence

Twelve Data has verified parity for every required company-profile field except IPO date. It is therefore a viable primary profile provider only with Finnhub retained for IPO-date enrichment and complete fallback during the transition.

The approved sequence is:

1. Keep the closed-demo gate active.
2. Commit this corrected audit separately.
3. Implement capability-based adapters and tests.
4. Keep `PROFILE_PROVIDER=finnhub` as the default initially.
5. Run the full backend CI suite.
6. Test `PROFILE_PROVIDER=twelve_data` locally across multiple exchanges and symbol types.
7. Deploy cautiously and observe production behavior.
8. Request commercial quotations near beta.
9. Disable Finnhub through configuration only after Twelve Data parity is proven in practice.
10. Consider deleting Finnhub code much later, after a stable observation period and licensing review.

**Current conclusion:** continue AzaLens development. Keep Finnhub available and configurable; do not remove it yet. Build the independent provider capabilities next without changing production provider defaults.

---

## 10. PR A status (2026-08-22)

This section records what changed and, just as importantly, what did not. The
sections above are preserved as written; they were accurate on 2026-07-31 and
several of their open items are now closed.

### Closed since the 2026-07-31 audit

- **§1 "Company profile — bundled into Finnhub's quote flow; must be separated
  in `marketEngine.js`" is done.** `marketEngine.js` now requests quote and
  profile as independent capabilities, so `PROFILE_PROVIDER` is effective.
- **§4 step 1 (split quote from profile retrieval) is done.**
- **§4 steps 2–3 (Twelve Data profile normalization and deterministic listing
  selection) were already implemented and remain covered.**
- **§4 step 8 (route search through its configured capability) is done**, and a
  Twelve Data implementation now exists behind `SEARCH_PROVIDER=twelve_data`.
- **§4 step 9 (remove hardcoded provider names from generic engine response
  paths) is done in `marketEngine.js`.** Provenance there is now derived from
  the active capability selection, which resolves to the same literals under the
  accepted defaults. Hardcoded provider strings remain in `server.js`,
  `masterAnalysisService.js` and one frontend fallback label; those are PR B
  work.
- **§4 step 7 (six-hour profile cache with in-flight deduplication) remains in
  place, now under provider-qualified keys.**

### Reversed since the 2026-07-31 audit

**§4 step 6 and §5 bullet 1 — "preserve Finnhub as the IPO-date enrichment
source" — has been deliberately reversed.**

The enrichment call ran unconditionally, before the `||` that appeared to make
it conditional, so every Twelve Data profile bought a Finnhub request even when
Twelve Data had already answered. It existed solely to populate `ipoDate`.

Executable tracing shows `ipoDate` feeds no calculation, verdict, indicator,
risk value, guidance state, Shariah gate or scanner decision. It reaches exactly
one presentation row. Under Twelve Data that row now reads "Unavailable", which
is the truth. It is not fetched from Finnhub, and it is not fetched from
`/ipo_calendar` — a 100-credit, date-ranged event feed gated to Pro or Venture
and above that returns nothing for a company listed decades ago. Preserving an
entire provider dependency to populate one optional label is not a proportionate
trade.

**§5 bullet 2 — "fall back to the complete Finnhub profile" — no longer applies
to the explicit Twelve Data path.** When `PROFILE_PROVIDER=twelve_data` and the
capability is enabled, Twelve Data is used alone and a failure is reported
honestly. When the capability is selected but its feature flag is off, the
adapter now raises a machine-readable `PROVIDER_CAPABILITY_DISABLED` error
instead of silently serving Finnhub — the previous behaviour let an operator
believe a migration was live while every profile was still being bought from
Finnhub.

### Added in PR A

- Twelve Data live-quote adapter (`/quote`) with normalized units: percentage
  change stays a percentage, and the quote timestamp stays in Unix seconds.
- Twelve Data equity-only symbol search (`/symbol_search`), reading `exchange`
  and `mic_code` directly rather than reproducing Finnhub's `displaySymbol`
  splitting heuristic, and de-duplicating on symbol plus venue so genuinely
  distinct listings survive.
- Provider- and contract-version-qualified cache keys across every cache and
  pending-request map, including the shared history cache in `utils/cache.js`.
  All caches remain process-local module-level Maps; no durable store was
  introduced.
- Boot validation that derives required provider keys from the active capability
  selection, so a correctly configured Twelve Data-only selection can start
  without a Finnhub key while the accepted defaults still require exactly the
  keys they always did. The selection is checked for validity first: an
  unsupported provider, or a Twelve Data profile/fundamentals selection without
  `TWELVE_DATA_PROFILE_ENABLED`, refuses to boot and reports `not_ready` rather
  than starting green and failing per request.
- Protected provider-selection observability on `/ops/metrics`, publishing
  configuration names and provider ids only — never key values, quotas or
  provider account detail. Public health endpoints are unchanged.
- A provider-neutral `MARKET_DATA_DELAY_MINUTES`, with `FINNHUB_DELAY_MINUTES`
  honoured as a deprecated alias so no deployment needs an environment change.
  The disclosed 15-minute default is unchanged.

### Deliberately not added

No statement endpoint was implemented. `/income_statement`, `/balance_sheet`,
`/cash_flow`, `/statistics`, earnings and filings endpoints are all absent, and
a test asserts they stay absent. The mounted product reports those sections as
UNAVAILABLE and says so on screen; buying data no screen renders would be pure
provider cost, and `/income_statement` alone is 100 API credits per symbol.

### What PR A does not establish

- It does not switch production. Finnhub remains the default for quotes, search,
  profiles and fundamentals.
- It does not complete the migration, and it does not remove Finnhub.
- It does not establish commercial rights. Contract tests show the adapters
  normalize correctly; they say nothing about which endpoints the current plan
  reaches or whether the data may be displayed publicly.
- **External-display authorization is `UNKNOWN/UNVERIFIED`.** It has not been
  confirmed in writing, and it has not been ruled out.
- The closed-demo gate restricts who can reach provider-backed routes. It is an
  access control, not a licensing determination, and §7 above already says so.
  It must never be cited as evidence that any provider's terms are satisfied.

PR B remains gated on written provider and plan confirmation, parity evidence,
verified cache transition and explicit production authorization. PR C remains
gated on stable production observation after PR B.
