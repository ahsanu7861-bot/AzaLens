# AzaLens — What To Do Next (Master Roadmap)

**Date:** 2026-07-30 · **Baseline commit:** `92d483c` (`main`, clean, synced with origin)
**Status vocabulary (Rule 7):** Verified / Partially Verified / Planned / Blocked / Not Built.
**This file replaces the 2026-07-28 version entirely** — that version was stale in both directions (it denied the compliance gate, INTACT/VIOLATED, rate limiting and CI, all of which exist; full reconciliation in `docs/AUDIT_2026-07-30.md`).

Companion documents: `docs/AUDIT_2026-07-30.md` (verification evidence), `docs/CONSTITUTION_COMPLIANCE.md` (rule-by-rule), `docs/DESIGN_SYSTEM.md` (visual plan).
**Cost note convention:** every item states its provider/infrastructure cost. Budget reality as recorded on 2026-07-30: Halal Terminal free plan, ~177 tokens to 28 Aug 2026, ~5 tokens per screening (single data point); Render Free; Vercel free. Superseded on 2026-08-24 by the promotional Starter entitlement recorded under the production environment audit — see Finding 3 there, which also records why the application's internal budget value was left unchanged.

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
| 1.3 | **Methodology & Limitations page** (user-facing): AAOIFI version, thresholds (30% debt/assets, 5% impermissible income), screening source description (within Rule 12 limits), 24h-cache / 7-day-stale rules, swing horizon + data delays, purification explanation, "not a fatwa" | **Released and exact-SHA verified** in PR #28 merge `00e29b934b3efba6355ac8e7c1d1d0085d2dca7f`; CI run `32536321705` passed, Render and Vercel identify that merge, and the public desktop route was verified. Mobile production-browser observation remains qualified by exact served-build identity plus accepted mobile Linux visual coverage, not a direct mobile production session. The page distinguishes AzaLens's internal contract v0.5.0 from the provider-stated AAOIFI Standard No. 21, disclaims accreditation/endorsement and leaves the precise external edition unverified. Future scholar/provider review may require correction; this release does not independently validate the 30%/5% research boundaries. | 11, 15, 25 | None |
| 1.4 | **Purification section in the Shariah workspace** (today it is one metric row) | **Released and exact-SHA verified** in PR #28 merge `00e29b934b3efba6355ac8e7c1d1d0085d2dca7f`; the provider-reported rate is now a dedicated panel, unavailable is explicitly not zero, and AzaLens does not calculate personal purification obligations. Two focused purification baselines and four public-methodology baselines are active alongside the six reviewed landing replacements; all 24 Linux comparisons passed on merge-SHA CI run `32536321705` with zero missing, mismatched or silently written snapshots. | 4, 11 | None |
| 1.5 | ~~**Fix the Finnhub crash path**~~ — **already fixed; no implementation was required in PR A.** `derivedQuotePromise.catch(() => {})` is present in `backend/providers/finnhubProvider.js`, with a source comment explaining why a no-op catch marks the promise handled for Node's tracking without swallowing the rejection for a real awaiter. Focused coverage lives in `backend/tests/testFinnhubQuoteRejectionSafety.js` and is registered in `backend/tests/runCiSuite.js`, so ordinary CI protects it. The old line reference (`581–586`) is stale — the fix sits earlier in the file after later edits. **Carry-forward:** the Twelve Data quote adapter added in PR A reproduces the same coalescing shape, so `backend/tests/testTwelveDataQuoteRejectionSafety.js` now carries the same invariant, and it must stay registered when the Finnhub suite is eventually removed. | **Verified — closed.** Re-verified against `32d7066` on 2026-08-22 | 8 | None |
| 1.6 | Title → "AzaLens" (drop "AI"); purge the `AlphaLens` remnant in `StockChart.tsx` | Violation (audit V12) | 2 | None |
| 1.7 | **Docs truth sweep**: refresh `docs/PRODUCT_BUILD_STATUS.md` (its "Verified Status 2026-07-28" is now false about rate limiting/CI); this file supersedes the old roadmap | Stale (audit V1–V6) | 7 | None |
| 1.8 | **Demo-day runbook**: warm the backend ~10 min before each meeting (Render Free cold start looks broken); optionally pre-screen the demo tickers with your explicit approval | Planned (audit N3) | 17 | 0 or ~10–15 tokens, user-approved |
| 1.9 | Delete dead fabricated code: `App.tsx` (hardcoded BUY plan), `LiveAnalysisTest.tsx`, unused `components/dashboard/*` legacy panels, empty `features/analysis` + `features/auth` dirs | Dead code present (audit V11) | 6, 7 | None |
| 1.10 | **Register `--color-shariah` in the Tailwind theme — and verify the eyebrow separately.** `frontend/src/index.css` defines `--az-shariah` in both the night (`:root, [data-theme="night"]`, line 44) and day (`[data-theme="day"]`, line 75) blocks, but the `@theme inline` block (lines 3–21) never maps it to `--color-shariah`. Result: `text-shariah`, `bg-shariah/…`, `border-shariah/…` classes used throughout `IslamicCompliance.tsx` generate no Tailwind utility and are inert — confirmed live (2026-07-31) via computed-style check in the browser. Fix: add `--color-shariah: var(--az-shariah);` to the `@theme inline` block, alongside the existing `--color-intelligence` line. **This registration alone may not fully fix the visible symptom**: the "Islamic Compliance" eyebrow (`<p className="az-eyebrow text-shariah">`) currently renders in the same brand-cyan color as other eyebrows because `.az-eyebrow` in `index.css` (~line 474) sets `color: var(--az-brand)` directly, which — given equal selector specificity and its later position in the cascade — appears to win over a `text-shariah` utility class regardless of whether that utility exists. Registering the token restores `bg-shariah`/`border-shariah` (backgrounds, borders, badges) but the eyebrow text itself may need an explicit override (e.g. dropping `az-eyebrow`'s forced color for this instance, or a more specific selector) to actually show purple. The dedicated fix must verify both — token registration *and* the eyebrow's rendered color — rather than assuming the token alone resolves every Shariah color. **Fixed locally (2026-07-31, branch `fix/shariah-theme-token`, not yet merged):** `--color-shariah: var(--az-shariah);` added to `@theme inline` (`frontend/src/index.css`) — confirmed via production build that `text-shariah`/`bg-shariah/…`/`border-shariah/…` now compile to real rules, and that Tailwind's generation order places `shariah` after `intelligence` for every shared property, so the AAOIFI badge's mixed `variant="brand"` + `border-shariah/20 bg-shariah/15 text-shariah` classes resolve to Shariah-purple, not brand-cyan, with no further change needed there. The "Islamic Compliance" eyebrow (`IslamicCompliance.tsx:178`) was confirmed — by comparing compiled byte-offsets — to lose to `.az-eyebrow` on cascade order (equal specificity, `.az-eyebrow` declared later in `index.css`), exactly as suspected; fixed with a local `style={{ color: "var(--az-shariah)" }}` on that one element (inline styles win over any author-stylesheet rule without `!important`), leaving the shared `.az-eyebrow` rule and every other eyebrow (e.g. `AAOIFI Status`, `AI Verdict`) untouched. Regression coverage added: `frontend/scripts/checkDesignTokens.mjs` (token registration + exact night/day hex pinned) and `frontend/src/designTokens.test.tsx` (eyebrow color override, Shariah badge/border classes present, other eyebrows unchanged). Verified live in the browser in both themes at desktop and mobile widths, on both the real analysis page and the landing-page demo, with zero console errors. Night/day `--az-shariah` hex values (`#a78bfa` / `#6d28d9`) were not changed — contrast was already passing and remains so. | Confirmed bug, found during Phase 0 item 1.1 verification | 7 | None |
| 1.11 | **Capture Linux landing-page visual baselines in CI.** All eight committed baselines cover `/analysis/AAPL` only; there was **no landing baseline at all**, so Playwright visual CI was *structurally incapable* of observing `Navbar`, `Hero`, `MarketSnapshot`, `ProductPreview` or `ComplianceDemo`. That makes this item a **verification prerequisite** for items 2.15–2.17 rather than a parallel task: without it, the landing copy and verdict corrections would merge with no pixel evidence that they rendered as reviewed. It is therefore executed **inside** the same branch, as a gated sequence. `frontend/e2e/landing-visual.spec.ts` adds **six** captures — full page at {desktop, mobile} × {day, night}, plus the confirmed verdict card scoped at desktop and mobile. Six is the minimum: page level has exactly two independent axes, and the two scoped captures exist because `maxDiffPixelRatio: 0.005` is a fraction of *total* pixels (~33,000 px on a desktop full-page landing capture), so a reverted horizon badge would pass a full-page comparison silently. **Candidate artifacts are review evidence, never accepted baselines.** A *candidate* is a review-only PNG written by `frontend/scripts/captureLandingCandidates.mjs` into the gitignored `frontend/candidate-artifacts/`, prefixed `candidate--`, uploaded from CI with a manifest recording commit, tree, dimensions, byte size and SHA-256; that path never calls `toHaveScreenshot`, so it cannot write a baseline by any code path. An *accepted baseline* is a `…-chromium-linux.png` under `frontend/e2e/landing-visual.spec.ts-snapshots/`, committed only after a human has reviewed the exact candidate bytes. Acceptance required separate explicit authorisation, which was given only after review. **Four candidate rounds were produced and the first three were refused**: artifact 9345222289 for the canonical label fragmenting mid-word and for a sticky header composited across both scoped captures; the next round for the fixed skip link printing inside the mobile scoped capture; and artifact 9358964813 for two Shariah badges escaping their metric cards. **A fifth defect was then found by CI rather than by eye**: the candidate pipeline captured at `page.screenshot()`'s default `scale: "device"` while `toHaveScreenshot()` compares at `scale: "css"`, so at iPhone 13's DPR 3 every mobile candidate — and the three mobile baselines first accepted from them — was exactly 3× oversized and invalid. The capture was corrected to pin `scale: "css"` explicitly with a measured CSS-geometry contract, the three invalid mobile baselines were replaced from the corrected artifact 9377060705, and all six landing baselines now share that single artifact provenance. **Lesson recorded:** the invalid mobile candidates were byte-identical across two consecutive artifacts, and that stability was briefly mistaken for correctness — agreement between two outputs of the same pipeline proves stability, not correctness; validity requires checking against the independent consumer contract. To make the boundary enforceable rather than customary, `frontend/playwright.config.ts` sets `updateSnapshots: process.env.CI ? "none" : "missing"` — verified against the installed Playwright 1.62 source (`matchers/expect.js` `handleMissing`), where the default `"missing"` writes the baseline and *then* fails, while `"none"` fails without writing. Baselines remain Linux-only: a macOS session emits `-darwin.png`, which cannot satisfy Linux CI and must never be committed. **Final ordinary CI compared against the committed reviewed Linux baselines with snapshot writing disabled:** run 32286962555 on head `e5f4a2a2` passed **14/14** screenshot comparisons — eight analysis and six landing — with zero missing snapshots, zero mismatches, every silent-write marker absent, the failure-evidence upload skipped and no Darwin baseline. The eight pre-existing analysis baselines remain byte-identical to `main`. | Verified in PR #22 — merged at `83ff832510a9b7fda7c1de8d87cf94411a4c41b4`; exact-merge Reliability Gates run `32354974967` passed; Render and Vercel serve that exact merge; desktop production-browser verification passed; fresh mobile production-browser verification remains explicitly PARTIAL | 7 | None |

### PR #22 durable release record (2026-08-20)

PR #22 merged at exact merge SHA `83ff832510a9b7fda7c1de8d87cf94411a4c41b4` (tree `73bb1a625df688e9668f61a156c8262e3ad38675`). Exact-merge Reliability Gates run `32354974967` passed: backend **41/41 suites**; frontend **161/161 tests across 17 files**; browser journeys **13 passed with one documented skip**; and all **14/14** committed Linux screenshot comparisons passed with zero missing or mismatched snapshots, all five silent-write markers absent, the no-baseline-written proof passing, the failure-evidence upload skipped and no Darwin baseline. The six landing baselines are now active verification coverage alongside the eight unchanged analysis baselines, so item 1.11 is operational rather than merely planned.

Production identity was verified independently. Release-scope classification reported `backendChanged: true` and expected commit `83ff832510a9b7fda7c1de8d87cf94411a4c41b4`. Release Health run `32355210905` passed with Render liveness/readiness at HTTP 200 and `deployment.commit` equal to that SHA; three later health samples remained healthy at the same production commit. Vercel deployment `E6wrtGeSR` is **Ready**, **Production**, current on `www.azalens.com`, and sourced from `main` at `83ff832`; pre/post asset names differ, so the frontend deployment is observable rather than inferred. Desktop production-browser verification passed with the approved positioning, canonical verdict and horizon, no old AI/model claims, no dead anchors or `Start Free`, no AzaLens console errors and no horizontal overflow. A fresh mobile production-browser session remains **PARTIAL** because the independent cloud browser exposed only a fixed desktop viewport; exact-merge Linux CI did compare the reviewed mobile baselines successfully, but that is not restated as a fresh mobile production session.

Items 2.15–2.17 are live: the landing demonstration publishes the canonical guidance label and horizon; the invalid `riskLevel: "Medium"` fixture data was removed as **latent drift that was never visibly rendered**, not as a previously visible risk defect; and the public landing copy, metadata, social preview and GitHub repository description/homepage no longer present deterministic computation as AI. The landing agreement input remains hand-authored; only the published guidance presentation is re-derived through the real guidance engine. Nothing in PR #22 empirically validates, calibrates or proves the accuracy of unrelated risk thresholds, penalties or evidence-model behaviour. Provider-backed analysis calls and provider cost for release verification: **zero**.

All Phase 0 items need one later, separately approved code session (this session was read-only + docs by instruction).

### PR A durable release record — Twelve Data provider parity (2026-08-23)

PR #30 merged at code merge SHA `7c64801fa7888db0bac8c5cd9d98bb2666188baf`
(tree `52ca2695d153d74560fe94a9bd04b478084f271c`), combining two commits:
`87f0561d` (provider parity, configuration, cache and observability) and
`5fecf6a4` (malformed-input and market-delay safety). 21 paths, +6,362/−142.

Exact-merge Reliability Gates run `32656193126` passed on that SHA: backend
**48/48** deterministic suites without live-provider credentials; frontend
**172/172 across 18 files**; browser journeys **15 passed with one documented
skip**; visual **12/12 test cases**. All 24 committed Linux baseline blobs are
byte-identical to the pre-merge base, no Darwin baseline exists, every
silent-write marker is absent, the no-baseline-written proof passed and the
failure-evidence upload was skipped.

Exact-merge Render production verification passed. Production Release Health run
`32656346129` recorded both outcomes faithfully: **attempt 1 failed** while
Render still served the previous deployment (`expectedCommit 7c64801f…`,
`deployedCommit 00e29b93…`), and **attempt 2 passed** after the production
configuration was corrected, with backend liveness HTTP 200, backend readiness
HTTP 200 and deployed commit equal to expected commit. Three spaced
provider-safe `/health/live` samples returned HTTP 200 and healthy at the exact
merge SHA with coherent uptime and no intervening restart.

Vercel deployment `6050926601` is associated with the merge SHA and production
is healthy, but the frontend tree is byte-identical to the merge's first parent,
so served assets cannot discriminate this backend release. That result is
recorded as **QUALIFIED**, not as proof of backend identity.

**The production configuration defect this release exposed.** Render production
carried `PROFILE_PROVIDER=twelve_data` without `TWELVE_DATA_PROFILE_ENABLED=true`.
Before PR A that combination silently served Finnhub company profiles while the
deployment appeared configured for Twelve Data. PR A's strict boot validation
refused startup on the contradiction rather than continuing, which is how the
drift became visible. Ahsan restored `PROFILE_PROVIDER=finnhub`;
`TWELVE_DATA_PROFILE_ENABLED` was not enabled, and no Twelve Data
production-profile activation occurred.

Production provider ownership after this release:

| Capability | Provider |
|---|---|
| quote | Finnhub |
| profile | Finnhub |
| search | Finnhub |
| history | Twelve Data |
| fundamentals | Finnhub |

Historical OHLCV already used Twelve Data before this release and continues to.

**What PR A establishes:** technical parity for the Twelve Data quote, search and
profile capabilities behind explicit configuration, provider- and
contract-version-qualified cache and pending-request identities, boot validation
and strict readiness derived from the active capability selection, and strict
rejection of malformed numeric and market-delay input.

**What PR A does not establish:** endpoint-plan access, consolidated-feed
quality, commercial licensing, external-display rights, or authorization for
PR B. External-display authorization is `UNKNOWN/UNVERIFIED` — neither confirmed
in writing nor ruled out. The closed-demo gate is an access control, not a
licensing determination. Passing contract tests show the adapters normalize
correctly; they say nothing about what the current plan reaches or what may be
shown publicly.

*(Superseded on 2026-08-24 as a statement of current knowledge, and accurate as
a historical record of what PR A itself established: Twelve Data has since
answered in writing, and external-display rights for authenticated users are
confirmed for the **Venture** business tier — not for the free Basic plan
AzaLens currently holds. See "Twelve Data licensing clarification", Findings
TD-1 to TD-3.)*

IPO date remains intentionally omitted rather than fabricated. It feeds no
calculation, verdict, indicator, risk value, guidance state, Shariah gate or
scanner decision, and it is not sourced from Finnhub enrichment or from the IPO
calendar endpoint.

*(Corrected 2026-08-24. Two statements above were wrong as written. The IPO
calendar costs **40 credits per request**, not 100, and IPO Calendar **is
available** on the Venture tier — so the omission is a deliberate
cost-and-contract decision, not a technical unavailability. See Finding TD-10.)*

**Visual comparison-level evidence is `PARTIAL`.** CI directly observes 12
Playwright test cases; the reporter does not enumerate individual screenshot
assertions, so comparison counts are derived from the spec structure and the
baseline mapping rather than read from the reporter. This is a
reporter-granularity limitation, not evidence of a visual defect. Adding a list
or JSON reporter is a future CI-touching follow-up and was not done in this
release.

*(Arithmetic corrected 2026-08-26 — the earlier phrasing "the 24 screenshot
comparisons" was imprecise about where the number comes from, and a later note
compounded it by claiming two baselines are compared twice. Both are restated
durably here.)* At this SHA, the visual suite contains 24 tracked Linux baseline
files, seven assertion sites and twelve visual test cases. Twenty-four
comparisons execute: five assertion sites execute across both themes and both
projects, while two sites execute only for the night theme across both projects.
Twenty-eight is only the structural maximum obtained by multiplying all seven
sites by two themes and two projects; it is not the executed count. The two
night-only sites are `analysis-purification` (`frontend/e2e/visual.spec.ts`,
inside `if (theme === "night")`) and `landing-verdict`
(`frontend/e2e/landing-visual.spec.ts`, same guard). Because 24 comparisons run
over 24 files, **each baseline file is compared exactly once**; no file is
compared twice.

Finnhub removal remains blocked on plan and endpoint-access evidence, written
licensing evidence, and a separately authorized production provider switch.
PR B requires that written provider and plan confirmation alongside parity
evidence, verified cache transition and explicit production authorization.
PR C removes Finnhub only after stable production observation following PR B.

*(Updated 2026-08-24: the **written licensing evidence** named here has since
been received. Every other blocker in this paragraph stands, and new obligations
were added — attribution, composite-pricing disclosure, raw-versus-derived data
lifecycle controls, and an active qualifying business subscription. See Finding
TD-13 for the current PR B boundary.)*

Provider-backed requests made for this release and its verification: **zero**.
Provider cost: **zero**.

### B7 durable release record — provider attribution (2026-08-26)

Three merged slices, recorded together because none of them is intelligible
alone. B7-0 carried provenance, B7a decided wording, B7b rendered it.

**B7-0 — history provenance contract.** Merged before B7a. It preserves the
provider label that `GET /history/:symbol` already sends, through the typed
frontend contract and into StockChart's **atomic** bars/provenance state, so no
render can observe one response's bars beside another response's provider. It
renders **no attribution by itself**. Provider identity is read from the
response and is never inferred from `DEFAULTS`, `HISTORY_PROVIDER`, the
environment, the symbol or the endpoint name — deriving it would keep asserting
an origin after the selector moved.

**B7a — attribution registry and component.** Merge
`d54bc9f3909278f8abd03fca79bb8ecceb61c4e8`, tree
`d57e0ce20d4d2515054d126be3521bae16e33d6e`. It stores the exact phrase **"Data
provided by Twelve Data"**, text-only, with no logo and no variant mechanism.
Normalization accepts the exact backend label **`TwelveData`** and nothing else;
unknown, absent or differently cased providers resolve to **no attribution**,
never to a Twelve Data fallback. **Halal Terminal remains absent from the
runtime registry** because its exact wording and its external-display permission
are both unresolved — it exists only as a type-level blocked id carrying no
text, href or renderable object. B7a was **mounted nowhere** and tree-shaken out
of production assets at that release: the phrase and href appeared in zero
emitted chunks.

**B7b — history-chart attribution.** PR #37. Implementation commit `cf306ee`;
ResizeObserver test-race correction
`8a0400438d52dd545830557511294987806e7c68`; baseline-acceptance commit
`d774f985eb304b1b6527f3f4002958b705058555`; merge
`9e30911a495ddb74099239b4409d16eea0ac117c`, first parent
`d54bc9f3909278f8abd03fca79bb8ecceb61c4e8`, second parent
`d774f985eb304b1b6527f3f4002958b705058555`, tree
`29534d48f0b1a636fb8e86d838d342be762182e0`. Eleven first-parent changed paths;
**951 insertions and 68 deletions**; exactly four reviewed Linux overview
baselines accepted. No amend, squash, rebase or force-push at any point.

The chart footer now carries two block lines — the Twelve Data credit above the
existing TradingView credit — as two separate anchors making two separate
statements, so neither can be read as supplying the other's service. Visibility
is **provenance-driven, not presence-driven**: the Twelve Data line renders only
when the request is not loading, not errored, and the registry *resolves* the
provider the response actually declared. This deliberately differs from the
TradingView credit, which renders unconditionally because it credits a charting
library present whenever the component renders.

**Verification.** Exact-head CI run `32901204664` and exact-merge CI run
`32901633348` (event `push`, branch `main`, head exactly the merge SHA) both
passed **all five jobs**. Frontend **266/266**; browser journeys **19 passed
with one pre-existing skip**; visual **12/12**, exercising **24 executed
screenshot comparisons**. No baseline was written during verification, and
**zero Darwin baselines** exist. Release scope reported:

```
{"backendChanged":false,"expectedCommit":"","deploymentAttempts":1}
```

No Render deployment was required — all eleven changed paths are under
`frontend/`. Provider-backed calls: **zero**. Provider credits and cost:
**zero**. The Twelve Data trial was **not** started.

**Baseline verification, reproducible only.** Before acceptance, `git diff`
against `HEAD` for the baseline paths was empty where applicable, and every
working file was compared against its **index blob OID**. After B7b, all 24
tracked baselines are byte-identical to the merged index. Exactly four overview
baselines changed, through the separately reviewed Linux candidate workflow;
the other 20 remained unchanged. *(An earlier working digest recorded during
planning was not reproducible from any derivation and is deliberately not
retained; blob-OID comparison replaces it and needs no convention.)*

**Production verification — stated at exactly the strength supported.**
Production-served frontend assets contain the B7b attribution phrase and href
**exactly once each, in the StockChart chunk**, reached by traversing the served
module graph from `index.html`. The first-parent tree was independently rebuilt
from `git archive` and its build contained **neither** the phrase nor the href,
so the served bytes **discriminate B7b from its parent**. On that basis Vercel
verification is an **unconditional served-asset PASS**.

Its limits are equally part of the record. **Vercel deployment identity was not
obtained from the Vercel API**, because no CLI or token was available; identity
rests on served content that only the B7b tree can produce, plus HTTP 200 and
Vercel response headers. **No provider-backed production history request was
made**, and **no authenticated live production chart was observed rendering the
attribution during this verification**. It must therefore **not** be stated
without qualification that tool observation proved the attribution visibly
rendered from live provider data in production. What is proven is narrower and
still substantial: CI and browser evidence prove the attribution **renders for a
`TwelveData`-labelled history response**, and served-asset evidence proves the
**implementation is deployed**.

**Reconciliation with Finding P-A.** B7b implements the Twelve Data attribution
requirement on StockChart whenever the history response identifies `TwelveData`,
and the production frontend serving that implementation is verified. This
**closes the known missing implementation for the history chart at the code, CI
and deployed-asset levels**. It is **not** a legal-compliance determination; it
is **not** evidence of a provider-backed production transaction; and it does
**not** resolve attribution treatment for locally derived analytics or for other
surfaces.

#### Open findings recorded by this pass (none authorized for fix here)

1. **Local snapshot-write hazard.** `frontend/playwright.config.ts` sets
   `updateSnapshots: process.env.CI ? "none" : "missing"`, so the "none"
   guarantee applies **only under CI**. A plain local visual run can therefore
   **silently create Darwin baselines inside tracked snapshot directories**. All
   B7b browser runs forced `CI=1`, and **zero Darwin baselines were created**.
   This is a tooling/configuration follow-up, **not a B7b defect**. Likely
   remediation is unconditional `"none"` with a deliberate opt-in acceptance
   mechanism, but **no fix is approved by this docs pass**.

2. **TradingView attribution/licensing follow-up.** `StockChart` sets
   `attributionLogo: false`, suppressing the charting library's own watermark,
   while AzaLens renders a separate "Charts powered by TradingView Lightweight
   Charts™" text link. B7b **preserved this arrangement unchanged**. **No
   determination has been made that the substitution satisfies the library's
   licence.** Verify against authoritative TradingView Lightweight Charts
   licensing and attribution requirements before altering or relying upon it.

3. **Footer contrast.** The existing inherited 11px muted footer colour was
   **preserved**; B7b changed no colour or contrast token. Automated
   accessibility checks found **no serious or critical issue**. Visual contrast
   improvement was **explicitly deferred** and remains a separate UI decision.
   Do **not** call it a confirmed accessibility failure without measured
   evidence.

#### Unresolved boundaries carried forward unchanged

- **Derived-output attribution remains unanswered by Twelve Data.** The
  guidelines are silent on output computed from provider data; silence is not
  permission, and B7b makes no claim there.
- **The closed-demo / internal-use exception remains unanswered.**
- **Halal Terminal's exact 10 August attribution wording is not retained in
  repository evidence**, and must not be guessed, paraphrased, or substituted
  with Twelve Data's wording.
- **Halal Terminal Starter-versus-Enterprise external-display permission remains
  unanswered.**
- **Mixed-provider surfaces remain blocked** from attribution completion until
  Halal Terminal evidence exists.
- **B1 remains separate and unimplemented.**
- **No production provider switch is authorized.**

**Backup — recorded honestly.** `AzaLens-2026-08-26-9e30911.zip` and
`AzaLens-2026-08-26-9e30911.sha256`. ZIP size **6,802,032 bytes**; ZIP SHA-256
`04d3f243c4a2bb848e3c3bcfc1987bc3e9839cbd7946ec9619e0c7c0ff484601`. Built with
`git archive` from the exact merge commit object; unzipped and re-hashed, the
archive **reconstructs tree `29534d48f0b1a636fb8e86d838d342be762182e0`** — the
exact merge tree — with all eleven first-parent paths byte-correct. Local
staging and the Google Drive CloudStorage sync-folder copies were
**byte-identical**; the Drive-folder count increased **57 to 59**, and the **56
pre-existing objects were unchanged**.

**Transport was the local Drive sync folder, not a Drive API upload and not an
independent server download.** Cloud propagation is asynchronous and was **not**
independently verified, so this is **not** independent server-backed Drive
verification. Backup staging and both candidate sets — the Darwin
implementation-design candidates and the exact-head Linux candidates — remain
retained.

### Production environment audit — closed 2026-08-24

The follow-up opened by the PR A record on 2026-08-23 is closed by this entry.

Why it was opened: `PROFILE_PROVIDER` became known only because PR A's strict
boot validation rejected its contradictory production value. That was a narrow,
accidental observation, not an audit. `QUOTE_PROVIDER`, `SEARCH_PROVIDER`,
`HISTORY_PROVIDER` and `FUNDAMENTALS_PROVIDER` had not been observed, and source
defaults, documentation and local configuration do not prove deployed
environment configuration.

**Method.** Ahsan manually observed the complete Render production backend
environment and supplied a sanitized inventory — variable names, provider
identifiers, booleans and safe numeric values — on 2026-08-24. Secret values
were never requested, supplied or read; secret-bearing variables were reported
only as present. That inventory was compared against the deployed code contract
at code merge `7c64801fa7888db0bac8c5cd9d98bb2666188baf` by static reading of
the code at that exact SHA. No HTTP request, provider call, endpoint probe or
environment change was made. Provider-backed requests: **zero**. Provider cost:
**zero**.

The full audit report was retained outside the repository at the session scratch
path `.../scratchpad/PRODUCTION_ENV_CONTRACT_AUDIT.md`, SHA-256
`decc1869d5d98a42e3be6b0a7a8b4614274b60d258461b3fd38743e029a00549`. It is not
committed, and session scratch storage is not durable, so the findings below are
the durable record.

**Finding 1 — provider ownership is mostly established by source defaults, not
by Render.** Of the five capability selectors, only `PROFILE_PROVIDER` appeared
in the supplied inventory, explicitly set to `finnhub`. `QUOTE_PROVIDER`,
`SEARCH_PROVIDER`, `HISTORY_PROVIDER` and `FUNDAMENTALS_PROVIDER` were absent
from it. Dashboard absence and effective runtime ownership are different facts
and are recorded separately:

| Capability | Effective provider at `7c64801f` | Established by |
|---|---|---|
| quote | Finnhub | frozen source default; `QUOTE_PROVIDER` absent from the inventory |
| profile | Finnhub | explicit Render value, equal to the source default |
| search | Finnhub | frozen source default; `SEARCH_PROVIDER` absent from the inventory |
| history | Twelve Data | frozen source default; `HISTORY_PROVIDER` absent from the inventory |
| fundamentals | Finnhub | frozen source default; `FUNDAMENTALS_PROVIDER` absent from the inventory |

Those defaults live in `DEFAULTS` in `backend/providers/marketDataProvider.js`,
are frozen with `Object.freeze`, and are pinned byte-for-byte by
`backend/tests/testProviderAdapter.js`. They are authoritative at runtime. They
are not explicit Render configuration and must never be described as such.

**The durable rule this establishes:** the Render dashboard is not a statement
of what production does. Deployed configuration must be derived from the
deployed code contract and the observed inventory together, never from either
alone. An audit reading only the dashboard would find one selector configured
and would infer nothing correct about the other four.

The `PROFILE_PROVIDER` contradiction recorded above is closed.
`PROFILE_PROVIDER=finnhub` agrees with the source default, and
`TWELVE_DATA_PROFILE_ENABLED` was absent from the inventory, so no capability
selects a Twelve Data implementation whose feature flag would refuse it. The
audit found no other invalid provider configuration, and no provider variable
that the deployed code requires and production omits.

**Finding 2 — `FEATURE_LIVE_SHARIAH_ENABLED` is a boot-time consistency guard,
not the operational kill switch.** The inventory supplied
`FEATURE_LIVE_SHARIAH_ENABLED=true`. In the deployed code it is read only by
boot validation, where it asserts that `SHARIAH_DATA_MODE=live` and that
`HALAL_TERMINAL_API_KEY` is present. It gates no provider request.

Setting it false would remove that validation and would not independently stop
paid Halal Terminal calls. Operational behaviour is controlled through the
Shariah data mode, the Halal Terminal live setting and the token-budget
controls.

The name and the semantics disagree, which is the same class of hazard as the
`PROFILE_PROVIDER` drift: a control that reads as protective and is not.
Correcting it — by giving the flag runtime effect, or by renaming it to the
assertion it is and pinning that with a test — requires a separately authorized
documentation or code-contract correction. This roadmap pass changes no flag, no
variable and no runtime behaviour.

**Finding 3 — the Halal Terminal token budget is not a durable calendar-month
cap.** Render supplied `HALAL_TERMINAL_MONTHLY_TOKEN_BUDGET=30`.
`HALAL_TERMINAL_USAGE_LEDGER_PATH` was absent from the inventory, so the usage
ledger resolves to its source default inside the deployed application directory,
on Render's ephemeral filesystem. A deployment or restart may erase recorded
consumption, and month-to-date spend restarts from zero when it does.

The control therefore limits spend between restarts. It is not a reliable
durable enforcement boundary and must not be described as enforcing a true
calendar-month cap. Observed evaluation usage has been low, which limits
realized impact but does not strengthen the control. Relying on it at scale
requires a durable ledger or an explicitly documented alternative enforcement
design, under separate authorization.

**The commercial entitlement, recorded separately from that internal control.**
Halal Terminal offered AzaLens the Starter tier free for three months, providing
2,500 tokens per month during the promotional period. The offer must be redeemed
by 30 September 2026, and it continues automatically at the standard Starter
price after the free period unless cancelled or changed. Ahsan plans to redeem
it before that deadline. As of 2026-08-24 the offer is recorded as offered and
not redeemed. The reserved redemption code is deliberately not recorded in this
repository.

The application's internal safety budget stays at 30 while the commercial
entitlement is 2,500. That divergence is a known, deliberate and unchanged state
under this authorization, not an oversight. Commercial entitlement and the
application's internal cost-safety budget are separate controls, and raising one
does not raise the other. No Render value was changed by this pass.

**Finding 4 — Halal Terminal attribution and external-display rights.** Halal
Terminal stated that the attribution line it sent on 10 August 2026 must appear
wherever screening results are displayed, and described this as a condition
attached to redistribution before the workspace is opened to users.

The exact approved wording must be preserved and used verbatim rather than
paraphrased. It is deliberately not reproduced in this entry and must be
retrieved from the 10 August message before implementation.

This creates a product and UI requirement with likely visual-baseline impact,
and implementation requires separate authorization.

Whether the Starter tier itself permits external user-facing display and
redistribution with attribution is unconfirmed. Enterprise is the tier Halal
Terminal described as appropriate for custom methodology support before launch.
Starter redistribution rights, Enterprise terms and custom methodology support
are none of them approved, and none may be claimed on the strength of the
attribution statement alone.

**Finding 5 — the market-data delay disclosure rests on a source-code default.**
`MARKET_DATA_DELAY_MINUTES` was absent from the supplied inventory, and its
deprecated alias `FINNHUB_DELAY_MINUTES` was absent as well. The 15-minute delay
disclosure the product displays therefore comes from a source-code default
rather than from an explicit Render value.

Unlike the provider selectors, that variable is not protected by equivalent boot
validation. A configured zero, or another unsupported value that resolves
without rejection, could alter a user-facing market-data claim without feed
quality or real-time entitlement having been established.

This is a truthfulness and configuration-contract gap, not an observed false
statement: the 15-minute figure has not been shown to be wrong. It has equally
not been empirically or contractually verified, and no real-time market-data
entitlement is claimed. A separately authorized fix must validate the disclosure
against actual provider entitlement and feed characteristics.

*(Escalated 2026-08-24. Twelve Data has since described US-listed-share data on
the Venture tier as an aggregated composite giving an indicative real-time last
price, with no fixed delay in minutes. That says nothing about today's
Finnhub-served production quote path, where the 15-minute figure remains an
unverified source-code default and has still not been shown to be wrong. It does
mean the same figure would be wrong for a Twelve Data Venture implementation,
and that an unqualified "real-time" claim would be wrong too — so this is now a
hard prerequisite for any provider switch rather than a latent configuration
gap. See Finding TD-5.)*

**Finding 6 — Supabase configuration is validated but unused by the deployed
backend.** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`
were supplied and are boot-validated in production: shape, key-prefix and
project-reference rules all apply, and a malformed value refuses startup. The
audited backend code at `7c64801f` contains no active runtime Supabase client
consumer for them.

They are recorded as validated-but-unused backend configuration. Supabase is not
operationally used by the deployed backend. No value was read or recorded.
Removing them, or activating a consumer, each requires separate authorization
and belongs with the Bucket 3 accounts-and-database work rather than with PR B.

**Finding 7 — backup-log tooling gap (minor, separate).** The verified 24 August
backup remains valid on its own evidence: checksum verification, archive
integrity verification and reconstruction of the recorded tree. The local backup
log at `~/Library/Logs/AzaLens-backup.log` contains no entry after 12 August
2026, although later backups were created and verified.

This does not invalidate any completed backup. It means backup history has to be
reconstructed from archive filenames and checksums rather than read from one
log. The logging path or the backup script's logging behaviour requires separate
investigation. No backup tooling was modified by this pass.

**Verification-capability note (recorded 2026-08-24, separate from the audit).**
An automated integrity check of the seven retained PR A patch artifacts held on
the local Desktop returned "Operation not permitted" from macOS, although the
same listing had succeeded earlier in the same session. That is a loss of read
access. It does not prove that any artifact changed or disappeared; the
automated process could not observe them either way. Persistent loss of that
access would prevent future automated integrity checks of retained evidence held
outside the repository. No permission, filesystem or tooling change is
authorized or made by this pass.

**Attestation (2026-08-24).** Ahsan attested that the seven retained Desktop
patch artifacts remain intact; the automated process could not independently
verify them because macOS denied Desktop access. This records a direct human
observation. It is not tool-observed evidence, it does not remove the macOS
access limitation, and it does not close the verification-capability follow-up
above.

**Finding 8 — PR B decision boundary.**

- PR B is technically safe to plan.
- PR B is technically safe to implement and test locally, under separate
  authorization.
- PR B is **not** authorized for production activation.

Production activation is blocked by all of: Twelve Data endpoint and plan-access
confirmation; commercial licensing and external-display rights; evidence
supporting whatever delay or real-time disclosure would be published;
unexercised cache and provider-transition behaviour; and coordinated
profile/fundamentals capability controls, since selecting Twelve Data for either
capability without `TWELVE_DATA_PROFILE_ENABLED=true` in the same change refuses
boot by design.

Technical parity is not licensing permission. This roadmap update authorizes no
provider switch.

*(Superseded 2026-08-24 by Finding TD-13, which supplies the current PR B
boundary: planning is now authorized in principle because the commercial route
is clarified in writing; local implementation and testing still require separate
authorization; production activation remains blocked, on a longer list of
conditions than this finding recorded.)*

**What this audit does not establish:** Twelve Data endpoint-plan access,
consolidated-feed quality, Twelve Data licensing, external-display rights,
Starter redistribution permission, Enterprise approval, custom methodology
support, real-time market-data entitlement, a durable Halal Terminal monthly
cap, completion of the Halal Terminal redemption, or active Supabase runtime
usage. It covers the Render backend service only; Vercel frontend environment
configuration was not examined.

*(Still accurate as a statement of what **this audit** established. Three items
in that list — Twelve Data licensing, external-display rights and the
real-time/delay question — have since been answered in writing by the provider,
for the Venture tier only, and are recorded in the next entry. Twelve Data
endpoint-plan access and consolidated-feed quality remain unestablished by any
test AzaLens has run.)*

### Twelve Data licensing clarification — written provider response recorded 2026-08-24

**What this entry is.** Bogdan at Twelve Data answered AzaLens's fourteen
due-diligence questions in writing. This entry is a durable factual summary of
that response. The original written response is retained outside this
repository; neither the complete email nor any email header, address or
identifier is committed here, and no API key, credential, trial link or
promotional code appears in this repository.

**Provenance.** Bogdan's written Twelve Data response displayed a received
timestamp of **24 August 2026 at 2:33 PM**; **no timezone was displayed**, and
none is assigned or inferred here. Ahsan directly observed the email metadata.
The licensing findings were recorded in the roadmap on 24 August 2026. The
automated process that wrote this entry did not independently access or
authenticate the email; the fourteen answers below are **user-supplied
documentary evidence**, not tool-observed evidence.

Documents Twelve Data identified as governing:

| Subject | URL |
|---|---|
| Terms of Use | https://twelvedata.com/terms |
| Attribution guidelines | https://support.twelvedata.com/en/articles/12647398-attribution-guidelines-for-using-twelve-data |
| US-equities sourcing | https://support.twelvedata.com/en/articles/9935903-us-equities-market-data |
| Business pricing | https://twelvedata.com/pricing-business |

Those URLs are recorded as identified by the provider. This pass fetched none of
them, made no provider-backed request, activated no trial and purchased no
subscription. Provider calls: **zero**. Provider cost: **zero**.

**Finding TD-1 — the current plan and what it forbids.** AzaLens's Twelve Data
account is on the free **Basic** plan. Basic is an individual, non-commercial
testing and development tier. It cannot be used for a live commercial,
user-facing AzaLens product. No production provider activation is authorized
under Basic, and nothing in this response changes that.

**Finding TD-2 — Venture is the commercial route, and AzaLens is not on it.**
Venture is Twelve Data's entry business tier for a customer-facing product.
Bogdan quoted pricing from **$149 per month, or $1,490 per year as a one-time
annual payment**. For the AzaLens model described to him, Venture includes
external-display and derived-data rights, and **no separate commercial display
agreement is required** for that standard use: the standard Terms of Use govern,
and Twelve Data does not issue a separate order form for standard plans. Raw
market-data redistribution through an AzaLens API is **outside** that described
permission and may require a separate arrangement or Enterprise.

This establishes a **commercial path**. It does **not** mean AzaLens holds an
active Venture subscription. AzaLens is not commercially active on Twelve Data,
and production is not unblocked by this entry.

**Finding TD-3 — authenticated-user display scope under Venture.** Bogdan
confirmed display to **authenticated users** of: quotes and prices; historical
OHLCV; company profiles; symbol search results; company fundamentals; and
exchange/instrument metadata. That confirmation is scoped to authenticated
users. It must not be silently extended to unauthenticated public display, and
this entry extends it to no such surface.

**Finding TD-4 — derived analytics and AI-generated explanation.** Venture
permits derived technical analytics, risk assessments, family-level conclusions
and AI-generated explanations, provided the outputs do not allow reconstruction
of the underlying raw dataset. Twelve Data data may be used as factual input for
explanations. Training on, or redistributing, a raw market-data dataset is not
permitted by the described use.

**Finding TD-5 — US feed characteristics, and the disclosure conflict this
creates.** Bogdan described US-listed-share data on Venture as an **aggregated
composite providing an indicative real-time last price**. He stated it is **not
a delayed feed** and has **no fixed delay in minutes**. That description must
not be equated with consolidated exchange-tape (SIP) data.

This directly conflicts with AzaLens's existing 15-minute-delay wording, which
Finding 5 of the production environment audit already recorded as resting on an
unverified source-code default. For a prospective Venture implementation,
**neither "15-minute delayed" nor an unqualified "real-time market data" claim
would be acceptable**. Final user-facing wording requires a separately
authorized copy and methodology decision informed by the sourcing and
attribution guidelines above. A candidate *concept* — explicitly **not approved
copy** — is: "Indicative real-time composite pricing; not consolidated
exchange-tape data." No production wording, default or configuration value was
modified by this pass.

*(Scope corrected 2026-08-24: describing this as a copy and methodology decision
understates it. The market-state contract is currently binary and cannot
represent a composite feed at all, so the fix requires a contract change as well
as wording. See Finding P-B.)*

**Finding TD-6 — attribution is required.** Attribution to Twelve Data is
required wherever its data is displayed. The exact wording, logo and link
requirements are governed by the attribution guidelines document above; the
required wording is deliberately **not** invented or paraphrased here and must
be taken from that document. Attribution creates product and UI work with likely
visual-baseline impact, and its implementation requires separate authorization.
This is the same shape of obligation already recorded for Halal Terminal in
Finding 4 of the production environment audit.

*(Scope corrected 2026-08-24: this requirement is **not** limited to capabilities
PR B would switch. History is already served by Twelve Data in production, so the
obligation attaches to surfaces displaying Twelve Data-sourced history today. See
Finding P-A.)*

**Finding TD-7 — caching, storage and the termination lifecycle.** During an
active qualifying subscription, Twelve Data permits temporary server-side
caching; database storage of historical data; storage of profile and fundamental
data; cached reuse across authenticated users; and retention of derived results.
Twelve Data **recommends** cache-based reuse rather than duplicate per-user API
calls.

After subscription termination, **raw market data must be deleted within 30
days**; derived results may be retained. That creates a data-classification,
retention and deletion obligation: AzaLens must be able to distinguish raw
provider data from derived results before production activation. **The existing
cache is not claimed to satisfy this lifecycle obligation** — no such capability
has been designed, built or verified, and the durable-storage work remains
parked in Part 3.

**Finding TD-8 — limits and cost behaviour.** Entry Venture provides **610 API
credits per minute** and **500 WebSocket credits**, resetting each minute.
Bogdan stated there is **no daily cap**. Exceeding the per-minute limit produces
**HTTP 429**, and he stated there is **no overage charge** — requests must be
retried later. Cost exposure is therefore bounded by subscription price rather
than by per-call billing, but a production implementation still requires bounded
retries, caching and observability; none of that is verified against a live
Venture plan.

**Finding TD-9 — endpoint and plan boundaries.** Venture covers most of the
capabilities AzaLens asked about. **Enterprise** is required for analyst
estimates and analytics data, full ETF composition and holdings, and full
historical financial statements; lower tiers return **six recent
financial-statement periods**. Bogdan separately confirmed that the fundamentals
required for debt and interest-ratio work are available on Venture.

Six historical periods do **not** by themselves prove Shariah-methodology
sufficiency. Methodological sufficiency remains subject to AzaLens's own Shariah
and data-quality review, and nothing here anticipates that review's outcome.

**Finding TD-10 — IPO Calendar, and a correction.** IPO Calendar **is available
on Venture**, at a cost Bogdan stated as **40 credits per request**. The earlier
roadmap assumption of 100 credits is corrected. Availability does not require
implementation: the IPO date remains intentionally omitted unless its analytical
value justifies its cost and its data contract, and it still feeds no
calculation, verdict, indicator, risk value, guidance state, Shariah gate or
scanner decision.

**Finding TD-11 — geographic launch boundary.** Bogdan stated that **no separate
pre-launch review is required for a US-focused launch on a qualifying plan**.
Non-US exchange data displayed to paying users may require **direct exchange
licences arranged separately**. AzaLens's worldwide-listed-shares ambition
therefore **exceeds** the presently clarified US launch permission, and
worldwide commercial activation requires market-by-market licensing review. **No
global display right may be claimed.** Existing mounted landing copy describing
worldwide coverage is flagged here as a copy question for a separately
authorized decision; no wording was changed by this pass.

**Finding TD-12 — trial and startup discount (offered, not taken).** Twelve Data
offered a **12-day Unlimited trial** for validation, and a **20% startup
discount** may be available subject to eligibility. The trial should begin only
once an exact validation matrix and a runnable PR B test harness are ready, so
that its twelve days are spent on evidence rather than on setup. A trial is
**not** authorization for public commercial production. Neither the trial nor
the discount was activated, applied for or accepted in this pass.

**Finding TD-13 — PR B decision boundary, updated.** This supersedes the PR B
boundary in Finding 8 of the production environment audit.

- PR B **planning is authorized in principle**.
- PR B **local implementation and testing still require separate
  authorization**.
- The written licensing clarification **removes the uncertainty about the
  commercial route** that previously blocked planning. It removes nothing else.

PR B **production activation** remains blocked by all of: an active qualifying
business subscription; trial-based endpoint and parity validation; attribution
implementation; accurate composite-pricing disclosure; raw-versus-derived data
lifecycle controls; caching, retry and observability verification; any required
non-US exchange licensing; and exact production-switch authorization.

**No provider switch is authorized by this documentation pass.**

### Two findings surfaced by PR B planning (recorded 2026-08-24, docs-only)

Both were found while planning PR B against the code at merge
`a9f680ada19c57e4a4e2f083f1183aa7a94338f3`, by reading the code rather than by
running it. No provider call was made, and this pass changes no code, contract,
copy or baseline. The planning report itself is retained outside the repository.

**Finding P-A — the Twelve Data attribution requirement already applies today,
not only after PR B.**

Production provider ownership already assigns **history** to Twelve Data:
`DEFAULTS` in `backend/providers/marketDataProvider.js:32` sets
`history: "twelve_data"`, historical OHLCV used Twelve Data before PR A and
continues to, and the production environment audit recorded the same effective
ownership. Bogdan stated that attribution to Twelve Data is required wherever
its data is displayed (Finding TD-6).

It follows that attribution is **not** an obligation that begins when PR B
switches additional capabilities. It already attaches to every surface that
displays Twelve Data-sourced history — the price chart, the technical-evidence
surfaces derived from those bars, and the scanner and watchlist views.

The current implementation has **no Twelve Data attribution component**: no
frontend source file names Twelve Data at all, and the only provider text on the
analysis surface is the incidental `marketSource` string assembled in
`frontend/src/components/analysis/StockHeader.tsx` (around lines 122 and 208).

*(Superseded for the history chart on 2026-08-26. The paragraph above was true
when written and is kept as the finding's original statement. B7-0, B7a and B7b
have since shipped: a reviewed attribution registry exists, and StockChart
renders "Data provided by Twelve Data" whenever the history response identifies
`TwelveData`. See the B7 durable release record. The gap is closed **for the
history chart only** — the technical-evidence surfaces derived from those bars,
and the scanner and watchlist views, are **not** addressed, and derived-output
attribution remains unanswered by the provider. Nothing here is a
legal-compliance determination.)*

**Record this as a present implementation gap against the provider-stated
attribution requirement — not as a legal breach or a violation.** AzaLens has
not made that legal determination and is not in a position to. Present exposure
is limited on three independent grounds: the product is private, the protected
`/api` routes sit behind the closed-demo gate, and the Twelve Data account is on
the free, non-commercial Basic plan (Finding TD-1), which is a
testing-and-development tier rather than a live commercial deployment.

Attribution must be implemented before any of: opening the workspace to users;
activating commercial production; or describing the Twelve Data integration as
launch-ready. The exact wording, logo and link requirements must come from the
official attribution guidelines and must not be invented or paraphrased.
Implementation is separately authorized and carries visual-baseline cost. **No
UI change is made in this pass.**

**Trial-output boundary.** The attribution implementation must land **before any
Twelve Data trial output is displayed through AzaLens user-facing surfaces**. An
API-only private validation harness that does not display provider data to users
is **not, by this roadmap statement alone, classified as external display**; its
licensing treatment remains governed by Twelve Data's terms and written
guidance, not by this paragraph. Validation output stays in harness evidence
files and protected observability, never on a rendered product surface, until
attribution exists.

**Sequencing decision (recorded 2026-08-24).** Because Finding P-A establishes
that the attribution obligation attaches to surfaces already live rather than to
a future switch, the planning order changes:

- **B7 attribution planning moves ahead of B1.** It is the first slice to be
  designed, not the last.
- **This does not authorize B7 implementation.** Planning only; the wording, logo
  and link rules must still come from the official guidelines, and the UI and
  visual-baseline work needs its own authorization.
- **B1 remains separately authorized, and only after** its runtime
  call-amplification, retry and rollback boundaries have been reviewed — the
  profile path already issues three requests per miss, and no retry, backoff,
  `Retry-After` handling or circuit breaker exists today, so B1 changes live
  request behaviour and must not be waved through as a small internal slice.
- **No 12-day trial begins before the harness is ready** (Finding TD-12 and the
  trial-readiness checklist in the retained planning report).
- **No trial-derived data may be displayed through the AzaLens UI before
  attribution is implemented**, per the trial-output boundary above.

None of this authorizes B7, B1, a trial, a provider switch or any production
change.

**Finding P-B — the market-state contract cannot represent composite pricing,
so the disclosure problem is not copy-only.**

`resolveMarketState` in `backend/services/analysisTrustService.js:380` reduces
the market-data state to a binary at its final step: after the `unavailable`,
`fallback`, `stale` and `cached` branches, it returns
`delayMinutes > 0 ? "delayed" : "realtime"` (line 393), where `delayMinutes`
comes from `resolveMarketDelay()` and defaults to
`DEFAULT_MARKET_DELAY_MINUTES = 15` (line 5).

That contract **cannot express** Twelve Data's described indicative real-time
aggregated composite feed (Finding TD-5). Both available outcomes are wrong for
it:

- setting the delay to zero yields an unqualified `realtime` state, which
  exceeds the evidence and conflicts directly with TD-5;
- keeping fifteen minutes describes the prospective Venture feed as a
  fixed-delay feed, which Bogdan stated it is not.

The consequence is that replacing the 15-minute disclosure is **not a copy
change**. It requires a separately authorized change to the market-state
contract itself — a third state, or an equivalent richer representation — which
would propagate through the trust contract's `state` and `delayMinutes` fields,
the header badge in `StockHeader.tsx` (around lines 113–114) and the sourcing
sentence in `frontend/src/pages/MethodologyPage.tsx` (around line 23), and would
change visual baselines.

**No state name and no user-facing wording is approved here.** This work belongs
to the proposed disclosure PR (planning reference **B6**), which is separately
authorized, and explicitly not to the non-user-facing slices B1–B5. No
production copy, runtime contract or baseline is changed in this pass.

---

## PART 2 — FIX (correctness and truth, after Phase 0)

| # | Item | Status | Rules | Cost |
|---|---|---|---|---|
| 2.1 | **Register unregistered CI suites.** The 5 known CI-safe ones (`testComplianceGate`, `testMarketSession`, `testRvolSessionAwareness`, `testPartialIndicatorFailure`, `testAgreementTrendDegradation`) plus triage of the other 6 the audit found (`testDecisionEngine`, `testHalalterminalProvider`, `testMasterAnalysisShariah`, `testRiskPlanning`, `testScenarioPlanning`, `testShariahComplianceService`). The compliance-gate invariant currently has **no CI protection** via its focused suite | Partially Verified (audit item 12) | 8 | None |
| 2.2 | **Run the full 22-suite backend CI locally on this Mac** for `92d483c` — the recorded pass came from another environment; Rule 7 requires local confirmation | Blocked on a local run only | 7, 8 | None |
| 2.3 | **Scanner rate-limit double-count decision**: `/api/scanner` is on the strict limiter *and* counted by the global limiter (audit items 3–4). Either exempt scanner from global, or move scanner off strict. Recommendation: keep scanner on strict (it is provider-backed), add scanner paths to the global exemption list, and exclude `GET /policy` from strict | Partially Verified | 8, 17 | None |
| 2.4 | **Unmount `/api/portfolio/intelligence`** until a page uses it — it is unauthenticated, unused, and spends ~5 tokens per holding per cold call; when re-mounted, make its withheld state honest (currently degrades to "Unknown") | Live and unused (audit N2, item 11-A) | 13, 17, 23 | Saves tokens |
| 2.5 | **Minimal API access control before any public link circulates.** The unauthenticated-stranger exposure recorded as audit N1 is closed: the production closed-demo gate fronts the protected `/api` routes, and a production request without valid closed-demo access receives HTTP 401. **The cost-control weakness behind this item is not closed.** The gate is an access control, not a durable spend control. Anyone holding valid closed-demo access may initiate permitted analysis requests, and the Halal Terminal usage ledger resolves to non-durable storage on Render's ephemeral filesystem, where a deployment or restart may erase recorded usage. The application therefore does not durably enforce a calendar-month token ceiling — see Finding 3 under the production environment audit, which also records the three-month Starter promotion of 2,500 tokens per month that Halal Terminal offered and that Ahsan plans to redeem, a commercial entitlement distinct from the application's internal safety budget. Restricting access reduces exposure; it does not resolve the underlying weakness. A server-side app-token header is the cheap pre-accounts step; durable spend enforcement is a separate one | Partly closed (unauthenticated exposure closed; durable spend enforcement not built) | 17, 23 | None |
| 2.6 | **Remove obsolete `/api/explanation`.** The frontend already reads the gated explanation from `/api/analyze`; the standalone route had no consumer, duplicated the full provider pipeline, and misreported a valid Shariah-withheld outcome as HTTP 500 | Implemented locally; deployment pending | 5, 13, 17 | Saves tokens |
| 2.7 | Delete `diag/proxy-capture` (local **and** origin) after saving the three captured proxy log lines outside the repo (open item 2); prune the other stale branches and the `legacy-platform` remote | Pending | 7 | None |
| 2.8 | `trust proxy = 3` topology watch: correct today, silently wrong if Render changes its edge (open item 7). Add a startup log of the observed hop count to `/ops/metrics` for periodic eyeballing | Verified, fragile | 8 | None |
| 2.9 | Review/remove the leftover `alpha-lens-ai` Vercel project (open item 5) — harmless (doesn't own the domain) but an attack/typo-confusion surface | Unverifiable from repo | 3, 23 | None |
| 2.10 | Reconcile `design/*.ts` with `index.css` (two conflicting token sources; audit V9) — resolved by Design Phase 1 | Stale files | 7 | None |
| 2.11 | Provider-attribution licensing check (Finnhub, Twelve Data, Halal Terminal): decide hide-vs-attribute per their terms (audit N6). **Halal Terminal is decided on the attribution question:** it stated on 10 August 2026 that its attribution line must appear wherever screening results are displayed, as a condition attached to redistribution — recorded as Finding 4 under the production environment audit. Whether Starter permits that redistribution is unconfirmed. **Twelve Data is now decided on the attribution question (2026-08-24):** it stated in writing that attribution is required wherever its data is displayed, with wording, logo and link requirements governed by its attribution guidelines — recorded as Finding TD-6. The exact wording must be taken from that document, not paraphrased, and implementation requires separate authorization. **This was a present gap, not future PR B work (Finding P-A); it is now closed for the history chart (2026-08-26):** history is already Twelve Data in production, and B7-0/B7a/B7b shipped the provenance contract, the reviewed registry and the rendered chart attribution, verified at the code, CI and deployed-asset levels — see the B7 durable release record. **Still open:** derived analytics and the other Twelve Data-sourced surfaces (technical evidence, scanner, watchlist) carry no attribution; derived-output treatment is unanswered by the provider; and Halal Terminal's exact wording and external-display permission remain unresolved, so mixed-provider surfaces stay blocked. This closes an implementation gap, not a legal-compliance question. Finnhub remains undecided | Partly decided (Halal Terminal and Twelve Data stated; Finnhub undecided) | 12, 17 | None |
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
| 2.14 | **Partly resolved in PR 3 — remaining: legacy "confidence" wording elsewhere.** PR 3 removed `explanationEngine`'s independent `>= 70` re-grading: `analyzeExplanation` now takes its strength wording from the canonical `evidenceState` and quotes the agreement engine's own family summary, so two components no longer grade the same evidence by different rules. What remains is unrelated legacy "confidence" wording outside the agreement path (for example `ShariahComplianceData.summary.confidence`, which is a provider-reported field, not an AzaLens score). Re-audit before closing | Partly resolved in PR 3 | 5, 6, 7 | None |
| 2.15 | **The landing demo bypassed the canonical guidance contract.** `ComplianceDemo` rendered `VerdictCard` straight from raw `agreement.*` fields, passing `direction: "Bullish"` as the headline and the internal trend word into the slot the product uses for a horizon — so the marketing surface presented a verdict style the real product does not issue. **Resolved by a dedicated landing presentation contract (G4).** `frontend/src/data/landingDemo.ts` is no longer typed as a complete `AnalysisData` payload, which it never was; it is a narrow projection whose structural types are imported from the canonical contract or reached by indexed access into it, carrying only what mounted landing components read. The card now renders the canonical `publicLabel` as its headline and the canonical horizon label as its badge, and `frontend/src/lib/guidanceLabels.ts` is the single definition of that horizon display text, shared with `GuidanceVerdict`. The demonstration is a deliberately complete-and-fresh scenario: `frontend/src/data/landingDemo.contract.json` records the engine inputs, and `backend/tests/testLandingDemoContract.js` feeds them to the real `buildGuidanceContract` and asserts it reproduces the published label (`Constructive — Upside Evidence Established`), the horizon (`SWING_2_TO_10_SESSIONS`) and the rendered evidence exactly, with ten negative controls proving the label does not survive absent, stale, malformed or incomplete evidence metadata. **Honest limitation, recorded so no one overclaims:** the `agreement` block itself remains hand-authored, because the real agreement engine derives agreement from nine live indicator services that a static fixture cannot run. What is engine-derived is the *published verdict*, not the whole landing analysis. | Verified in PR #22 — merged at `83ff832510a9b7fda7c1de8d87cf94411a4c41b4`; exact-merge Reliability Gates run `32354974967` passed; Render and Vercel serve that exact merge; desktop production-browser verification passed; fresh mobile production-browser verification remains explicitly PARTIAL | 6, 7, 13 | None |
| 2.16 | **`landingDemo.ts` carried an invalid `riskLevel: "Medium"` — invalid latent fixture drift, not visible output.** `docs/VERDICT_CONTRACT.md` §9.1 states `MEDIUM` is not a value this system produces in either field, and `backend/tests/testGuidanceContract.js` rejects both `"Medium"` and `"MEDIUM"`. **The original premise — that the landing demo therefore *showed* a risk level the live contract refuses to publish — could not be reproduced and is corrected here.** `ComplianceDemo` was the only mounted importer and it never read `.risk`; it read `complianceGate.message`, `shariah`, `agreement.direction`, `agreement.agreementSummary`, `trend.trend` and `thesisInvalidation`. The stored value was therefore latent drift that would have become visible the moment any landing surface began rendering risk. Two shape defects travelled with it: no `riskScore` at all (so `isCoherentRiskResult` would reject the object even at the canonical level `"Moderate"`, since `classifyRiskLevel(undefined) === null`), and a withheld block using `{ success:false, riskLevel:"Unavailable" }` where the engine's real failure shape is `{ success:false, symbol, error }`. TypeScript caught none of it: `riskLevel?: string`. **Resolution: the landing-specific presentation contract removes unused risk entirely, and no risk result is fabricated.** The projection has no `risk` member — deliberately not `risk: {}`, which type-checks only because every field inside `risk` is optional and would assert an assessment that was never made. **The previously proposed `riskScore: 42` is withdrawn**: run against the real `analyzeRisk` with this fixture's exact inputs the engine returns `{ success:false, error:"A valid current market price is required." }` — there is no price and no ATR, so no risk result is derivable at all, and 42 belonged to a different fixture. `AnalysisData.risk` remains required for the real product payload and backend risk behaviour is unchanged. | Verified in PR #22 — merged at `83ff832510a9b7fda7c1de8d87cf94411a4c41b4`; exact-merge Reliability Gates run `32354974967` passed; Render and Vercel serve that exact merge; desktop production-browser verification passed; fresh mobile production-browser verification remains explicitly PARTIAL | 7 | None |
| 2.17 | **The public landing page branded deterministic computation as AI.** Mounted strings were "AI Stock Intelligence" (`Hero`, `Navbar`), "AI-powered analysis for listed stocks worldwide…" (`Hero`) and "TRANSPARENT AI ANALYSIS" (`ProductPreview`), contradicting `docs/LLM_DECISION_V1.md` §8 item 4 — a Rule 7 truthfulness defect, not a copy preference. **Replaced with the approved positioning:** navbar "Explainable Stock Analysis"; hero eyebrow "EXPLAINABLE STOCK ANALYSIS"; headline "Listed Stocks. Clearly Explained."; supporting copy "Analysis of listed-company shares worldwide, with the evidence, risk context and built-in AAOIFI-based Shariah screening shown clearly."; ProductPreview eyebrow "HOW THE VERDICT IS REACHED". Page title, description, Open Graph and manifest branding were aligned to "Explainable Stock Analysis" so no mounted metadata surface contradicts the page. **A defect no text search could see was found by viewing pixels:** `frontend/public/azalens-social-preview.png` rendered the words "AI-powered stock intelligence", and `og:image`/`twitter:image` published it on every shared link. It was regenerated at 1200×630 (the old 1640×624 would also have been cropped by social platforms), and its SHA-256 is pinned in `frontend/scripts/checkBrandAssets.mjs`. That pin proves only that the reviewed asset is the shipped asset — **it cannot read pixels and does not claim to**; reading them stays a manual review step, and OCR-in-CI was deliberately rejected because a false negative would manufacture confidence exactly where this already failed once. Also removed: dead `#features`, `#pricing` and `#about` anchors (no mounted target at any viewport; `#pricing` additionally advertised a tier that does not exist) and the `Start Free` button (no href, no handler — a focusable tab stop implying a signup the gated product does not offer). `#product` resolves and is kept. *Adjacent, still excluded:* `frontend/src/components/analysis/TradePlan.tsx` retains "AI Trade Plan" and stays out of scope — it is exported only by a barrel with zero importers, so it is unrendered dead code for the dead-barrel cleanup. Accurate historical documentation and explicit negations remain permitted, and a scope control in `checkBrandAssets.mjs` fails if the claim checks are ever widened from published output into a repo-wide source grep. **Independent full-diff review then found a gap in the guards themselves:** the standalone-token patterns (`\bAI\b`, `\bML\b`, `\bLLM\b`) were case-sensitive, so a public *lowercase* claim such as "ai analysis", "built with ml" or "powered by an llm" evaded them. The rationale recorded alongside them — that case sensitivity prevented matching the "ai" inside "Explained" — was wrong; word boundaries already do that. The patterns are now case-insensitive and owned in one place, `frontend/scripts/modelClaimPatterns.mjs`, shared by the rendered-DOM test, the published-metadata check and the visual spec's pre-shutter guard, with controls proving lowercase claims fail and words like "Explained" still pass. | Verified in PR #22 — merged at `83ff832510a9b7fda7c1de8d87cf94411a4c41b4`; exact-merge Reliability Gates run `32354974967` passed; Render and Vercel serve that exact merge; desktop production-browser verification passed; fresh mobile production-browser verification remains explicitly PARTIAL | 2, 7 | None |

| 2.18 | **`computeFrozenRiskEvidenceCompatValue` is temporary compatibility debt** (named `computeLegacyAgreementConfidenceForRisk` historically, before the Option A formalisation renamed it; that export no longer exists)**.** `backend/analysis/risk/legacyAgreementCompat.js` reproduces the pre-PR-3 agreement percentage from the nine legacy readings, consumed only by the evidence-confirmation bucket inside `analyzeRisk`. It exists **only** to preserve risk behaviour while Evidence Agreement changed from a percentage to independent family counts; without it, removing the field would have defaulted every analysis to the lowest bucket and silently moved published risk levels. It is never serialized, never rendered, never exposed in frontend types, and never described to a user as confidence. **Removal gate:** it may remain only until a dedicated risk-evidence contract is approved with documented semantics, pinned scenarios and differential analysis. That follow-up must replace the shim or explicitly authorise its continued use. **Two distinct gates, deliberately separated.** (i) The **contractual-governance gate**: no further evidence-model expansion may proceed until this compatibility behaviour is placed under an approved, documented contract. (ii) The **empirical/behavioural replacement debt**: whether the frozen formula, thresholds and penalties should be replaced at all, which no evidence in this repository can currently settle. **The PR 18a wording correction, merged in PR #18 at `9a6c99b0eca8cc4597c9d141fcb9590e3fbb58ea`, narrows the shim's reach but did NOT close this gate on its own: the shim, its inputs, its 75/60 thresholds and its 0/+5/+15 penalties are all unchanged.** **Option A approved by Ahsan on 2026-08-17** — the gate's recorded second branch, explicitly authorising continued use rather than replacing the shim. The formalising contract was **approved as Option A and merged in PR #20 at code merge SHA `96a90a947ce2e6d1683a7ed9c48e9f518a521310`** (branch `contract/formalize-risk-evidence-compat`, code commit `2bc74d5b7268aefde191365b463a4cf0f25545a5`), with **zero runtime-output change**, proven byte-identical across 2,187 pinned configurations and an exhaustive 131,072-configuration availability lattice. This item is therefore **contractually governed**; it must **not** be called empirically validated, calibrated, behaviourally replaced or accurate, and must not be recorded as simply resolved. The behaviour remains **explicitly unvalidated**: no threshold or penalty is calibrated, no representative dataset exists and no outcome ledger exists. **Empirical replacement remains open** (item 2.23). **Mandatory review at the earliest of:** an outcome ledger reaching an Ahsan-approved usable sample; the Evidence Agreement model changing; any change to consumer, formula, threshold, penalty, serialization, public exposure or frontend use; or **2027-02-17**. Recorded machine-readably in `FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT` and asserted by `backend/tests/testRiskEvidenceCompatContract.js`. **Gate (i) is SATISFIED by code merge SHA `96a90a947ce2e6d1683a7ed9c48e9f518a521310` — approval and branch work alone would not have lifted the freeze — so further evidence-model expansion may now resume. Gate (ii) is NOT satisfied by that merge: the frozen behaviour remains explicitly unvalidated and empirically open. Expansion may resume because the governance contract merged, not because the frozen numbers were shown to be accurate. The debt is contractually governed — not empirically validated, not calibrated, not behaviourally replaced, not accurate and not simply resolved. Thresholds 75/60 and penalties 0/+5/+15 remain frozen compatibility behaviour, not validated measurements: no representative calibration dataset exists and no outcome ledger exists.** See items 2.22 and 2.23 | Option A approved 2026-08-17 and merged in PR #20 at code merge SHA `96a90a947ce2e6d1683a7ed9c48e9f518a521310`; gate (i) contractual governance SATISFIED; gate (ii) empirical/behavioural replacement OPEN; behaviour unchanged and explicitly unvalidated; mandatory review by 2027-02-17 | 7, 8 | None |
| 2.19 | **`portfolioIntelligenceService.js` reads a field that no longer exists.** It reads `analysis?.agreement?.confidence ?? null` (observed near line 82), which PR 3 removed, so it now always yields `null`. The endpoint is unmounted in spirit and called by no page (see item 2.4), so nothing user-facing degrades. Left untouched by PR 3 by explicit instruction. Fix it when 2.4 is actioned — either unmount the service or migrate it to the family-count contract | Deferred unmounted dead-code debt | 7, 13 | None |
| 2.20 | **RESOLVED in PR 3 — `explanationEngine` percentage wording.** Historical note: removing the agreement percentage would have left `analyzeExplanation` interpolating a missing value into `data.explanation.narrative` as `undefined% confidence` (serialized, rendered nowhere). PR 3 corrected `backend/analysis/explanation/explanationEngine.js` to consume the canonical Evidence Agreement contract instead: it quotes the engine's own family summary, publishes counts rather than a percentage, carries no "confidence" wording, and takes its strength wording from the canonical `evidenceState` rather than the separate `>= 70` threshold it used to apply. That also closes the duplicate-grading half of item 2.14. Guarded by `backend/tests/testExplanationContract.js` | **Resolved in PR 3** | 7 | None |
| 2.21 | **Fixture-contract governance and deterministic analysis-fixture validation — VERIFIED in PR #24.** The original defect class was real: hand-authored deterministic fixtures could contradict their own public evidence while still rendering cleanly and becoming permanent visual baselines. PR #17 corrected the visible Momentum/family-count contradictions and added focused member-derived assertions. PR #24 completed the remaining accepted analysis-fixture debt at merge SHA `bed7ab7a2b27fba1aae7df4a27c0d4ce10ee42d2` (tree `1329222989c5fda303ca56d6db2d6c5e8a33f4e6`): `analysisData` is now compile-time bound to `AnalysisData`; the RSI reading uses the mounted public `rsi` field; all eleven indicator keys returned by production are present; analysis and guidance reuse one canonical four-family definition; `agreement.coverage.families` agrees with its declared usable-family count; the malformed dead top-level invalidation was removed and the mounted guidance invalidation conforms to `ThesisInvalidation`; and the history mock now publishes typed `symbol`, `interval` and bars through `HistoryResponse`. Tests assert source-reading votes against every Evidence Agreement member, coverage identity, invalidation structure and history identity. Temporary local negative controls proved the focused suite fails when RSI/member agreement, family coverage, invalidation shape or history interval regresses; those mutations were restored and are verification evidence, not four additional committed CI tests. Mounted Technical readings are asserted in Playwright and protected by four reviewed Linux baselines (day/night × desktop/mobile), bringing the committed suite to eighteen Linux comparisons with no Darwin baseline. Exact-merge Reliability Gates run `32413026221` (event `push`, branch `main`, head SHA exactly `bed7ab7a2b27fba1aae7df4a27c0d4ce10ee42d2`) passed all five jobs: backend **41/41**; frontend **167/167 across 17 files**; browser **15 passed with one documented skip**; visual **8 tests exercising 18/18 comparisons**, with zero missing/mismatched snapshots, all five silent-write markers absent, the no-baseline-written proof passing and failure-evidence upload skipped. Release scope reported `{"backendChanged":false,"expectedCommit":"","deploymentAttempts":1}`; no Render deployment was required. Vercel reported success for the exact merge commit and `www.azalens.com` returned HTTP 200, but the production frontend build is byte-identical to the first parent, so served runtime bytes cannot independently discriminate this fixture/test-only release. This verifies the deterministic analysis fixture and the specific historical drift classes above; it is not a claim that future fixtures cannot drift. It changes no product algorithm or runtime output and does not empirically validate indicator logic, Agreement logic, risk thresholds, penalties, market frequency or outcomes. Provider-backed calls and provider cost: **zero**. Landing fixture governance is recorded separately under items 1.11 and 2.15–2.17. | **Verified — PR #24 merged at `bed7ab7a2b27fba1aae7df4a27c0d4ce10ee42d2`; exact-merge CI green; deterministic analysis fixture governed; runtime output unchanged** | 7, 8 | None |
| 2.22 | **The evidence note contradicted the Evidence Agreement panel. Corrected and merged in PR #18; production rendering of the corrected note is still unobserved.** Verified production defect, reproduced against merge SHA `01a4cc1`: `analyzeRisk` graded its evidence sentence from the private legacy scalar and then appended the canonical family summary to it, so one sentence could read **`Directional confirmation is limited. 4 of 4 evidence families support a bullish lean.`** while the Evidence Agreement panel simultaneously showed *High agreement, 4 of 4*. The legacy scalar ignores OBV entirely, credits neutral readings at 0.35 each and multiplies in a coverage ratio, so it cannot agree with the four-family contract by construction. Rendered in both consumers: `data.risk.riskNotes` → `RiskAssessment.tsx` (under the red "Risk notes" heading) and `guidance.risk.notes` → `GuidanceVerdict.tsx`. Not a PR #17 regression — PR #17 achieved its stated numeric invariance; it made an inherited incoherence visible by appending the canonical summary. **PR 18a correction, merged in PR #18 at code merge SHA `9a6c99b0eca8cc4597c9d141fcb9590e3fbb58ea`:** the legacy scalar selects the score bucket and nothing else; the user-visible note takes both its text and its list placement from the canonical contract — text is the agreement engine's own `summary` published verbatim behind the neutral label `Evidence context:`, and placement is the agreement engine's own `agreement === "aligned"` predicate (already consumed by `guidanceContractService.js`), so no second evidence model and no new threshold were introduced. Malformed or absent agreement input fails safe to a single honest note. **Zero numeric change:** shim output, penalty, `riskScore`, `riskLevel`, `volatility`, `atrPercent` and the public/guidance Evidence Agreement objects are all identical, proven across 2,187 pinned configurations in `backend/tests/testRiskInvariance.js` (penalty distribution still `+0` 6, `+5` 342, `+15` 1,839) and across an exhaustive 131,072-configuration availability lattice in a scratchpad-only differential (0 changes on every numeric field). 314 of 2,187 configurations previously emitted the contradictory pairing; all now satisfy the coherence rule, pinned by count in the committed suite. Five mutation-based negative controls were additionally run to prove the suite fails when the defect is reintroduced; those were **temporary implementation-verification procedures executed outside the repository and are not committed tests and not part of CI** - only the assertions they validated are committed. **`Configuration-space shares are not observed market frequencies and do not estimate how often a condition occurs in production.`** The 314-of-2,187 and 131,072-case figures are counts over exhaustively enumerated hand-authored indicator configurations; they are not user or market prevalence, do not estimate production incidence, and nothing here is empirically validated. **No calibration data exists** — this repository contains no representative historical OHLCV dataset, so no threshold in the risk or evidence path is calibrated against outcomes, and no outcome ledger exists against which to evaluate one. **Found during implementation review and settled before merge:** the correction initially left `guidance.risk.notes` without an evidence entry for aligned (High/Moderate) evidence. End-to-end inspection established that the Guidance panel nonetheless renders the canonical sentence twice already — as `guidance.currentSituation` and as `guidance.evidenceAgreement.summary`, both via `VerdictCard` — for all eight evidence states, so no sentence is absent from the Guidance surface and adding a third occurrence in the risk-note list was deliberately **not** done. That judgement was independently reviewed and approved before merge. **Release verification completed for the code merge.** Exact-merge-SHA Reliability Gates passed on `9a6c99b0eca8cc4597c9d141fcb9590e3fbb58ea`: backend **39/39**; frontend **120/120 across 16 files**; browser journeys **13 passed with one documented pre-existing skip**; accessibility passed; visual regression **4/4 with zero mismatches**; all five silent-write markers (`writing actual`, `doesn't exist`, `did not match`, `--update-snapshots`, `Writing missing snapshot`) absent; the failure-evidence upload step skipped; and all eight committed Linux baselines byte-identical. Render served the exact PR #18 code merge SHA (`/health/live` HTTP 200, `deployment.commit` matching across repeated samples). Vercel production passed the §10.3 six-condition check. Desktop and mobile general production-browser verification passed with zero console errors, page errors, failed requests or responses at or above 400, and no horizontal overflow. **Provider calls: zero.** **The specific user-visible evidence-note path remains PARTIAL, not PASS.** The closed-demo gate prevented a real High or Moderate agreement analysis surface from rendering: `/auth/demo/status` reported `enabled: true, authorized: false`, and `/api/analyze/AAPL` returned **401 before any provider was reached**, so `/analysis/AAPL` rendered the closed-demonstration page instead of an analysis. The absence of the contradictory wording on that locked page is **not** proof that the wording was removed, and the landing-page `ComplianceDemo` is a marketing fixture, not a real analysis surface. The corrected sentence has **not** been visually observed in production. **Verified visual-coverage limitation — the present visual suite cannot observe this wording at all.** The eight committed baselines are `analysis-overview-{day,night}-{desktop,mobile}` and `analysis-guidance-{day,night}-{desktop,mobile}` (`frontend/e2e/visual.spec.ts-snapshots/`). `RiskAssessment` — the only surface that renders `supportiveFactors`, and the one carrying the corrected note under "Risk notes"/"Supportive factors" — sits on the Risk tab and is captured by none of them; the overview capture is the Overview tab and the guidance capture is scoped to the `guidance-verdict` element. The guidance baseline likewise shows no evidence note, though **not** because its fixture is non-directional: `frontend/e2e/fixtures/analysis.ts` declares `guidance.verdict.state: "FAVORED"` with `direction: "BULLISH"`, `publicLabel: "Constructive — Upside Evidence Established"` and `evidenceAgreement.state: "Moderate agreement"` — an *aligned* state. The note is absent because the fixture's `guidance.risk.notes` is hand-authored and contains one unrelated trend-strength sentence, and its `data.risk` declares no `riskNotes` or `supportiveFactors` at all. (An earlier description of this gap attributed it to a `LIMITED_EVIDENCE` fixture; that is incorrect and must not be restated — recording a wrong reason is precisely the fixture-drift class item 2.21 exists to prevent.) Closing this gap needs a fixture that exercises the evidence note on a captured surface, plus Linux baselines reviewed in CI (item 1.11 — a macOS capture cannot satisfy Linux CI). That belongs with the follow-up evidence-contract work in item 2.23; **no such PR is authorized, scheduled or scoped by this note** | **Partially Verified — merged and deployed in PR #18; exact-SHA CI and infrastructure verification passed; real production evidence-note rendering remains unobserved because the closed-demo gate blocked the analysis surface** | 6, 7 | None |
| 2.23 | **PR 18b — the risk-evidence contract decision. Option A selected and approved by Ahsan on 2026-08-17 and merged in PR #20 at code merge SHA `96a90a947ce2e6d1683a7ed9c48e9f518a521310` (code commit `2bc74d5b7268aefde191365b463a4cf0f25545a5`).** PR 18a fixed the wording contradiction only; the shim still drives the numeric penalty, so item 2.18's removal gate is still open. Closing the contractual-governance gate requires a separately reviewed contract PR and Ahsan's explicit decision. Option A supplies that contract with zero runtime-output change; behavioural replacement remains a separate, empirically open question. **Option A — formalize the existing private compatibility behaviour with zero runtime-output change — is the approved decision. Behavioural Options B1, B2, B3, C and D are deferred pending outcome evidence and remain unapproved.** Approved restrictions: the scalar formula, the 75 and 60 thresholds, the 0/+5/+15 penalties, the missingness behaviour, the `riskScore`/`riskLevel` behaviour and the sole internal risk-bucket consumer are all retained exactly; the behaviour may be described only as frozen compatibility behaviour — private, temporary, explicitly unvalidated, not a confidence measure, not Evidence Agreement, not an accuracy measure and not an empirically validated risk measurement. Mandatory review date **2027-02-17**, with **ten distinct machine-readable triggers** representing the approved review conditions in `FROZEN_RISK_EVIDENCE_COMPAT_CONTRACT` (serialization, public-API exposure and frontend use are recorded separately, never combined). **No empirical accuracy claim is made or implied. No public API, frontend, guidance or snapshot impact. No provider cost.** The planning investigation (preserved at `Azalens Backups/Plans/ITEM_2_18_INVESTIGATION-PLANNING-ONLY-2026-08-16-01a4cc1.md`, SHA-256 `dec7614ca208b77902e9e963f9865cab95d8c08204d7d9741d054ff0c8e4d26c`) analysed retaining the shim under a formal private contract, replacing it with a family-based internal risk-evidence contract, removing evidence agreement from numeric scoring, and publishing a separate non-numeric qualifier. **Requirements for a FUTURE behavioural replacement only (B1/B2/B3/C/D) — none of these is outstanding for Option A, which is selected, approved and merged:** (a) which behavioural option; (b) acceptance that a family-based replacement changes roughly a fifth of pinned configurations' published risk **level** — a configuration-space share, not a predicted production frequency; (c) whether incomplete coverage is as risky as conflict or warrants a middle band, a distinction invisible in the 2,187 sweep and affecting about 29% of the full lattice; (d) whether any replacement penalty schedule is acceptable as **provisional and explicitly unvalidated**. Option A's own penalties were approved solely as frozen, explicitly unvalidated compatibility behaviour, not as a validated schedule. **Empirical limitations:** no representative historical OHLCV dataset exists in this repository, so no threshold in any option can be calibrated, no option's penalties are validated, the four-family grouping remains structural and provisional rather than empirically measured, and structural coherence must not be described as accuracy. No outcome ledger exists to evaluate any of this against. Option A's differential is **complete**: it proves zero runtime-output change, byte-identical across 2,187 pinned configurations and the exhaustive 131,072-configuration availability lattice, so no further risk-level differential is outstanding for it. **Any future behavioural replacement requires a new risk-score and risk-level differential review before merge.** **Release verification completed for the code merge.** Exact-code-merge Reliability Gates run **32061378625** (event `push`, branch `main`, headSha exactly `96a90a947ce2e6d1683a7ed9c48e9f518a521310`) passed with all five required jobs green: backend **40/40**; frontend **120/120 across 16 files**; browser journeys **13 passed with one documented skip**; visual regression **4/4 with zero mismatches**; all five silent-write markers (`writing actual`, `doesn't exist`, `did not match`, `--update-snapshots`, `Writing missing snapshot`) absent; the failure-evidence upload step skipped; and all eight committed Linux baseline blobs byte-identical. Release scope reported `backendChanged: true` with `expectedCommit` equal to that SHA. Render served the exact code merge SHA in production (`/health/live` HTTP 200, `deployment.commit` identical across three samples). Vercel production deployment record **5950005690** (`Production – azalens`, state `success`) referenced the exact code merge SHA, and the production domain returned HTTP 200. Desktop (1440×1000) and mobile (iPhone 13, 390×664, DPR 3) production clean-load verification passed with zero console errors, zero page errors, zero failed requests, zero responses at or above 400, zero horizontal overflow, zero `/api/` requests and zero provider-backed calls; the served CSP and inline-script hash matched the accepted merge tree, and all content-hashed assets returned HTTP 200. **§10.3 V5 remains QUALIFIED, not an unconditional PASS:** its clean-load component passed, but `frontend/` is byte-identical to the merge's first parent, so unchanged frontend assets cannot independently distinguish this backend-only release — exact Vercel deployment identity therefore rests on the production deployment record's merge-SHA ref, not on browser asset discrimination. **The PR 18a evidence-note production path remains PARTIAL, not PASS** (item 2.22): the closed-demo gate still blocks a real analysis surface, so the corrected note has not been observed in production. **`Configuration-space shares are not observed market frequencies and do not estimate how often a condition occurs in production.`** **Provider calls and provider cost: zero.** Legal or Shariah review is **not** established as a blocker for this item and must not be claimed as one without separate proof | Option A approved 2026-08-17 and merged in PR #20 at code merge SHA `96a90a947ce2e6d1683a7ed9c48e9f518a521310`; exact-code-merge CI run 32061378625 green; contractual governance satisfied; behaviour explicitly unvalidated; behavioural replacement (B1/B2/B3/C/D) deferred pending outcome evidence | 7, 8 | None |

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
