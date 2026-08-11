# AzaLens — What To Do Next (Master Roadmap)

**Date:** 2026-07-30 · **Baseline commit:** `92d483c` (`main`, clean, synced with origin)
**Status vocabulary (Rule 7):** Verified / Partially Verified / Planned / Blocked / Not Built.
**This file replaces the 2026-07-28 version entirely** — that version was stale in both directions (it denied the compliance gate, INTACT/VIOLATED, rate limiting and CI, all of which exist; full reconciliation in `docs/AUDIT_2026-07-30.md`).

Companion documents: `docs/AUDIT_2026-07-30.md` (verification evidence), `docs/CONSTITUTION_COMPLIANCE.md` (rule-by-rule), `docs/DESIGN_SYSTEM.md` (visual plan).
**Cost note convention:** every item states its provider/infrastructure cost. Current budget reality: Halal Terminal free plan, ~177 tokens to 28 Aug 2026, ~5 tokens per screening (single data point); Render Free; Vercel free.

---

## THE SINGLE NEXT TASK

**Phase 0 — Specialist Readiness** (Part 1 below), as one small session. Reason: both upcoming reviews — Mufti Ejaz Ahmed Samadani sahib and Tahir Khan sahib — depend on it; it is the largest credibility gain available; and it costs **zero provider tokens** (the only optional spend is deliberately pre-screening 2–3 demo tickers, ~10–15 tokens, only with your explicit go-ahead on the day).

My honest sequencing recommendation, even where it differs from prior assumptions: **specialist readiness → crash fix + CI registration → docs truth sweep → design Phases 1–2 → accounts/DB/tiers as one project → beta gate.** Durable storage stays deliberately parked (below). Nothing design-signature or Momentum-Room-shaped before that.

---

## PART 1 — PHASE 0: SPECIALIST READINESS (do first)

| # | Item | Status today | Rules | Cost |
|---|---|---|---|---|
| 1.1 | **Rebuild landing page honestly**: remove the "Verdict: BUY / AI confidence 92%" mockup and fake trade plan; show the real withheld-vs-compliant verdict composition; unify onto app design tokens; add footer with disclaimers | Violation live (audit V8) | 6, 10, 7 | None |
| 1.2 | **Remove/relabel the "AzaLens Pro — Upgrade to unlock" upsell** (`ProFeatureWrapper`, `StockHeader`): no such tier exists | Violation live (audit V7) | 7, 21, 26 | None |
| 1.3 | **Methodology & Limitations page** (user-facing): AAOIFI version, thresholds (30% debt/assets, 5% impermissible income), screening source description (within Rule 12 limits), 24h-cache / 7-day-stale rules, swing horizon + data delays, purification explanation, "not a fatwa" | Not Built (audit A6) | 11, 15, 25 | None |
| 1.4 | **Purification section in the Shariah workspace** (today it is one metric row) | Partially Verified (audit A4) | 4, 11 | None |
| 1.5 | **Fix the Finnhub crash path** — add `.catch` to the derived pending-quote promise (`finnhubProvider.js:581–586`); an unhandled rejection can kill the process mid-demo | Confirmed bug (audit item 13) | 8 | None |
| 1.6 | Title → "AzaLens" (drop "AI"); purge the `AlphaLens` remnant in `StockChart.tsx` | Violation (audit V12) | 2 | None |
| 1.7 | **Docs truth sweep**: refresh `docs/PRODUCT_BUILD_STATUS.md` (its "Verified Status 2026-07-28" is now false about rate limiting/CI); this file supersedes the old roadmap | Stale (audit V1–V6) | 7 | None |
| 1.8 | **Demo-day runbook**: warm the backend ~10 min before each meeting (Render Free cold start looks broken); optionally pre-screen the demo tickers with your explicit approval | Planned (audit N3) | 17 | 0 or ~10–15 tokens, user-approved |
| 1.9 | Delete dead fabricated code: `App.tsx` (hardcoded BUY plan), `LiveAnalysisTest.tsx`, unused `components/dashboard/*` legacy panels, empty `features/analysis` + `features/auth` dirs | Dead code present (audit V11) | 6, 7 | None |
| 1.10 | **Register `--color-shariah` in the Tailwind theme — and verify the eyebrow separately.** `frontend/src/index.css` defines `--az-shariah` in both the night (`:root, [data-theme="night"]`, line 44) and day (`[data-theme="day"]`, line 75) blocks, but the `@theme inline` block (lines 3–21) never maps it to `--color-shariah`. Result: `text-shariah`, `bg-shariah/…`, `border-shariah/…` classes used throughout `IslamicCompliance.tsx` generate no Tailwind utility and are inert — confirmed live (2026-07-31) via computed-style check in the browser. Fix: add `--color-shariah: var(--az-shariah);` to the `@theme inline` block, alongside the existing `--color-intelligence` line. **This registration alone may not fully fix the visible symptom**: the "Islamic Compliance" eyebrow (`<p className="az-eyebrow text-shariah">`) currently renders in the same brand-cyan color as other eyebrows because `.az-eyebrow` in `index.css` (~line 474) sets `color: var(--az-brand)` directly, which — given equal selector specificity and its later position in the cascade — appears to win over a `text-shariah` utility class regardless of whether that utility exists. Registering the token restores `bg-shariah`/`border-shariah` (backgrounds, borders, badges) but the eyebrow text itself may need an explicit override (e.g. dropping `az-eyebrow`'s forced color for this instance, or a more specific selector) to actually show purple. The dedicated fix must verify both — token registration *and* the eyebrow's rendered color — rather than assuming the token alone resolves every Shariah color. **Fixed locally (2026-07-31, branch `fix/shariah-theme-token`, not yet merged):** `--color-shariah: var(--az-shariah);` added to `@theme inline` (`frontend/src/index.css`) — confirmed via production build that `text-shariah`/`bg-shariah/…`/`border-shariah/…` now compile to real rules, and that Tailwind's generation order places `shariah` after `intelligence` for every shared property, so the AAOIFI badge's mixed `variant="brand"` + `border-shariah/20 bg-shariah/15 text-shariah` classes resolve to Shariah-purple, not brand-cyan, with no further change needed there. The "Islamic Compliance" eyebrow (`IslamicCompliance.tsx:178`) was confirmed — by comparing compiled byte-offsets — to lose to `.az-eyebrow` on cascade order (equal specificity, `.az-eyebrow` declared later in `index.css`), exactly as suspected; fixed with a local `style={{ color: "var(--az-shariah)" }}` on that one element (inline styles win over any author-stylesheet rule without `!important`), leaving the shared `.az-eyebrow` rule and every other eyebrow (e.g. `AAOIFI Status`, `AI Verdict`) untouched. Regression coverage added: `frontend/scripts/checkDesignTokens.mjs` (token registration + exact night/day hex pinned) and `frontend/src/designTokens.test.tsx` (eyebrow color override, Shariah badge/border classes present, other eyebrows unchanged). Verified live in the browser in both themes at desktop and mobile widths, on both the real analysis page and the landing-page demo, with zero console errors. Night/day `--az-shariah` hex values (`#a78bfa` / `#6d28d9`) were not changed — contrast was already passing and remains so. | Confirmed bug, found during Phase 0 item 1.1 verification | 7 | None |
| 1.11 | **Capture Linux landing-page visual snapshots in CI.** The landing-page honesty rebuild (item 1.1) has no Playwright `@visual` baseline yet. Baselines for the existing analysis-workspace snapshots are Linux-only (`-linux.png`); a macOS dev machine produces `-darwin.png` files that won't satisfy Linux CI and would create a permanently-failing or misleading local test if committed. Add the landing-page `@visual` spec + snapshots from the Linux CI environment, not from a local Mac session. | Planned, deliberately deferred (2026-07-31) | 7 | None |

All Phase 0 items need one later, separately approved code session (this session was read-only + docs by instruction).

---

## PART 2 — FIX (correctness and truth, after Phase 0)

| # | Item | Status | Rules | Cost |
|---|---|---|---|---|
| 2.1 | **Register unregistered CI suites.** The 5 known CI-safe ones (`testComplianceGate`, `testMarketSession`, `testRvolSessionAwareness`, `testPartialIndicatorFailure`, `testAgreementTrendDegradation`) plus triage of the other 6 the audit found (`testDecisionEngine`, `testHalalterminalProvider`, `testMasterAnalysisShariah`, `testRiskPlanning`, `testScenarioPlanning`, `testShariahComplianceService`). The compliance-gate invariant currently has **no CI protection** via its focused suite | Partially Verified (audit item 12) | 8 | None |
| 2.2 | **Run the full 22-suite backend CI locally on this Mac** for `92d483c` — the recorded pass came from another environment; Rule 7 requires local confirmation | Blocked on a local run only | 7, 8 | None |
| 2.3 | **Scanner rate-limit double-count decision**: `/api/scanner` is on the strict limiter *and* counted by the global limiter (audit items 3–4). Either exempt scanner from global, or move scanner off strict. Recommendation: keep scanner on strict (it is provider-backed), add scanner paths to the global exemption list, and exclude `GET /policy` from strict | Partially Verified | 8, 17 | None |
| 2.4 | **Unmount `/api/portfolio/intelligence`** until a page uses it — it is unauthenticated, unused, and spends ~5 tokens per holding per cold call; when re-mounted, make its withheld state honest (currently degrades to "Unknown") | Live and unused (audit N2, item 11-A) | 13, 17, 23 | Saves tokens |
| 2.5 | **Minimal API access control before any public link circulates**: today any stranger can drain the 177-token budget via `/api/analyze` (audit N1). A simple app-token header checked server-side is enough pre-accounts | Not Built | 17, 23 | None |
| 2.6 | **Remove obsolete `/api/explanation`.** The frontend already reads the gated explanation from `/api/analyze`; the standalone route had no consumer, duplicated the full provider pipeline, and misreported a valid Shariah-withheld outcome as HTTP 500 | Implemented locally; deployment pending | 5, 13, 17 | Saves tokens |
| 2.7 | Delete `diag/proxy-capture` (local **and** origin) after saving the three captured proxy log lines outside the repo (open item 2); prune the other stale branches and the `legacy-platform` remote | Pending | 7 | None |
| 2.8 | `trust proxy = 3` topology watch: correct today, silently wrong if Render changes its edge (open item 7). Add a startup log of the observed hop count to `/ops/metrics` for periodic eyeballing | Verified, fragile | 8 | None |
| 2.9 | Review/remove the leftover `alpha-lens-ai` Vercel project (open item 5) — harmless (doesn't own the domain) but an attack/typo-confusion surface | Unverifiable from repo | 3, 23 | None |
| 2.10 | Reconcile `design/*.ts` with `index.css` (two conflicting token sources; audit V9) — resolved by Design Phase 1 | Stale files | 7 | None |
| 2.11 | Provider-attribution licensing check (Finnhub, Twelve Data, Halal Terminal): decide hide-vs-attribute per their terms (audit N6) | Undecided | 12, 17 | None |
| 2.12 | Watchlist server-side size cap (audit N7) | Not Built | 17, 23 | None |
| 2.13 | **Correct invalid-input semantics on `/api/analyze`.** Invalid ticker input reportedly reaches HTTP 500 instead of a client-error response. Reproduce hermetically and fix separately without changing Shariah gating or verdict behavior | Newly observed; unverified | 7, 8 | None |

### Deferred evidence-contract and copy debt (recorded during PR 2, 2026-08-12)

These three items were **found and proven** during the PR 2 canonical-evidence work
and deliberately left unfixed, because each would change user-visible output and
therefore needs its own reviewed PR. PR 2 changed no rendered wording. Primary
locators are file and symbol names; line numbers are observed references at commit
`5c7780c` and will drift.

| # | Item | Status | Rules | Cost |
|---|---|---|---|---|
| 2.14 | **`explanationEngine.js` independently re-grades the agreement percentage.** `analyzeExplanation` in `backend/analysis/explanation/explanationEngine.js` applies its **own `>= 70` threshold** when composing `overallAssessment` (observed near lines 402–427), producing wording such as "moderate-to-strong indicator agreement". `analyzeAgreement` in `backend/analysis/agreement/agreementEngine.js` already grades the same number at **75 / 50** into `evidenceState`. Two gradings of one percentage can disagree — at confidence 72 the engine reports `Moderate agreement` while the explanation reports "moderate-to-strong". The same function also still emits the word **"confidence"** in its agreement sentence (observed near line 94), which is not the approved Evidence Agreement terminology settled in PR 1B. This text reaches users through `ThesisWorkspace.tsx`, which falls back to `data.explanation.overallAssessment`. **Correcting it may change user-visible copy, so it requires a separate reviewed PR.** **This is not PR 3 confidence-math work** — the mathematics are not being redesigned; it is contract/copy alignment. It only becomes PR 3 work if its thresholds are intentionally redesigned later | Proven, deliberately deferred | 5, 6, 7 | None |
| 2.15 | **The landing demo bypasses the canonical guidance contract.** `ComplianceDemo` in `frontend/src/components/landing/ComplianceDemo.tsx` renders `VerdictCard` directly from raw `agreement.*` fields in `frontend/src/data/landingDemo.ts`, passing `direction: "Bullish"` as the headline. It never reads `guidance.publicLabel`, so the marketing surface can present a verdict style the real product does not issue. Migrating it changes the rendered headline to the approved public label and therefore **requires new Linux Playwright baselines reviewed in CI** — a macOS capture cannot satisfy Linux CI (see item 1.11). Must be done in a separately reviewed landing/copy PR | Proven, deliberately deferred | 6, 7, 13 | None |
| 2.16 | **`landingDemo.ts` publishes `riskLevel: "Medium"`.** `docs/VERDICT_CONTRACT.md` §9.1 states `MEDIUM` is not a value this system produces in either field, and `backend/tests/testGuidanceContract.js` explicitly rejects both `"Medium"` and `"MEDIUM"` as incoherent. The landing demo therefore shows a risk level the live contract refuses to publish. Fix alongside item 2.15, not before | Proven, deliberately deferred | 7 | None |

**Not fixed in PR 2 by explicit instruction.** PR 2 was scoped to canonical evidence
vocabulary and payload ownership with zero behaviour, wording or snapshot change.

## PART 3 — ADD (in order)

| # | Item | Status | Rules | Cost |
|---|---|---|---|---|
| 3.1 | **Design System Phases 1–2** (token migration; truth-chip/state system) per `docs/DESIGN_SYSTEM.md`; update the 4 visual snapshots + add 2 Shariah ones | Planned | 5, 14, 18 | None |
| 3.2 | **Terms of Use + Privacy Policy pages** — draft with Tahir Khan sahib's input so wording matches UAE positioning from the start | Not Built (audit N4) | 20, 23, 24 | Legal drafting (non-code) |
| 3.3 | **Accounts + database + tier flags as ONE project on Supabase** — not three projects. Includes: auth on every API route, per-user watchlist/portfolio (replacing the shared world-writable JSON files), server-side entitlement middleware (single choke point), tier *flags* only. **Payments must NOT go live before the UAE regulatory memo exists (Rules 24/26).** | Not Built | 21, 23, 26 | Supabase free tier initially; verify limits before relying on it |
| 3.4 | Token-economics hardening: treat 5 tokens/screening as a one-sample estimate; verify against the provider dashboard after the next few screenings and adjust `HALAL_TERMINAL_ESTIMATED_TOKENS_PER_REQUEST` if wrong | Single data point | 17 | None (observation only) |
| 3.5 | Trust/understanding metrics (privacy-respecting, designed after 3.3) | Not Built | 22, 23 | Depends on tooling; prefer free/self-hosted |
| 3.6 | Historical verdict evaluation (store verdicts + outcomes for honesty review) | Not Built | 18, 22 | Needs 3.3's database first |
| 3.7 | Design Phases 3–4 (density/motion; signature aperture) — beauty last, per your own rule | Planned | 18 | None |

### [PENDING BEFORE PUBLIC LAUNCH] Durable storage (carried forward deliberately — do not start yet)
Paid Render Key Value (Valkey) or Supabase-backed storage is intentionally parked: at one user with 177 tokens the problem does not exist, and it must be built **once, together with accounts (3.3), not twice**. When resumed, the requirements stand as previously specified: durable Shariah cache with TTL and versioned keys (symbol + provider + contract version); atomic token reservation with UTC monthly rollover that cannot carry spend across months or reset early; multi-instance concurrency safety; authoritative-vs-estimated balance labelling preserved (`locallyEstimatedUsed`/`locallyEstimatedRemaining`, provider dashboard authoritative); fail-closed behaviour on storage/provider outage (no unreserved live call, degraded/unknown screening, verdict withheld — never guessed); zero-network tests for hit/miss/TTL/restart/concurrency/rollover/outage; rollout behind explicit env config with staged verification. **Cost when built:** small paid Valkey instance or Supabase paid tier — approve explicitly at that time. Current reality it mitigates: the in-memory Shariah cache dies on every Render spin-down (so the 24h cache rarely helps), and a wiped ledger makes the budget guard *more permissive*, not dangerous.

## PART 4 — REMOVE / STOP CLAIMING

- The **"AzaLens Pro" upsell** (1.2) — stop claiming a paid tier exists.
- The landing **BUY mockup** (1.1) — stop displaying a verdict style the product forbids.
- The stale claims in **PRODUCT_BUILD_STATUS.md** and the old roadmap (1.7) — both under- and over-claimed.
- Dead code: `App.tsx`, `LiveAnalysisTest.tsx`, legacy dashboard panels, stale `design/colors.ts`/`typography.ts`, empty feature dirs (1.9, 2.10).
- `backend/fixtures/shariah/` either gets real fixture files (from the recorded META response, sanitized) or fixture mode should say clearly it has no data (audit V10).

## PART 5 — NON-CODE TRACKS (run in parallel, gate launches)

- **Track A — Scholarly review** (Mufti Ejaz Ahmed Samadani sahib): prerequisite artifacts = Phase 0 items 1.1–1.4; frame as review/correction, never endorsement (Rule 25); afterwards, record his corrections as roadmap items.
- **Track B — UAE regulatory memo** (Tahir Khan sahib): written perimeter memo covering permitted activities, licensing, wording, countries, entity type (Rule 26). **Hard gate:** no external beta, no payments, until it exists. Product boundaries determine the licence — not vice versa (his review of the current no-execution/no-custody/no-advice posture in audit Part 3-B is the starting evidence).
- **Track C — Controlled beta gate** (Rule 20): opens only after Phase 0 + 2.1–2.5 + 3.2 + Track B, with incident ownership named.

## OPEN-ITEMS REGISTER (all seven originals + audit additions)

| Item | Where handled |
|---|---|
| 1. Local CI run not confirmed for `92d483c` | 2.2 |
| 2. `diag/proxy-capture` branch cleanup | 2.7 |
| 3. Finnhub missing `.catch` crash path | **1.5 (promoted to Phase 0)** |
| 4. Five CI-safe suites unregistered | 2.1 (now eleven unregistered total) |
| 5. Leftover `alpha-lens-ai` Vercel project | 2.9 |
| 6. Shared strict 10/min budget tight | 2.6 |
| 7. `trust proxy = 3` fragility | 2.8 |
| New: stranger token-drain (N1), unused intelligence endpoint (N2), cold-start (N3), no legal pages (N4), landing divergence (N5), provider attribution (N6), watchlist cap (N7) | 2.5, 2.4, 1.8, 3.2, 1.1, 2.11, 2.12 |

## WHAT IS GENUINELY DONE AND HOLDS (carry no anxiety about these)

Verified at `92d483c` (evidence in the audit): the server-side Shariah compliance gate on every verdict-bearing surface; INTACT/VIOLATED/REVIEW end to end with CI-registered tests; CORS allowlist (project-and-account-scoped previews, no `*.vercel.app`); layered rate limiting with a genuinely shared strict budget and verified `trust proxy = 3`; the cost-safe scanner (server-side membership + 20-cap, one history call per symbol, zero Shariah calls); the honest dashboard with no auto-analysis token leak; functional local settings; equities-only dynamic search; the fail-closed Shariah runtime with dev guard and budget ledger; blocking CI on every push/PR.

The philosophy is now enforced in the product core. What remains is making the *outside* of the product — landing, docs, legal surface, and the paid-tier fiction — as honest as the inside.
