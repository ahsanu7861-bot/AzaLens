# AzaLens — Provider Dependency & Replaceability Audit

**Updated:** 2026-07-31
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
