# AzaLens — LLM Decision for v1

**Status:** Approved — 2026-08-11, commit `7a9c4c6`.
**Baseline inspected:** `d6458d97579d3a2d187db7b9ab3f5ac15bcff18b` (main, clean worktree).

---

## 1. Decision

**AzaLens v1 does not use an LLM. Not required, not optional, not behind a flag.**

All verdict meaning and Rule 6 guidance are produced deterministically; the frontend
also supplies fixed interface labels and presentation copy. A future paraphrasing layer
stays possible, but it is **out of scope for v1** and is pre-constrained by §5–§7.

---

## 2. Current-state evidence

**No LLM exists anywhere in this repository.** This is a starting position, not a
removal.

| Question | Finding |
|---|---|
| LLM called in production? | **No.** No provider SDK in `backend/package.json` (`axios, cors, dotenv, express, express-rate-limit, helmet, morgan, technicalindicators, yahoo-finance2`) or `frontend/package.json`. No `openai` / `anthropic` / `gemini` / `gpt-*` reference in any tracked source. |
| Model keys configured? | **No.** `.env.example` holds market-data, observability, Shariah-mode, feature-flag and Supabase keys only. |
| Does a model influence verdict fields? | **N/A** — none exists. All verdict fields come from `backend/services/guidanceContractService.js`. |
| Does a model receive Shariah or user data? | **No data is sent to an LLM;** the inspected production path contains no model integration. |
| Failure behaviour of "AI" paths? | **N/A.** `backend/analysis/explanation/explanationEngine.js` is 468 lines of deterministic string templates with **no model or network call** (no `require`, `import`, `axios` or `fetch`). |
| UI labelled "AI" but deterministic? | **Yes — naming debt only.** See below. |
| Can the deterministic system already deliver complete Rule 6 guidance? | **Yes.** `docs/VERDICT_CONTRACT.md` specifies six live public outcomes, backend-owned `publicLabel`, meaning, next observation, confirmation condition, invalidation, allowed next step, risk and limitations — all deterministic and fail-closed. |
| Would dropping the model break capability? | **Nothing to drop.** There is no capability to lose. |

**"AI" naming that remains, all rendering deterministic output:**

- `frontend/src/pages/AnalysisPage.tsx:47` and `frontend/src/pages/SettingsPage.tsx:46` — user-visible tab label `"AI thesis"`.
- Filenames/symbols: `AIVerdictCard.tsx`, `AIVerdict.tsx` (a re-export shim), `AIExplanation.tsx`, `AIReasoning.tsx`.
- `frontend/src/components/analysis/index.ts:2,7` — exports `AIVerdict` and `AIReasoning`; `AIReasoning` has **no consumer** (dead code).

**Already correct in the live verdict surface** (so PR 1B is smaller than assumed):
`AIVerdictCard.tsx:155` renders **"AzaLens Verdict"**; `:178` renders **"Evidence
Agreement"**; `AIExplanation.tsx:55` likewise. The landing-page `"AI confidence 92%"`
mockup (audit finding V8) is **gone**.

---

## 3. Options compared

| Criterion | A. No LLM | B. Optional LLM | C. Required LLM |
|---|---|---|---|
| Rule 6 clarity | Already met | Marginal polish | Marginal polish |
| Determinism | Total | Canonical text stays deterministic | **Lost** |
| Hallucination / coercion risk | None | Contained by validator | **Unbounded** |
| Shariah boundary | Untouchable | Untouchable if never sent | **Unacceptable** |
| Legal exposure (Rule 12, pending counsel) | None | Deferred, not resolved | **Blocking** |
| Provider-data exposure | None | None if enforced | **Likely** |
| Privacy | No third party | New processor | New processor |
| Cost / analysis | No model cost | Per-call | Per-call, unavoidable |
| Latency | None added | Added when enabled | Added always |
| Availability | No new dependency | Degrades to deterministic | **New hard dependency** |
| Testing | Snapshot-stable | Two paths to test | **Non-deterministic snapshots** |
| Vendor lock-in | None | Low | High |
| Auditability | Full — every sentence traceable to code | Good | Poor |
| Beginner usefulness | Good — templates already read plainly | Slightly better | Slightly better |
| PR 1B impact | None | None | None |
| PR 2 impact | None | Reserve an optional slot | Contract must carry model output |

**C is rejected.** No repository evidence shows it is necessary, and it would put a
third party inside a Shariah-adjacent verdict path — contrary to Rules 6, 7, 9 and 12.

**A is chosen over B** because B's only benefit is phrasing polish the deterministic
templates already deliver, while its costs are real and immediate: a second rendering
path, a validator, a new processor agreement, per-analysis spend, and
non-deterministic output in a suite whose visual gates have already cost two
stabilisation cycles. B is not wrong — it is simply not yet worth its price.

---

## 4. Chosen architecture

```
Deterministic Evidence Engine
  → Deterministic Scenario Engine
    → Fixed backend-owned verdict contract   ← the only source of user-facing meaning
      → Deterministic template rendering     ← v1 ends here
        → (post-v1, optional) paraphrasing layer
```

---

## 5. Allowed model role (post-v1 only; not authorised now)

If ever enabled, a model may **only** paraphrase an already-complete, already-validated
contract.

- **Permitted input:** the finished public contract fields only — `publicLabel`,
  `meaning`, `nextObservation`, `confirmations`, `allowedNextStep`, `limitations`,
  `horizon`, and pre-formatted evidence/risk strings.
- **Forbidden input:** raw or provider-derived Shariah/Halal Terminal content, provider
  payloads, user identity, account data, portfolio holdings, API keys.
- **Permitted output:** prose paraphrase only.
- **Forbidden output:** any number, label, direction, status, recommendation, or claim
  not already present in the input.

### Forbidden responsibilities (immutable fields)

A model may never determine, alter, infer, override or repair: Shariah status;
business-activity screening; financial-ratio screening; trading-method permissibility;
directional lean; evidence agreement/confidence; confirmation condition; invalidation
condition; time horizon; risk classification; risk boundaries; scenario selection; any
numeric value; any eligibility or compliance gate.

### Validator must reject

Output that introduces or changes a number; introduces a verdict label or direction;
mentions Shariah status or screening; issues a recommendation or transaction verb;
contradicts any contract field; exceeds a fixed length; or is empty/malformed.
Rejection is silent to the user — the deterministic text is shown.

---

## 6. Failure and fallback

**In v1 there is nothing to fail.** The deterministic text *is* the product.

Post-v1, if a model is unavailable, times out, returns malformed output, contradicts
the contract, or fails the validator, the system renders the deterministic text and
records the rejection. The deterministic text is always generated first and is always
canonical — the model never sits on the critical path.

---

## 7. Security, privacy and legal boundary

Until written guidance from Tahir Khan sahib arrives:

- **No** permanent storage, normalization, cross-user reuse, or durable caching of
  Halal Terminal data. Already reflected in `docs/ACCOUNTS_AND_DATABASE_DESIGN.md:38,55`.
- **No** raw or provider-derived Halal Terminal content sent to any external model.
- **No** public claim describing detailed screening methodology.
- **No** public identification of the Shariah-data provider.
- Generic wording about Shariah screening is acceptable, provided it implies no
  ownership, endorsement, recognition, or undisclosed methodology.

---

## 8. Consequences for PR 1B

Terminology is settled: **"AzaLens Verdict"** and **"Evidence Agreement"**. The verdict
card already uses both, so PR 1B is mainly naming debt:

1. Rename the `"AI thesis"` tab to **"Thesis"** (`AnalysisPage.tsx:47`, `SettingsPage.tsx:46`).
2. Rename files/symbols: `AIVerdictCard` → `VerdictCard`, `AIExplanation` → `EvidenceSummary` (or similar); delete the `AIVerdict.tsx` shim.
3. Remove dead exports `AIVerdict` and `AIReasoning` (`index.ts:2,7`) and the unused `AIReasoning.tsx`.
4. Introduce no "AI" wording anywhere; do not brand deterministic computation as AI.

PR 1B is **pure renaming and dead-code removal** — no behaviour change, and visual
baselines change only where the tab label is captured.

---

## 9. Consequences for PR 2

- The contract stays **self-sufficient**: every user-facing sentence present and final,
  with no field whose meaning depends on a model.
- The backend keeps sole ownership of `publicLabel` and all wording
  (`docs/VERDICT_CONTRACT.md` §3.1); the frontend renders verbatim.
- Preserve the internal→public mapping, fail-closed defaults, coherence guard, and the
  typed risk contract exactly as specified.
- PR 2 implements **only** the self-sufficient deterministic contract currently
  required. No slot, field or placeholder is reserved for model output. A future model
  layer may justify an additive contract extension only after a demonstrated user need,
  legal and privacy clearance, and a separate architecture decision.

---

## 10. Deferred until counsel replies

- Any durable storage, normalization or caching of Halal Terminal data.
- Any transmission of provider-derived Shariah content to a third party, including a model.
- Whether generic Shariah methodology wording may be published, and in what form.
- Whether the provider may ever be named publicly.

None of these block PR 1B or PR 2.

---

## 11. Revisit triggers

Reopen this decision if: users demonstrably cannot understand the deterministic
guidance; a paraphrasing layer can run without transmitting provider-derived Shariah
content and without durable storage; written legal guidance permits a wider boundary;
or a genuine capability (not phrasing) requires generation.

---

## 12. Implementation sequence

1. **Approve this decision.**
2. **Add synthetic Shariah fixtures** for development, CI, demos and scholar review
   without spending real provider tokens. *(Next engineering task — not authorised here.)*
3. Implement **PR 1B** on the settled terminology.
4. Implement **PR 2** on the settled contract boundary.
5. Continue to **PR 3**.
