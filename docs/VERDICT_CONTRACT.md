# AzaLens — Rule 6 Verdict Contract

**Status:** Authoritative specification for the public verdict surface.
**Owner:** `backend/services/guidanceContractService.js`
**Consumer:** `frontend/src/components/analysis/GuidanceVerdict.tsx`

This document is the specification the implementation must satisfy. It was written
before the implementation it describes. It exists because the outcome framework was
agreed as a product decision and never recorded in the repository, which allowed the
code to drift from the decision without anyone being able to point at the divergence.

Related: `docs/CONSTITUTION_COMPLIANCE.md` (Rule 6 — mentor, not signal), Rule 9
(evidence before conclusions), Rule 10 (risk before opportunity).

---

## 1. The eight-outcome framework

AzaLens has exactly **eight** public outcomes. Six describe the present analysis
snapshot and are live. Two describe how a *previously issued* verdict has aged and
are deferred.

### 1.1 Six live present-analysis outcomes

| # | Public label | Meaning |
|---|---|---|
| 1 | `Constructive — Upside Evidence Established` | Established bullish evidence. |
| 2 | `Adverse — Downside Evidence Established` | Established bearish evidence. |
| 3 | `Unconfirmed — Evidence Still Developing` | Directional lean present, established-evidence test not satisfied. |
| 4 | `Mixed — No Established Edge` | No directional edge: either no directional evidence, or directional evidence deadlocked. |
| 5 | `Analysis Limited — Evidence Incomplete` | Evidence missing, stale, insufficient, unusable, unrecognised, or internally contradictory. |
| 6 | `Verdict Withheld — Shariah Gate Not Cleared` | AAOIFI compliance is not confirmed and current. |

These strings are exact. They are the only directional-verdict wording the product
may render. They are compared verbatim in tests and in Playwright visual assertions.

### 1.2 Two deferred lifecycle outcomes

| # | Public label | Why deferred |
|---|---|---|
| 7 | `Deteriorating` | Requires comparing the current verdict against a **prior stored verdict** for the same symbol. |
| 8 | `Invalidated` | Requires knowing that a **previously issued** thesis has since been broken. |

Neither may be implemented as a current-snapshot verdict state.

A single analysis snapshot contains no history. `buildGuidanceContract` receives one
point in time: one agreement result, one confluence result, one trust-metadata block.
Nothing in that input can distinguish "the evidence is weak now" from "the evidence
was strong yesterday and is weaker today". Emitting `Deteriorating` from a snapshot
would mean inferring a trajectory from a single sample — a claim the data cannot
support, and therefore a Rule 9 violation (evidence before conclusions).

`Invalidated` is subtly different but blocked for the same reason. The product does
already compute a *thesis invalidation boundary* (`buildThesisInvalidation`, surfaced
as `intact` / `violated` / `unknown`). That is a **condition on the current
snapshot** — "price is currently below the level that would break this reading" — not
a lifecycle claim that a verdict AzaLens previously published has since failed. The
latter requires knowing what was published and when.

Both therefore depend on the **outcome ledger**: durable per-symbol verdict history
with the timestamp, the state, the evidence basis, and the invalidation level of each
issued verdict. That ledger does not exist in this repository. When it does, these two
outcomes become derivable honestly, and only then.

Until then, evidence that has weakened resolves to one of the six live outcomes —
normally `Unconfirmed — Evidence Still Developing` or `Analysis Limited — Evidence
Incomplete`. Degrading to an honest live outcome is correct; inventing a lifecycle
claim is not.

### 1.3 Wording revision — approved

An earlier recorded decision used **"Constructive — Confirmation Established"**. This
specification uses **"Constructive — Upside Evidence Established"**, and that wording
is **approved**.

It was chosen for two reasons. It accurately describes what the label actually
asserts: that the independent established-evidence gate in §4 was satisfied — a
property of the *evidence*, not of a confirmation event. And it pairs symmetrically
with "Adverse — Downside Evidence Established", so the two directional outcomes read
as mirror images rather than as two unrelated claims. It also avoids overloading the
word *confirmation*, which this contract already uses for a different and specific
thing (the confirmation condition, §6).

---

## 2. Internal state → public label mapping

The backend keeps more internal states than the public surface exposes. Internal
states are diagnostic; public labels are what a user reads.

| Internal `verdict.state` | `verdict.direction` | Public label |
|---|---|---|
| `FAVORED` | `BULLISH` | Constructive — Upside Evidence Established |
| `FAVORED` | `BEARISH` | Adverse — Downside Evidence Established |
| `LIMITED_EVIDENCE` | `BULLISH` / `BEARISH` | Unconfirmed — Evidence Still Developing |
| `NEUTRAL` | `null` | Mixed — No Established Edge |
| `CONFLICTING` | `null` | Mixed — No Established Edge |
| `UNAVAILABLE` | `null` | Analysis Limited — Evidence Incomplete |
| `WITHHELD` | `null` | Verdict Withheld — Shariah Gate Not Cleared |

**`NEUTRAL` and `CONFLICTING` stay distinct internally.** They are different findings:
`NEUTRAL` means no indicator expressed a direction; `CONFLICTING` means indicators
expressed directions that cancel. That difference drives different `meaning` and
`nextObservation` copy and is worth keeping for diagnosis. Both nevertheless map to
the single public label `Mixed — No Established Edge`, because from the reader's
point of view the actionable content is identical: there is no established edge.

### 2.1 Evidence-state source mapping

`agreement.evidenceState` is produced by `backend/analysis/agreement/agreementEngine.js`
and has exactly **eight** values. All eight are mapped explicitly:

| `evidenceState` | Condition | Internal state |
|---|---|---|
| `Evidence unavailable` | no usable evidence family | `UNAVAILABLE` |
| `Insufficient evidence` | exactly one usable family | `UNAVAILABLE` |
| `No directional evidence` | every usable family neutral | `NEUTRAL` |
| `Conflicting evidence` | equal bullish and bearish families | `CONFLICTING` |
| `Limited evidence` | a dominant lean with incomplete coverage | `LIMITED_EVIDENCE` |
| `Low agreement` | complete coverage, 1–2 families supporting | `LIMITED_EVIDENCE` |
| `Moderate agreement` | complete coverage, 3 families supporting | `FAVORED` *(candidate — subject to §4)* |
| `High agreement` | complete coverage, 4 families supporting | `FAVORED` *(candidate — subject to §4)* |
| **anything else** | — | `UNAVAILABLE` |

`Low agreement` maps to `LIMITED_EVIDENCE` rather than `FAVORED`: agreement the
engine itself classifies as low is by definition not established.

`Moderate agreement` and `High agreement` produce only a **candidate** `FAVORED`. The
candidate is demoted to `LIMITED_EVIDENCE` unless the independent established-evidence
test in §4 passes.

### 2.2 Where the eight wire values are declared

These eight strings are **wire values**, not display copy. They cross the API
boundary verbatim, and an unrecognised one fails closed to `UNAVAILABLE` (§3.2) —
which means a silent rename does not throw, it quietly strips the directional
verdict from every affected analysis. That failure mode is why the vocabulary is
named rather than retyped at each use site.

**The declarations, stated honestly:**

- `backend/analysis/agreement/agreementEngine.js` exports `EVIDENCE_STATES`,
  `EVIDENCE_FAMILIES` and `EXPECTED_FAMILIES`. This is the **canonical declaration
  and the only producer** of the eight values. `guidanceContractService.js` imports it and
  builds `EVIDENCE_STATE_TO_INTERNAL`, `ESTABLISHABLE_EVIDENCE_STATES` and the
  unavailable-state fallback from it, so the backend has one source.
- `frontend/src/types/analysis.ts` declares `EVIDENCE_STATES`,
  `EVIDENCE_FAMILY_IDS` and `EXPECTED_EVIDENCE_FAMILIES` **separately**.

**There is no frontend-to-backend import, and this document does not claim the
repository has a single physical declaration site.** The backend module is
CommonJS and server-only; the browser bundle cannot import it. The two
declarations exist by necessity.

What keeps them from drifting is symmetry, not sharing: **both sides pin the same
eight literals in their own test suite** —
`backend/tests/testEvidenceAgreementContract.js` from the backend side, and the
`evidence-state wire vocabulary` block in
`frontend/src/components/analysis/VerdictCard.test.tsx` from the frontend side.
Either declaration changing alone fails its own suite. The backend suite
additionally proves every declared state is reachable from a real census and that
no census produces an undeclared state; `testGuidanceContract.js` proves the
guidance map closes over exactly that vocabulary in both directions.

`buildGuidanceContract` remains the canonical owner of the public payload.
`buildEvidenceAgreement` publishes the engine's census under the contract's field
names and never re-derives a percentage, a grade or a count — proven by
`testEvidenceAgreementIsNotReDerived`, which runs the real `analyzeAgreement` and
compares the published contract against the engine's own output field by field.

**No API field, value, threshold or rendered wording changed when this was
recorded.** `data.agreement` and `data.guidance.evidenceAgreement` both still
carry the same census under their existing names; aligning those two surfaces is
deliberately not part of this change.

### 2.3 Evidence Agreement is a count, not a score

Evidence Agreement publishes **two separate facts** and no percentage:

- **Directional support** — how many of the four independent evidence families back
  the dominant lean (`support.supportingFamilies`, with opposing and neutral counts).
- **Evidence coverage** — how many families were usable at all
  (`coverage.usableFamilies` out of a constant `coverage.expectedFamilies` of 4).

The denominator never shrinks. Two usable families that agree read as
*"2 of 4 evidence families support a bullish lean. 2 families are unavailable."* —
never as unanimity.

**The four families**, and why they are grouped this way:

| Family | Members | Minimum usable | Basis |
|---|---|---|---|
| Trend position | EMA, SMA, Bollinger Bands | 2 of 3 | where price sits relative to a recent mean of the same close series |
| Momentum | RSI, MACD | 2 of 2 | rate-of-change statistics of the same close series |
| Price action | Candlestick | 1 of 1 | the shape of the most recent bar |
| Volume flow | OBV | 1 of 1 | direction weighted by traded volume |

ADX and RVOL are **context**: they measure trend strength and participation, never a
direction, so they do not vote. **Volume Spike does not vote at all** —
`volumeSpikeService` derives it from `getRVOL` and passes that same ratio into
`detectVolumeSpike`, so counting both would count one observation twice.

**Family availability and voting.** A multi-indicator family must meet its minimum
availability threshold before it may vote. Once usable, its direction is the balance
of its bullish and bearish members. One directional member may therefore establish the
family when the remaining usable members are neutral — but **not** when a required
member is unavailable, because the threshold makes the family unavailable first.
Unavailable members never become neutral: "we could not measure this" and "we measured
this and it points nowhere" are different findings, and both stay inspectable in
`coverage.families[].members`.

**What the support count is not.** It is **not a probability**, **not predicted
accuracy**, **not a performance guarantee**, and **not an empirically calibrated
confidence score**. It is a count of independent evidence families, against a fixed
denominator, and nothing more.

**The grouping is provisional and structural, not measured.** It is derived from how
the indicators are computed — shared close series, shared windows, one indicator
derived from another — and not from any estimate of statistical dependence. No
historical sample exists in this repository from which dependence could be measured,
and none may be obtained by calling a provider. Any future re-grouping must be
justified by measurement, and must not be described as validated until it is.

---

---

## 3. Backend ownership of `publicLabel`, and fail-closed behaviour

### 3.1 Canonical ownership

The guidance contract carries a `publicLabel` field. The backend generates it
deterministically from the internal state and direction. **The frontend renders it
verbatim.**

There must be exactly one label map in the codebase. A second map in the frontend is
a correctness hazard, not redundancy: the two drift, and the drift is invisible until
a user reads a label the backend never authorised. The frontend must not reconstruct,
translate, prettify, or repair verdict wording.

If `publicLabel` is absent or not a non-empty string, the frontend renders the
`Analysis Limited — Evidence Incomplete` wording. It does not attempt to derive a
label from `verdict.state`.

### 3.2 Fail closed

**Unrecognised input must never produce a confident label.**

The prior implementation fell through to `FAVORED` whenever `direction` was `Bullish`
or `Bearish`, regardless of `evidenceState`. An absent, unknown, malformed, or
unsupported `evidenceState` therefore produced the *most* confident public verdict the
product can issue. That is fail-open on the verdict: the failure mode of not
understanding the input was to sound maximally certain.

The rule is inverted. Every input that is not an explicitly recognised, explicitly
mapped evidence state resolves to `UNAVAILABLE` →
`Analysis Limited — Evidence Incomplete`. This covers absent, `null`, empty,
non-string, unknown, stale, insufficient, unsupported, and malformed values.

### 3.3 The Shariah gate

The Shariah gate is evaluated first and is absolute. When
`evaluateComplianceGate` does not unlock, the contract returns `WITHHELD` with
`direction: null`, no supporting or opposing evidence, no invalidation, no risk, and
no directional next step — regardless of how strong the technical evidence is.

---

## 4. "Established evidence" — independent definition

### 4.1 The circularity that had to be removed

The rule "established evidence requires a confirmation condition" is worthless if the
confirmation condition is itself generated from the direction that produced the
verdict. In the prior implementation `confirmations` was
`direction ? [buildNextObservation(state, direction, confluence)] : []` — so any
directional verdict automatically had a confirmation, and the gate could never fail.
A test that cannot fail is not a gate.

### 4.2 The rule

Evidence is **established** only when **all four** independent conditions hold:

| # | Condition | Source |
|---|---|---|
| **E1** | `agreement.agreement === "aligned"` | `agreementEngine` structural verdict: a dominant lean, complete family coverage, at least 3 of the 4 families supporting, and strictly outnumbering the opposing side. |
| **E2** | Complete family coverage: `coverage.usableFamilies ≥ coverage.expectedFamilies`, and `expectedFamilies > 0` | `agreementEngine` family census. |
| **E3** | No conflicting-evidence condition: `support.supportingFamilies > support.opposingFamilies`, and `evidenceState` is not a conflicting/limited/neutral/unavailable/insufficient state | `agreementEngine` family counts. |
| **E4** | Evidence is fresh and reviewable: `metadata.reviewRequired !== true`, `metadata.evidenceCompleteness.status === "complete"`, and `dataQuality.status` is not `degraded` / `unavailable` | `analysisTrustService` freshness and data-quality state. |

If any condition fails, the verdict degrades to `LIMITED_EVIDENCE` →
`Unconfirmed — Evidence Still Developing`. It never degrades to `FAVORED`.

E1 and E3 both read family counts but test different properties: E1 is the engine's
own composite aligned/conflicting verdict including its confidence floor; E3 is a
direct check that the opposing side does not match the dominant side, and that the
evidence state itself is not one the engine already flagged as unusable. E3 is the
guard against E1's threshold being relaxed later in the agreement engine without this
contract noticing.

### 4.3 Proof of non-circularity with the confirmation condition

| | Established-evidence test (§4.2) | Confirmation condition (§6) |
|---|---|---|
| Module | `analysis/agreement/agreementEngine.js` + `services/analysisTrustService.js` | `analysis/confluence/confluenceEngine.js` |
| Contract input | `input.agreement`, `input.metadata`, `input.dataQuality` | `input.confluence` |
| Fields read | `agreement`, `availableIndicators`, `expectedIndicators`, `bullishSignals`, `bearishSignals`, `evidenceState`, `reviewRequired`, `evidenceCompleteness.status`, `status` | `nearestSupport.zone.center`, `nearestResistance.zone.center` |

**The established-evidence test reads zero fields from `input.confluence`. The
confirmation condition reads zero fields from `input.agreement`, `input.metadata`, or
`input.dataQuality`** beyond the already-resolved direction it is phrased around.

The reverse circularity is therefore also closed. The concern is that if "established"
required a structural level, and the confirmation sentence were generated from that
same level, the circle would simply have moved. It does not: establishment is decided
entirely by indicator agreement and data freshness, and never consults a price level.
Two behavioural consequences follow, and both are asserted by tests:

- Removing or changing `confluence` entirely **cannot** change whether evidence is
  established.
- Changing agreement structure, coverage, or freshness **cannot** change the
  confirmation sentence's price levels.

### 4.4 Reachability without weakening

The rule is satisfiable by realistic agreement-engine output. With all four families
usable and trend position, momentum and volume flow all reading bullish while price
action is neutral: `supportingFamilies = 3`, `opposingFamilies = 0`,
`usableFamilies = 4` → `agreement === "aligned"` (3 ≥ 3, 3 > 0, complete coverage),
`evidenceState === "Moderate agreement"`. With fresh metadata and complete evidence,
E1–E4 all hold. The mirrored bearish assessment reaches `Adverse` identically.

The threshold must not be lowered to make an outcome reachable. If a well-drawn rule
could not be satisfied by real inputs, the correct response would be to report the
contract gap, not to loosen the rule until something passes.

### 4.5 Fallback confirmation does not establish evidence

When no genuine confirmation condition exists, the contract emits honest fallback
wording (§6). **Fallback wording is not evidence.** It never contributes to the
established-evidence test, which does not read `confirmations` at all.

---

## 5. Coherence guard

A backend contract-level validator runs on the assembled contract and rejects
internally contradictory combinations. It rejects at minimum:

1. A constructive / upside-established label paired with `BEARISH` direction.
2. An adverse / downside-established label paired with `BULLISH` direction.
3. `NEUTRAL`, `CONFLICTING`, `LIMITED_EVIDENCE`, `UNAVAILABLE` or `WITHHELD` carrying
   a directional public label, or a directional label not matching the state's own
   mapping.
4. `WITHHELD` exposing directional guidance: a non-null direction, supporting or
   opposing evidence, an invalidation block, or a directional `allowedNextStep`.
5. A directional public label paired with a `null` direction, or a non-directional
   label paired with a non-null direction.

### 5.1 Chosen failure mode: fail closed to Analysis Limited

A detected contradiction **does not throw** and **is not repaired in place**. The
contract is replaced with a fully non-directional `UNAVAILABLE` contract carrying the
`Analysis Limited — Evidence Incomplete` label, `direction: null`, empty supporting
and opposing evidence, fallback confirmation, `invalidation: null`, `risk: null`, a
non-directional `allowedNextStep`, and an added limitation recording that an internal
consistency check failed.

**Justification.** Throwing would 500 the entire analysis: the Shariah screening,
price context, indicators and risk workspace would all disappear because one label
disagreed with one direction. That trades a presentation defect for a total outage,
and it punishes the user for a backend bug. Conversely, silently repairing the label
would leave a contradiction the product cannot actually explain, presented as though
it were a normal result. Failing closed to Analysis Limited is the only option that
satisfies both hard requirements: the analysis survives, **and no directional label is
ever rendered from a contract that failed its own consistency check**.

Contradictions are not repaired at the frontend. The frontend has no authority over
verdict wording (§3.1), so it has no means to detect or fix one.

The guard's failure mode is covered by a test using a controlled, intentionally
contradictory fixture. No permanent broken test or source mutation is left behind.

---

## 6. Confirmation condition

`confirmations` must never be empty in a way that makes the "Confirmation condition"
block silently vanish. Disappearing content reads as "there is nothing to say here",
when the truth is "no confirmation condition could be derived".

When a genuine confirmation condition exists — a real structural level from the
confluence engine — it is rendered. When none exists, the contract emits:

> No independent confirmation condition is available from the current evidence.

This fallback is always rendered, and it never qualifies evidence as established
(§4.5).

---

## 7. Invalidation

`VerdictCard` already renders honest fallback text for both technical and
fundamental invalidation when the analysis API supplies none
("No technical invalidation rule was supplied by the analysis API."). That behaviour
is correct and is preserved unchanged. Invalidation is not claimed to be absent when
the component already handles absence.

---

## 8. Allowed next step

`allowedNextStep` is computed by the backend and must be rendered. It is mentor
guidance, not an instruction:

- It is an **observe / check / wait / reassess** action.
- It is **never** BUY, SELL, HOLD, or any personalised transaction command.
- When guidance is withheld or non-directional, it says so without implying a trade.

---

## 9. Risk contract

`risk` is a typed, deterministic contract built from fields the risk engine
(`backend/analysis/risk/riskEngine.js`) actually returns:

```
risk: {
  level: string | null       // riskLevel: "Low" | "Moderate" | "High" | "Very High"
  score: number | null       // riskScore: 0–100
  volatility: string | null  // volatility classification
  summary: string | null     // riskSummary
  notes: string[]            // riskNotes
} | null
```

No risk metric is fabricated and no new risk system is introduced. When the risk
engine did not succeed, `risk` is `null` and the UI says so. Risk is `null` whenever
guidance is withheld or non-directional.

### 9.1 Two panels, one canonical result

The Overview page shows risk in two places, at two levels of detail. They are not
competing verdicts:

- **The Overview sidebar ("Risk context") is the concise canonical risk summary.**
  It renders `data.risk.riskLevel`, `atrPercent` and `riskSummary` directly.
- **The guidance panel ("Risk and limitations") does not issue a risk verdict.** It
  explains the same canonical result — level with its score, volatility, summary and
  notes — as context for the limitations beside it.

Both read the *same object*: `masterAnalysisService.js:1885` builds one `risk` from
`analyzeRisk`, passes it to `buildGuidanceContract` (`:1932`), and exposes it as
`data.risk` (`:2075`). `buildRisk` copies `riskLevel` verbatim and **never re-derives
a level from the score**. The risk engine is the canonical owner of the level;
guidance is a consumer. For any result the engine actually produces, the two panels
therefore show the same level.

The levels are `Low` / `Moderate` / `High` / `Very High` for both `riskLevel`
(thresholds at score 30 / 50 / 70) and `volatility` (thresholds at ATR 1.5% / 3% / 5%).
`MEDIUM` is not a value this system produces, in either field.

The two panels legitimately differ in *detail* — the sidebar shows ATR percentage, the
guidance panel shows the score and notes — and in *availability*: guidance withholds
risk entirely when the verdict is withheld or non-directional (§3.3), while the sidebar
continues to show the canonical summary.

### 9.2 Score/level coherence is enforced at one shared boundary

Canonical ownership is not blind trust. Nothing may reclassify a level, and nothing
may publish a self-contradicting profile such as `Low · 95/100`.

`riskEngine.js` owns the thresholds once and exports them alongside the classifier:

- `classifyRiskLevel(score)` — strict. It rejects any non-`number`, non-finite or
  out-of-range value rather than coercing it. `Number(null)`, `Number("")`,
  `Number("  ")` and `Number(false)` are all `0`, and `0` is a legitimate score, so a
  coercing classifier would certify `null` as `Low`.
- `isCoherentRiskResult(risk)` — `success === true`, a finite in-range score, a
  `riskLevel` exactly matching one of `RISK_LEVELS`, and the two agreeing under the
  thresholds. No trimming, no case folding, no clamping.
- `validateRiskResult(risk)` — the boundary. A coherent result passes through
  untouched; an already-failed result keeps its own reason; a result claiming success
  while contradicting itself is replaced with the engine's existing unavailable shape
  (`{ success: false, symbol, error }`). No new public risk category is introduced.

**The boundary is applied once, in `masterAnalysisService.js`, immediately after
`analyzeRisk`.** Both consumers are handed that same validated object: `data.risk`
(the Overview sidebar and the Risk workspace) and the `risk` input to
`buildGuidanceContract`. Because withholding happens *before* either consumer exists,
the two public panels cannot publish contradictory risk meanings for one response.

`buildRisk` in the guidance contract calls the same exported `isCoherentRiskResult` —
the one predicate, not a second validator — so calling `buildGuidanceContract`
directly with an unvalidated result is equally safe.

The score range is `0`–`100`, taken from the engine's own clamp
(`riskScore = Math.max(0, Math.min(100, riskScore))`), not assumed.

Withheld risk still renders honestly: the guidance panel says no risk profile is
published, the sidebar shows "Review required" and "Risk context is unavailable for
this analysis.", and the Risk workspace shows "Unavailable". None of them invents a
level.

This is proven at the boundary in `backend/tests/testRiskBoundary.js`, which runs the
real `getMasterAnalysis` control flow and asserts the serialized response exposes
neither half of the contradictory pair.

---

## 10. Verification rules

These two rules govern how work on this contract is accepted. They are recorded here
because both were violated in the history that produced this correction.

### 10.1 Green CI is bound to a SHA

**A green CI run is valid only when its head SHA exactly matches the commit being
approved or merged.** A green run on an earlier commit says nothing about the commit
in front of you. Before approving or merging, compare the run's head SHA to the
commit's SHA and treat any mismatch as *no CI evidence at all*, not as probably-fine.

### 10.2 Reported work is not implemented work

**Work is implemented only when Git provides durable evidence of it:** a `git status`
entry, a `git diff`, a commit, a stash, or a build artifact. A description of a change
— however detailed, however confident — is not the change. Verify against the
repository, never against the report.

### 10.3 Vercel production identity is decided by environment name, not `production_environment`

This is an **integration-specific evidence rule** for this repository's Vercel GitHub
integration. It exists because a previously required condition was, in fact,
unsatisfiable here.

**The finding.** Vercel's GitHub integration does not set the `production_environment`
boolean on the deployment records it creates. A read-only review of **100 historical
deployment records** in this repository found **zero** instances where
`production_environment` was `true`. That covered both `Production – azalens` and
`Preview – azalens` deployments, both the `azalens` and `alpha-lens-ai` projects, and
every prior merge through PRs #9–#15. The flag is `false` on production deployments and
`false` on previews alike, so it carries no signal and cannot separate them.

**Consequence.** `production_environment` must still be **reported honestly** whenever
production is verified, but it **must not be used as the deciding production-identity
gate** for this integration. A gate requiring `production_environment: true` would fail
on every commit this project will ever ship.

**The replacement gate.** A Vercel deployment counts as verified production only when
**all six** hold:

| # | Condition |
|---|---|
| **V1** | The deployment environment name begins with `Production – ` and **not** `Preview – ` |
| **V2** | The deployment record's source SHA equals the exact target commit SHA |
| **V3** | The deployment's latest status state is `success` |
| **V4** | The established production domain returns HTTP 200 |
| **V5** | The served production content corresponds to the target build through the strongest safe evidence available — for example build/content correspondence such as a matching `index.html` or content-hashed assets, plus a clean browser load with no console errors, page errors or failed requests |
| **V6** | The branch preview deployment, if one exists, is separately identified and explicitly not mistaken for production |

V5 is deliberately phrased as *strongest safe evidence available* rather than
byte-equality: Vercel builds in its own environment, so its bundle hashes need not match
a local build of the same tree, and its deployment URLs may be SSO-protected. Absence of
byte-equality is therefore not evidence of a wrong commit — but neither may it be waved
away. State which evidence was obtained and which was not.

**Every production verification must report:** deployment ID · environment name · source
SHA · latest state · production URL/domain · HTTP status · and **any contradictory
metadata, including the actual `production_environment` value**.

**Boundaries on this rule.**

- It is an integration-specific evidence rule. **It is not permission to ignore an
  arbitrary failed condition.** It applies only to `production_environment` on Vercel
  GitHub deployment records, and only because that field was proven to carry no signal
  here. Any other failed gate still stops the work.
- **No deployment or repository configuration may be changed merely to make verification
  pass.** If a gate cannot be satisfied, the honest response is to report the blocker and
  ask, never to adjust the system until the check goes green.
- **Exact deployment identity and successful production serving are the controlling
  facts** — V1–V6 above, not any single boolean.
- **Future instructions should use this recorded rule rather than requiring
  `production_environment: true`.**

**Historical record, preserved deliberately.** During PR 2 (merge SHA `31fafd5`) the
authorization required `production_environment: true` and instructed a stop if the
condition differed. The value observed was `false`. Work continued, with the actual value
disclosed in the report. **Continuing was a procedural deviation from that
authorization** — disclosure did not make the condition pass, and the correct response
at the time would have been to stop and seek direction. No repository or deployment
configuration was altered to bypass the condition. This rule was written **afterwards**,
once the field was shown to be unsatisfiable, to prevent recurrence. It does not
retroactively make the original condition satisfied.

---

## 11. Test coverage notes

### 11.1 Backend CI suite count

`backend/tests/runCiSuite.js` now registers **38** deterministic suites, following the
direct registration of `testGuidanceContract.js` and, later,
`testEvidenceAgreementContract.js`.

That registration made existing coverage *explicit*; it did not add coverage that was
missing. `testGuidanceContract.js` was already running in CI **indirectly**, because
`testTrendReliability.js:3` does `require("./testGuidanceContract").run()`. Registering
it directly means the suite is named in its own right, fails under its own heading, and
has its own `npm run test:guidance-contract` script — but the guidance contract was
never actually unguarded in CI. Recorded here so nobody later credits this change with
closing a gap that did not exist.

### 11.2 Visual coverage: page-level and scoped, both required

Commit `d7fb37d` replaced this spec's full-page screenshot with a scoped screenshot of
the `guidance-verdict` element, orphaning the four `analysis-overview-*` baselines. It
was swapped for **coverage, not stability**: the page shot was viewport-only
(`toHaveScreenshot` does not imply `fullPage`, and the baselines are exactly 1280x720
and 390x664), so it could not reach the guidance card below the fold. The separate
stabilisation work in `580e6e6` targeted the tall *element* capture.

**Both screenshots are required, and this PR restores the page-level one.** The scoped
shot proves the verdict surface is correct; the page shot proves nothing else on the
analysis page regressed while it was being fixed. `docs/DESIGN_SYSTEM.md:155`,
`WHAT_TO_DO_NEXT.md` item 3.1 and `docs/CONSTITUTION_COMPLIANCE.md:30` all still treat
overview baselines as live assets.

**Eight baselines are expected on Linux CI:**

```
analysis-guidance-{day,night}-{desktop,mobile}-chromium-linux.png
analysis-overview-{day,night}-{desktop,mobile}-chromium-linux.png
```

**The four existing `analysis-overview-*` baselines are stale and must be replaced, not
matched.** They predate the Rule 6 UI and depict the superseded card with a `BULLISH`
headline and `AI CONFIDENCE 72%` — the presentation Rule 6 and
`docs/AUDIT_2026-07-30.md` (finding V8) exist to remove. Every difference in the new
captures is intended. They must be regenerated and reviewed in Linux CI; a macOS
capture cannot satisfy Linux CI and committing one would produce a misleading gate.
