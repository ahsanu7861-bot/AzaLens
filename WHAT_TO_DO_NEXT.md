# AzaLens — What To Do Next

**Date:** 2026-07-28 · **Audited commit:** `355295a` (note: the claimed baseline `bc3d978` does not exist in this repository — see item 1.9)

This file combines the full technical audit of the actual code with the earlier design/product review. It is ordered by priority: work top to bottom. Truth and integrity fixes come first, then structure and density, then motion and polish. Each item says what to fix, why it matters in plain language, and a rough size:

- **Quick** — under half a day for a developer or AI tool
- **Medium** — one to three days
- **Large** — a week or more, or needs product decisions first

---

## PART 1 — BEFORE BETA (truth and integrity)

These are the items where the product currently says something that is not true, or where the core trust promise is not actually enforced. Nothing else matters until these are done, because the entire brand is "truth over hype."

### 1.1 Fix the fabricated dashboard data — replace blind BUY/SELL commands with reasoned verdicts; delete fake prices and fake "Compliant" labels — **Quick to Medium**

**What:** The dashboard components `frontend/src/components/dashboard/WatchlistPreview.tsx` and `TopOpportunities.tsx` contain hardcoded, invented data presented as real:

- AAPL at **$212.43** while the analysis page shows the live price (the exact contradiction the design review caught)
- Hardcoded **"BUY"** command badges and invented "AI scores" (92, 95…) — these violate the no-blind-calls principle
- Hardcoded **`shariah: "Compliant"`** labels on five tickers — this is the worst one: it fabricates religious-compliance claims with no screening behind them

The other dashboard panels (MarketSnapshot, MarketSentiment, MarketNews, UpcomingEarnings, PortfolioSummary) are also fully static — **no dashboard component fetches any data at all**.

**Why it matters:** A user who compares the dashboard price to the analysis page price will conclude the whole product invents numbers. A Muslim user who buys a stock because the dashboard said "Compliant" has been given a fabricated religious assurance. This is the single fastest way to destroy the product's only differentiator.

**Fix — the rule is: kill the COMMAND, keep the UNDERSTANDING.**

- **Fake prices, fake AI scores, fake "Compliant" labels:** delete outright. Either wire these panels to real data (the backend `/api/watchlist` route already exists) or replace them with honest empty/preview states ("Connect your watchlist to see live data"). Quick to delete; Medium to wire real data.
- **BUY/SELL badges:** do NOT simply remove the directional insight — replace blind BUY/SELL command badges with **reasoned verdicts**, each showing: a clear directional lean (e.g. "Leaning Bullish"), a confidence %, a one-line plain-language "why" summarizing the signal confluence, and a tie-in to the invalidation level (what would prove it wrong). The goal is to give users the buy/sell *understanding* without ever issuing a buy/sell *command*. This keeps the no-blind-calls promise intact while making the product genuinely more useful than a raw indicator dashboard anyone could get free elsewhere. The AI Thesis and Thesis Invalidation components are the home for this reasoned understanding. Note for the developer: the backend already produces the ingredients — `agreement.direction`/`confidence`, `agreementSummary`, and the confluence/risk levels in the master analysis response — so this is a presentation change, not a new engine.

### 1.2 Shariah screening is OFF in the current configuration — every stock returns "unknown" — **Quick (config) + verification**

**What:** The screening pipeline is safe-by-default: `backend/config/shariahRuntime.js` defaults to `offline` mode unless `SHARIAH_DATA_MODE`, `HALAL_TERMINAL_LIVE_ENABLED`, and a positive `HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET` are all set. The current `backend/.env` sets **none of them**. Result: in production as configured, every screening call is blocked ("Live Shariah screening is disabled to protect API quota") and every stock shows "Review required."

**Why it matters:** The good news: the system fails safe — it never claims a stock is compliant without evidence. The bad news: the headline feature of the product is effectively switched off. A beta user will see "could not be verified" on every single ticker.

**Fix:** Decide the launch posture and set the three environment variables on the production backend (with a real monthly budget). Then verify one known-compliant and one known-non-compliant ticker end to end. The cost-safety guard (`backend/utils/halalTerminalBudget.js`) is genuinely well built — ledger, lock file, atomic writes — so turning live mode on is safe.

### 1.3 The Shariah "guardrail" does not actually gate the analysis output — **Medium**

**What:** Verified in code: the compliance *panel* is honest (`shariahComplianceService.js` only ever returns COMPLIANT when the provider explicitly says so; `IslamicCompliance.tsx` line 247 refuses to infer compliance). **But nothing blocks or annotates the rest of the analysis for a non-compliant or unverified stock.** `masterAnalysisService.js` computes and returns the full technical verdict regardless of compliance status. `AIVerdict.tsx` contains zero references to Shariah. The explanation engine (`analysis/explanation/explanationEngine.js`) contains zero references to Shariah. A stock that fails AAOIFI screening still gets a full bullish technical verdict with no warning on that verdict.

Also: stale screening evidence only lowers the *confidence* label to LOW — it does not change the status. A stale "COMPLIANT" still displays as compliant.

**Why it matters:** The product promise is that compliance is a first-class gate, not a side panel. Right now a user can read an enthusiastic AI verdict for a non-compliant stock and never open the Shariah tab.

**Fix:** In the master analysis response (and in `AIVerdict.tsx` / the thesis workspace), when status is NON_COMPLIANT or UNKNOWN, visibly gate or annotate the verdict ("This stock does not pass / has not been verified against AAOIFI screening — AzaLens does not present opportunities on unverified stocks"). Decide and encode the stale-evidence rule: stale evidence should downgrade to "Review required," not remain "Compliant · low confidence."

### 1.4 The INTACT / VIOLATED / REVIEW data-contract states do not exist anywhere — **Large (or Quick if you descope the claim)**

**What:** A repo-wide search for INTACT, VIOLATED, and REVIEW-as-a-state returns **zero code hits** in backend and frontend. The "Day 15 data contract" as described (deterministic trust-state mapping) is not implemented. What *does* exist: provider lineage (Finnhub / TwelveData / Halal Terminal names carried through `dataQuality.providers`), cache states (HIT / MISS / COALESCED / BYPASS / ERROR), a Good / Degraded / Unavailable data-quality status, and honest freshness display (`StockHeader.tsx` shows "Freshness unavailable" rather than inventing a timestamp — verified, no invented defaults).

**Why it matters:** If investor or partner material describes the INTACT/VIOLATED/REVIEW contract, that claim is currently unverifiable against source. Either build it or stop claiming it.

**Fix:** Option A (honest, Quick): update docs/pitch to describe what exists — lineage, cache states, Good/Degraded/Unavailable. Option B (Large): implement the deterministic mapping as a real module with tests, driven by the existing dataQuality inputs.

### 1.5 Relative volume reports "low participation" when the market is simply closed — **Medium**

**What:** Confirmed truth bug. `backend/analysis/rvol.js` divides the **last bar's volume** by the prior-30-bar average, and `rvolService.js` labels the result "today" with **zero market-session awareness** — there is no market clock anywhere in the backend. If the data feed includes the current in-progress day, volume is understated all day (and after hours), producing "Low Volume — trading activity is below its recent average" when participation is actually normal or the market is closed.

**Why it matters:** This is a data statement that is false in a predictable, daily-recurring way — exactly the kind of thing the product promises never to do.

**Fix:** Add a minimal market-session check (exchange hours + weekend/holiday awareness, or drop the last bar when it is an incomplete session) and change the copy to say "vs. last completed session" when the market is closed. Same clock work also feeds item 2.4.

### 1.6 A Finnhub profile failure throws away a perfectly valid quote — **Quick**

**What:** Confirmed at `backend/providers/finnhubProvider.js:255–269`: the live quote and the company profile are fetched with `Promise.all`, and `fetchCompanyProfile` has no error handling of its own. If the profile call fails (rate limit, timeout), the whole function rejects and the **valid quote is discarded** — the app reports "unable to fetch live market data" when the price was actually available.

**Fix:** Wrap the profile fetch so its failure degrades to `company: null` instead of rejecting the quote. One small change.

### 1.7 One failed indicator kills the entire analysis — **Medium**

**What:** In `masterAnalysisService.js` (~line 1349), if **any** of the 11 indicators fails, the whole response becomes `success: false`, the route returns HTTP 500, the frontend service throws, and the user sees "AzaLens could not analyze X. Confirm the ticker and make sure the backend is running" — which is both all-or-nothing and a misleading message (the backend *was* running).

**Why it matters:** Thinly traded and OTC tickers with under 31 volume bars will fail RVOL, which then blanks the entire analysis — including the ten indicators that worked. This is the opposite of the graceful-degradation story.

**Fix:** Return partial results with per-indicator failure flags (the `failedIndicators` structure already exists — it's just used to abort instead of degrade), keep `success: true` with `dataQuality: "Degraded"`, and make the frontend render available modules with honest per-module "unavailable" states.

### 1.8 Minimum API protection before anyone outside can reach the backend — **Medium**

**What:** `server.js` has **no authentication, no rate limiting, no audit logging, and wide-open CORS**, and error handlers return raw internal error messages (`details: error.message`) to callers. The watchlist and portfolio routes accept unauthenticated writes to JSON files on disk (`backend/storage/*.json`) — anyone on the internet can modify them. Symbol input on `/api/analyze` is only trimmed/uppercased (the watchlist routes have a proper regex — reuse it).

**Why it matters:** A public beta with an open, unlimited API means your Finnhub/TwelveData/Halal Terminal quotas can be drained by anyone, and your users' watchlists are world-writable.

**Fix (minimum for beta):** add `express-rate-limit`, restrict CORS to your frontend origin, apply the existing symbol regex to all routes, and stop echoing internal error details. Full auth is item 3.1.

### 1.9 Reconcile the claims that don't match the repository — **Quick**

**What:** Three honesty corrections to your own materials:

1. The stated production baseline commit **`bc3d978` does not exist** in this repository (HEAD is `355295a`). Fix the reference before anyone diligences it.
2. **Sprints 4.1–4.6 cannot be verified** because no sprint definitions exist in the repo (`docs/` contains one 19-line status file). Of the two you described: **Sprint 4.2 Security/Privacy — NOT FOUND** (no auth, no authorization/tiers, no rate limiting, no audit logging; only helmet, gitignored secrets, and partial input validation exist). **Sprint 4.5 Test Architecture — NOT FOUND as an architecture** (no test framework, no coverage, no CI; what exists is ~12 manual Node scripts, of which three are real assertion tests — `testShariahAAOIFI.js`, `testShariahCostProtection.js`, `testPhase45Stability.js` — and several others print output with no assertions; the frontend has zero tests). Do not present 4.2 or 4.5 as complete to investors.
3. The **tier/permission gating service does not exist at all** — zero matches for tier/entitlement/subscription in backend or frontend; `frontend/src/permissions/` is an empty folder. There is no Pro feature boundary to audit because there is no boundary.

### 1.10 Commit the pending fix and clean the repository — **Quick**

**What:**
- `frontend/src/types/analysis.ts` has an uncommitted two-line fix (adds `success`/`error` to the response type) that the deployed validation code depends on. Commit it.
- Delete from disk and git: `frontend-backup/`, `frontend-undo-backup-20260721-023415/` (18 files git-tracked), `backend/phase45-backup-20260719-033529/`, `AlphaLensAI-backend.tar.gz` (**a full backend snapshot is tracked in git history**), the other three tarballs, `backend/phase5-source.txt`, and the stray `aapl-analysis.json` files.
- Delete or consciously shelve dead code: `backend/providers/alphaVantageProvider.js` and `yahooProvider.js` (imported by nothing), and `decisionEngineService.js`, `riskPlanningService.js`, `scenarioPlanningService.js` (reachable from no route — only test scripts use them). If the decision engine is the future of the verdict, wire it; if not, remove it.
- Empty folders promising things that don't exist: `ai-engine/`, `database/`, `docker/`, `models/`, `scripts/`, `backend/middleware/`, `backend/models/`, `frontend/src/permissions/`. Remove them or add what they promise.

**Why it matters:** Anyone who opens this repo (developer, auditor, acquirer) reads the backups, tarballs, and empty folders as the true state of engineering discipline.

---

## PART 2 — BEFORE BETA (density and structure)

### 2.1 Wire the Watchlist and Portfolio pages to their existing backend — **Medium**

**Implementation status (2026-07-30): BUILT LOCALLY, NOT YET DEPLOYED.** Both
pages now use their existing CRUD routes and a provider-backed equities-only
symbol search. Search is no longer limited to the old AAPL/NVDA static demo
list. Eligible coverage is the listed-company-share universe returned by the
configured licensed market-data provider; crypto, forex, funds/ETFs, futures,
commodities and other non-equity instruments are rejected from discovery.
Watchlist supports add/remove/open-analysis. Portfolio supports add/edit/remove,
shares, average purchase price and explicitly labelled recorded cost basis.
User-specific durable persistence still belongs to Items 3.1 and 3.3.

`frontend/src/pages/WatchlistPage.tsx`, `PortfolioPage.tsx`, and `ScannerPage.tsx` are 14-line stubs with no data fetching, while working backend routes (`/api/watchlist`, `/api/portfolio` with portfolio intelligence) already exist. Either connect them or remove them from navigation for beta — an empty page reached from the main nav reads as broken.

### 2.2 One honest dashboard — **Medium**

**Implementation status (2026-07-30): BUILT LOCALLY, NOT YET DEPLOYED.** The
dashboard now reads only the real Watchlist and Portfolio records. It shows
saved equities, holding count, total recorded shares, and recorded USD cost
basis. It explicitly does not invent live market value, gains, risk, Shariah
coverage, index prices, market sentiment, news, earnings, or market-wide scan
results. Opening the dashboard also no longer launches full analyses for the
first four watchlist symbols, preventing accidental Halal Terminal token spend;
analysis begins only after the user explicitly opens a stock.

After 1.1 strips the fake data, decide what the dashboard truthfully can show today: real watchlist quotes (backend exists), a real link into analysis, and honest placeholders for everything else. A smaller true dashboard beats a dense fabricated one.

### 2.3 Settings page — label it or build it — **Quick for the label**

`docs/PRODUCT_BUILD_STATUS.md` already admits Settings is placeholder-only. Make the UI admit it too, or hide the page for beta.

### 2.4 Market-session awareness for all freshness displays — **Medium**

The same market clock from item 1.5 should drive: "Market closed — last price from [date/time]" on the analysis header, and suppress intraday-only language after hours. There is currently **no delayed-feed state anywhere** — if any of your feeds is 15-minute delayed, the UI has no way to say so. Verify what your Finnhub tier actually delivers and label accordingly.

---

## PART 3 — BEFORE v1.0 LAUNCH

### 3.1 Accounts, authentication, and the real tier-gating service — **Large**

Nothing exists today (see 1.9.3). v1.0 with a paid tier needs: user accounts, session/token auth on every API route, an entitlement check server-side (never only in the UI), and the empty `frontend/src/permissions/` folder made real. Design the entitlement check as one middleware so there is exactly one place a Pro feature can leak from.

### 3.2 Real test architecture with CI — **Large**

Adopt a runner (Vitest fits the stack on both sides), convert the three real assertion scripts into the suite, and add: Shariah safety regression tests (the "never claim compliant without evidence" invariant, the stale rule from 1.3, the gate from 1.3), provider contract tests with recorded fixtures for Finnhub/TwelveData/Halal Terminal (the `fixtures/shariah/` folder exists but contains only a README), error-state tests for the degradation behavior built in 1.7, and frontend tests for the truth-critical components (StockHeader freshness, IslamicCompliance states, verdict gating). Add GitHub Actions — **there is currently no CI of any kind** — running lint + tests on every push, blocking merge on failure.

### 3.3 Real storage and shared cache — **Large**

Watchlists/portfolios live in JSON files (`backend/storage/*.json`) and all caches are per-process in-memory Maps (`utils/cache.js`, the Finnhub caches). This works for one server and one user; it breaks with accounts (3.1) or a second instance (two servers = two disagreeing caches and two ledgers). Move user data to a database (Postgres or a managed equivalent) and shared caching to Redis when you scale past one instance. The budget ledger's file lock is single-machine only — same migration.

#### [PENDING BEFORE PUBLIC LAUNCH] Provision durable Render Key Value (Valkey) for Shariah cache and token-budget persistence

Paid infrastructure is intentionally postponed until closer to the official public launch. Before allowing public traffic, provision a small paid, disk-backed Render Key Value instance in the same region as the backend and connect through Render's private/internal URL. Do not treat an in-memory `Map`, a JSON file on the web service's ephemeral filesystem, or a free/non-persistent Key Value instance as durable storage.

Implementation requirements:

- Replace the process-local Shariah screening cache with a shared Valkey-backed cache keyed by normalized symbol plus provider, screening-contract/version, and any other input that can change the result; retain the current 24-hour TTL unless provider terms or product policy require a different value.
- Make cache reads/writes survive backend spin-downs, restarts, redeployments, and multiple backend instances. Preserve safe in-memory caching only as an explicitly degraded fallback; never present fallback data as durably cached.
- Move the Halal Terminal token-budget ledger and reserve-before-provider-call operation into Valkey using an atomic transaction or Lua script. The monthly UTC budget check, estimated-token reservation, request count, and remaining locally estimated budget must update as one indivisible operation so concurrent requests and multiple instances cannot overspend.
- Replace the single-machine JSON lock/file-ledger path for production. Define a UTC billing-period key strategy and expiry/rollover behavior that cannot accidentally carry spend into the wrong month or reset early.
- Keep the provider dashboard authoritative. Operational metrics must continue to label AzaLens figures as `locallyEstimatedUsed` / `locallyEstimatedRemaining`, expose whether durable storage is healthy, and never imply that the configured estimate is the provider's exact billed usage.
- Preserve the current fail-closed Shariah behavior: if Valkey, the budget guard, or Halal Terminal is unavailable—or the configured budget is exhausted—make no unreserved live provider call, return degraded/unknown screening, and withhold compliance-dependent verdict content rather than guessing.
- Add zero-network tests for cache hit/miss and TTL expiry, restart/process sharing, concurrent duplicate requests, atomic budget exhaustion, billing-period rollover, Valkey outage/fallback behavior, and continued compliance-gate withholding.
- Roll out behind explicit environment configuration, validate the protected `/ops/metrics` output, run the complete backend CI suite, and deploy only after a staging/production-readiness check. Do not provision or incur paid cloud resources until this task is intentionally resumed.

### 3.4 Edge-case behavior as designed states, not accidents — **Medium**

Current behavior verified in code: live-quote failure degrades gracefully (analysis continues on historical close, correctly labeled "Latest Historical Close" — good); history failure fails everything (acceptable); halted stocks are indistinguishable from active ones (no halt state exists); OTC/thin tickers break the whole analysis via 1.7; volatile tickers can show a quote up to 20s old and history up to 30min old with `pricesMatch` exposed but not surfaced in the UI. After 1.5/1.7/2.4, add: a halted/suspended state, and surface the live-vs-close divergence when it is material.

### 3.5 Audit logging and operational visibility — **Medium**

Morgan dev logging is all there is. For v1.0: structured request logs with request IDs (the backend already generates `requestId` — it just never reaches logs users can be supported from), provider failure counters, and budget-ledger alerts before the Shariah quota exhausts mid-month.

### 3.6 Motion and polish — **After everything above**

From your own `PRODUCT_BUILD_STATUS.md` backlog, in this order only after correctness: the high-emphasis type treatment for price/verdict/confidence, and one signature visual treatment for the evidence/confluence or AI Verdict panel. Your doc already says to keep these below correctness and data provenance — the audit agrees.

---

## What is genuinely good (keep it)

- **The fail-safe Shariah core is real.** `shariahComplianceService.js` cannot emit COMPLIANT without an explicit provider `isCompliant === true`; every failure path lands on UNKNOWN with an honest headline. The frontend compliance panel explicitly refuses to infer compliance.
- **The cost-safety system is real and careful** — mode gating, explicit live opt-in, monthly token ledger with locking and atomic writes.
- **The shared-OHLCV architecture is genuinely implemented** — one history fetch feeds all 11 indicators plus structure/confluence engines, exactly as described.
- **No invented freshness** — the analysis header shows "Freshness unavailable" rather than a fake timestamp.
- **The analysis page is honestly wired** to the live backend, including honest empty states ("AzaLens does not invent supporting reasons when the source data is incomplete").

The gap is not the philosophy — it is that the philosophy is enforced on the analysis page and nowhere else (dashboard, verdict gating, contract states, sprint claims). Close that gap and the product matches its promise.
