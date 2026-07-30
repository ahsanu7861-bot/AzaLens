# AzaLens — Constitution Compliance Audit (26 Rules)

**Date:** 2026-07-30 · **Commit:** `92d483c` · Statuses: **Verified / Partially Verified / Violated / Not Yet Applicable**
Evidence citations refer to the code at this commit. Where a rule is not fully met, the concrete work required is stated. Cross-references: `docs/AUDIT_2026-07-30.md` (findings V1–V12, N1–N7).

---

### Rule 1 — Stocks only · **Verified**
`/api/search` filters to listed equity types only (`finnhubProvider.js:184–197`: common/ordinary/preferred shares); scanner universe is watchlist-only; landing page explicitly lists exclusions ("No CFDs, No crypto, No forex, No gold or silver, No options, No leverage or margin", `MarketSnapshot.tsx:30–37`). No forex/crypto/derivative path exists.

### Rule 2 — Identity "AzaLens" · **Partially Verified**
Product copy consistently says AzaLens. Deviations: browser title is "**AzaLens AI** — Explainable Stock Intelligence" (`index.html:31`); a legacy "AlphaLens" string survives in `StockChart.tsx`; the Render host is `alphalensai.onrender.com` (external config, historical). **Work:** retitle to "AzaLens — …", purge the AlphaLens string; the Render service name can wait (the public name is `api.azalens.com`).

### Rule 3 — Brand domain · **Partially Verified**
`azalens.com`/`www.azalens.com` are the CORS production origins (`server.js:86–90`) and the deployed domains. The Facebook rebrand cannot be verified from the repository — it remains **pending until completed and verified**, exactly as the rule requires. **Work:** complete and evidence the rebrand, then record it.

### Rule 4 — Shariah stays free · **Verified**
No paywall exists anywhere; screening, status, reasoning, ratios, freshness and limitations are all in the free response. The Pro dialog itself states "Shariah screening and all core baseline analysis remain 100% free" (`ProFeatureWrapper.tsx:114–116`). (The Pro dialog's *other* problem belongs to Rules 7/21.)

### Rule 5 — Depth for everyone · **Partially Verified**
Six workspaces give layered depth (`workspaces.ts`, `AnalysisPage.tsx`); scanner reports plain-language observations. Not yet demonstrated: that every retained indicator "materially aids understanding" — 11 indicators ship with no articulated inclusion rationale. **Work:** one paragraph per indicator justifying its presence (feeds the methodology page), remove any that can't be justified.

### Rule 6 — Mentor, not signal · **Violated (landing page); Verified (product)**
The live product never issues BUY/SELL: verdicts are direction + evidence + invalidation, and the gate withholds them entirely when compliance is unconfirmed. **But the landing page renders a mockup with "Verdict: BUY" and "AI confidence 92%"** (`PreviewHeader.tsx:29–37`) plus a target-bearing trade plan (`PreviewTradePlan.tsx`) — a blind-command image, unlabelled, as the product's first impression. Dead code also contains a hardcoded `verdict="BUY"` (`App.tsx:178`). **Work:** rebuild the landing preview around the real (withheld/reasoned) verdict; delete `App.tsx`.

### Rule 7 — Verified truth only · **Violated**
Twelve documented mismatches between claims and code, in both directions — stale docs denying built features (gate, INTACT/VIOLATED, rate limiting, CI) and UI claiming unbuilt ones (AzaLens Pro). Full table: audit Part 1 item 14 (V1–V12). Also: the 22-suite CI pass for `92d483c` has not been reproduced on the local machine, so "tests pass" is itself only Partially Verified until run locally. **Work:** replace `WHAT_TO_DO_NEXT.md` (done in this session), refresh `PRODUCT_BUILD_STATUS.md`, remove the Pro claim, run CI locally.

### Rule 8 — Definition of done · **Partially Verified**
Blocking CI exists (`.github/workflows/reliability-gates.yml`: backend suites, migrations check, frontend lint/tests/contrast/build). Gaps: 11 backend test files unregistered in CI (audit item 12); visual snapshots cover only 4 analysis-overview shots; local-environment confirmation missing for HEAD. **Work:** register the CI-safe suites; extend snapshot coverage when the design stabilises.

### Rule 9 — Evidence before conclusions · **Verified**
The trust contract carries evidence completeness, per-source states, freshness, provider errors and known limitations (`analysisTrustService.js:235–338`); insufficient evidence produces `unknown`/REVIEW rather than a conclusion (`buildThesisInvalidation`); UI renders honest unavailability (e.g. `IslamicCompliance.tsx`, "Freshness unavailable" in the header).

### Rule 10 — Risk before opportunity · **Partially Verified (Violated on landing)**
Risk workspace, invalidation boundaries, and the compliance gate all precede opportunity language in the product; no outcome promises found in app copy. The landing "AI confidence 92%" is fake precision on a fabricated example. **Work:** same landing rebuild as Rule 6.

### Rule 11 — Strict Shariah truth · **Verified (code); Partially Verified (documentation)**
Four honest states flow end to end (COMPLIANT / NON_COMPLIANT / UNKNOWN→"Review required" / stale→withheld); only confirmed, fresh compliance unlocks the verdict, enforced server-side (`complianceGateService.js`); stale evidence withholds even a COMPLIANT status (`:65–67`); "not a fatwa" disclaimers present. **Gap:** methodology, AAOIFI version, date semantics and limitations are documented nowhere a user or scholar can read (audit A6). **Work:** the Methodology & Limitations page — required before scholarly review (Rule 25).

### Rule 12 — Provider confidentiality with legal compliance · **Partially Verified**
Keys are server-side only; quotas/priorities hidden; `/ops/metrics` is token-protected. But provider names (Finnhub, Halal Terminal) appear in API responses and provenance fields (audit N6). Whether that is a violation depends on each provider's attribution terms, which have not been reviewed. **Work:** read the three providers' attribution/licensing terms; then either hide names or keep them as required attribution — as a documented decision.

### Rule 13 — One stock, one truth · **Verified**
The master analysis is the single verdict owner; dashboard and watchlist link into it without duplicating logic; scanner explicitly disclaims verdicts; legacy duplicate routes removed. Residual risk: `portfolioIntelligenceService.js` re-summarises trend/risk per holding — currently unused by any page. **Work:** unmount or align it before any page consumes it.

### Rule 14 — Progressive disclosure · **Verified**
Overview → workspace tabs → full evidence and limitations; withheld state explains itself and links to the Shariah workspace (`VerdictWithheld.tsx`).

### Rule 15 — Swing identity first · **Partially Verified**
Daily timeframe is explicit (`analysisTimeframe: "1day"`); delay labelling exists (`delayMinutes`, `analysisTrustService.js:116–133`); market-session logic exists (`analysis/marketSession.js`) with tests — but `testMarketSession.js` and `testRvolSessionAwareness.js` are not in CI, and the horizon/sessions/delays definition is not stated to users anywhere. **Work:** register those suites; add horizon/session/delay wording to the methodology page.

### Rule 16 — Momentum Room stays separate and later · **Not Yet Applicable — compliant**
Nothing resembling it has been built. Correct.

### Rule 17 — Cost-first without compromising truth · **Verified, with one exposure**
The cost architecture is real: offline-by-default Shariah runtime, explicit live opt-in, dev guard, monthly token ledger with locking, scanner designed around call counts, caches with honest staleness labels. The exposure: the unauthenticated public API lets strangers spend the budget (audit N1/N2) — a cost-control gap, though never a truth compromise. **Work:** minimal API access control before any public link circulates; unmount `/api/portfolio/intelligence`.

### Rule 18 — Reasoning is the moat · **Partially Verified**
Normalized evidence, cross-module reasoning (agreement/confluence), risk/Shariah safeguards and trustworthy failures exist. Missing: historical evaluation of verdicts (no track record storage) and the exceptional-UX bar (design currently 6.4/10 — see `docs/DESIGN_SYSTEM.md`). **Work:** long-term; roadmap Parts 3–4.

### Rule 19 — No blind competitor copying · **Verified (nothing to the contrary found)**
No copied wording, branding or design detected; the withheld-verdict pattern is original.

### Rule 20 — Controlled beta first · **Not Yet Applicable (pre-beta), Partially prepared**
No external launch has happened. Of the listed prerequisites: CI ✓ (blocking), security partial (no auth), graceful failures ✓ mostly, Shariah invariants tested ✓ (but key suites out of CI), legal/data-rights review ✗, policies/disclosures ✗ (no Terms/Privacy), monitoring partial, incident ownership undefined. **Work:** the beta-gate checklist in the roadmap; nothing external until it passes.

### Rule 21 — Monetization follows retention · **Violated**
"Available on AzaLens Pro. **Upgrade to unlock**…" (`ProFeatureWrapper.tsx:17`) advertises a paid tier that does not exist, before retention, before entitlements, before the regulatory memo. It monetises nothing today (no payment flow), but it *claims* to. **Work:** remove the upsell or relabel honestly ("Planned — not yet available"); build tier flags only as flags (Rule 26 note in roadmap).

### Rule 22 — Measure trust and understanding · **Not Built**
No product analytics of any kind: no tracking of useful analyses, comprehension, retention, Shariah-uncertainty encounters, or complaints. `/ops/metrics` is operational only. **Work:** post-Phase-0; needs a privacy-respecting design consistent with Rule 23 before any tool is added.

### Rule 23 — Privacy and security by design · **Partially Verified**
Server-side enforcement exists where features exist (helmet, CORS allowlist, layered rate limits, server-side gate and caps). Structural gaps by design stage: no accounts, so watchlist/portfolio are one shared, unauthenticated, world-writable store (`backend/storage/*.json`); no entitlements exist to enforce. Acceptable strictly while single-user; incompatible with any second user. **Work:** the accounts+DB+tiers single project (roadmap Part 3).

### Rule 24 — UAE jurisdiction · **Not Yet Applicable in code; open as a track**
No US-specific claims, wording, or payment rails exist (nothing to un-build — good). No UAE entity, banking, or legal wording exists either. **Work:** non-code track — runs through Tahir Khan sahib's review (roadmap Track B).

### Rule 25 — Scholarly validation · **Verified (no premature implication); action pending**
No endorsement is implied anywhere; disclaimers explicitly deny fatwa status. The planned review by Mufti Ejaz Ahmed Samadani sahib is correctly framed as review, not endorsement. **Work:** the methodology page (Rule 11) is the prerequisite artifact for that conversation.

### Rule 26 — Regulatory memo before beta/payment · **Not Yet Applicable — but at risk from Rule 21's violation**
No beta, no payments — compliant today. The Pro upsell is the one thing that edges toward implying a payment offering before the memo. **Work:** remove it (same fix as Rule 21); obtain the written UAE regulatory-perimeter memo before any external beta or payment goes live; the roadmap gates those items on the memo explicitly.

---

## Summary of violations requiring action

| Rule | Violation | Fix size |
|---|---|---|
| 6, 10 | Landing "BUY / 92%" fabricated mockup | Small (Phase 0) |
| 7 | Stale docs both directions (V1–V6, V9, V10); unverified local CI | Small (docs) + one local run |
| 21 (→26 risk) | "AzaLens Pro — Upgrade to unlock" for a non-existent tier | Trivial |
| 2 | "AzaLens AI" title, AlphaLens remnant | Trivial |
| 11 (partial) | No user-readable methodology/AAOIFI/limitations documentation | Writing work (Phase 0) |

Everything else is either Verified, tracked as Partially Verified work in `WHAT_TO_DO_NEXT.md`, or genuinely Not Yet Applicable.
