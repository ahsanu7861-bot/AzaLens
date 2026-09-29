# AzaLens — What To Do Next (Master Roadmap)

**Last updated:** 2026-09-29

**Canonical purpose:** This is AzaLens's canonical continuation and handover roadmap for future Fable, Astra, Claude, Codex, new project chats, and human reviewers. Repository evidence, merged SHAs, CI results, deployment verification, and authenticated behavior take precedence over percentages and conversational summaries.

New implementers must read `IMPLEMENTER_HANDOVER.md` alongside this roadmap before changing code, migrations, CI, or release state.

**Evidence-state vocabulary:** `PLANNED`, `IMPLEMENTED LOCALLY`, `REVIEWED LOCALLY`, `COMMITTED`, `PR CI VERIFIED`, `MERGED`, `DEPLOYED`, `AUTHENTICATED LIVE-READ VERIFIED`, `CONTROLLED LIVE-WRITE VERIFIED`, `SHADOW-TRADING VERIFIED`, and `PRODUCTION-TRUSTED`. These states are distinct and must never be conflated. Fixture-backed tests are never live-API proof. A reviewer PASS applies only to the exact bytes and evidence reviewed. Every printed PASS must correspond to an executed assertion or validation. A successful rerun never erases an earlier failure; both remain evidence.

**Historical note:** This file replaced the 2026-07-28 version on 2026-07-30 because that version was stale in both directions. The preserved historical archive below records why. Its former status labels and priorities are historical evidence, not current instructions.

Companion documents: `docs/AUDIT_2026-07-30.md` (verification evidence), `docs/CONSTITUTION_COMPLIANCE.md` (rule-by-rule), `docs/DESIGN_SYSTEM.md` (visual plan).
**Cost note convention:** every item states its provider/infrastructure cost. Budget reality as recorded on 2026-07-30: Halal Terminal free plan, ~177 tokens to 28 Aug 2026, ~5 tokens per screening (single data point); Render Free; Vercel free. Superseded on 2026-08-24 by the promotional Starter entitlement recorded under the production environment audit — see Finding 3 there, which also records why the application's internal budget value was left unchanged.

---

## Personal Risk bootstrap — authenticated production evidence

PR #72 merged as true merge commit `526e1c4f4d2f3f2b2e7f468bedcf80b2c0d60fb8`, tree `f63f8a202015dd5ef08195b0c7ccc9c405d71efc`. Migration `20260925120000` (Migration 009) is present exactly once in production. The matching frontend and backend release was verified, and backend liveness/readiness identify the merge commit with HTTP 200, `ready=true` and `strict=true`.

An authenticated owner-scoped production audit on 2026-09-26 ran inside `BEGIN TRANSACTION READ ONLY` and returned `transaction_read_only=on`; the owner was resolved without recording or printing its identifier. It verified exactly one active policy version 1; exactly one `Saxo Bank` Classic schedule version 1 with the four reviewed components and FINRA source-effective date `2026-01-01`; exactly one `2784.95000000 USD` equity snapshot observed at `2026-09-25T22:07:30Z`; and exactly one New York daily basis for `2026-09-25` plus one weekly basis for `2026-09-21`, both `2784.95000000 USD`, sequence 1, linked to that snapshot. The owner separately observed Account value `$2,784.95 USD` and cash `$2,784.99 USD`; the snapshot correctly used Account value. Bootstrap status is complete with no pending intent. All nine actual Migration 004/008 outcome-ledger, position-risk and evaluation tables contain zero owner rows.

The schedule continues to use the broker name printed on the owner's Account Statement, Cost Overview Report and Personal Information export. This evidence does **not** verify the account agreement's contracting-entity clause. The documented 2026-10-01 through 2026-12-31 TAF pause remains disclosed while the founder-approved allowance remains predictive conservatism, not a FINRA assessment or a charge proven to be billed by Saxo.

## Shadow arithmetic parity — released evidence

PR #74 merged as true merge commit `4c74803216b4cd37fd50b44dffe9200323969582`, tree `7f9153b3d270e88fca91753ea9fb64b422c7111c`, with ordered parents `040b52cea31dd0ffa2dc133081b10201236c2b4a` and `027b89fd9f42d63d6ce61629f2b9dc554daebf07`. The first PR run `36270527058`, attempt 1, remains a genuine failure: the database job installed only backend dependencies, while the original harness tried to spawn the absent frontend Vitest runner. It was not rerun. The reviewed Option 1 correction compiles and executes the exact checked-out `personalRiskShadowPreview.ts` bytes in-process using the backend's pinned TypeScript dependency, checks backend/frontend TypeScript lockfile equality, and fails before PASS output on loader/setup errors.

Corrected-head PR run `36272559294`, attempt 1, and first-main run `36272831375`, attempt 1, each passed all five Reliability Gates jobs. The database job proved 16 synthetic fixtures across all 12 canonical numeric fields—192 field comparisons—against the authoritative `_risk008_calculate` arithmetic, including the negative half-unit rounding anchor. The release classifier correctly returned `backendChanged=true`; Vercel and Render deployed the matching merge, production health passed, and Render liveness/readiness identified the merge commit. The private backup added `AzaLens-2026-09-27-4c74803.zip` and its SHA-256 sidecar with active direct-child inventory `129 → 131`, in-scope trash `0 → 0`, owner-only permissions, immutable-ID byte readback, ZIP integrity and reconstructed tree verification.

This proof is informational and deliberately labelled `SHADOW_PREVIEW`: the unwired preview matches `_risk008_calculate` only for the reviewed arithmetic fixtures and numeric fields. It establishes **no** rejection-code or decision-precedence parity, runtime risk-flow integration, live position write, or trade execution.

## Decision parity — released evidence

Step W is **DONE**. PR #78 merged as true merge commit `271ff3f3c34e5d25dd2357068901be47cf4c4845`. Its disposable-database harness invoked the actual Migration 008 opening, increase and stop-loosening RPCs across 37 completed cases, proving rejection tuples and precedence under overlapping failures plus the independence of broker-confirmed exit recording and stop tightening while their own database paths are healthy. Explicit success-path rollback and connection-close rollback on failure were checked from a separate backend connection with a different `pg_backend_pid()`; exact before/after counts matched and fixture markers remained zero.

First-attempt PR Reliability Gates run `36351300421` and first-main run `36351681789` both passed all five jobs without rerun. Main emitted `DECISION_PARITY_CASES_COMPLETED=37`, the separate-connection rollback proof, `REVERSIBILITY CHECK PASSED`, and `VISUAL_COMPARISON_PROOF=exact-set:24/24`. Release Health run `36351919342`, attempt 1, classified `backendChanged=true`, expected the full merge SHA, and configured at most 30 deployment-health polls at 15-second intervals; poll attempt 1 observed the matching backend commit. The classifier exposes no `frontendChanged` field. Vercel's `azalens` production deployment completed successfully.

The exact merge is privately backed up as owner-only, unshared `AzaLens-2026-09-28-271ff3f.zip` and its SHA-256 sidecar. Immutable-ID readback was byte-identical, all 477 reconstructed blobs matched the merge tree, credential and Git-metadata audits were clean, active direct-child inventory moved `135 → 137`, and trash remained `0 → 0`.

This closes database decision and recording parity only. It does **not** establish runtime wiring, shadow trading, live position writes, or Saxo execution. AzaLens recording an exit or stop change remains distinct from executing an order at Saxo.

## Migration 010 direction-guard infrastructure — applied and independently verified in production

The documentation merge `3cb47a5f4569a57462667afcc7d28c2ef927ab0f` is privately backed up as `AzaLens-2026-09-28-3cb47a5.zip` (ZIP SHA-256 `f10d9901702e67076b21d0251652efc57292102509986fa06a7e5a678aee23b6`; sidecar SHA-256 `fb510c6180b06f58be9b2724fc2da92b3160004d86d299ed56cbcdac36f05007`). Active direct-child inventory moved `137 → 139` and in-scope trash remained `0 → 0`.

PR #80 merged as true merge commit `c664b387615c1cf60d0cb7119352251a421a5a60`, tree `132901c8b61c62468fb2b64e83119e246faa7f5c`. First-attempt PR Reliability Gates run `36401404348`, attempt 1, and first-attempt exact-merge push run `36401843207`, attempt 1, passed without rerun. The slice adds Migration 010's atomic direction wrappers and API grant boundary: authenticated callers can invoke the tightening wrapper, while the generic protective-stop RPC and loosening wrapper are not API-executable. Disposable local proof covered direction enforcement, delegation to the existing generic RPC, owner isolation, nested `auth.uid()`, replay, cross-RPC key collision, concurrent tightening races and exact down/up grant reversal. This is **Migration 010 direction-guard infrastructure**, merged and locally verified; it is not the application-facing runtime increment.

The exact merge backup was read back from Drive by immutable ID. ZIP ID `132XeAJsaheFTijC2sixYn2CT2VKl0o0D` has SHA-256 `59a44c7a023de18ddcea2f4860453109085a25826ddb5bb4698d5f73ed4c6620`; sidecar ID `1ys8QNauFkbNyrq44W8wPQNzyxdTWLZnl` has SHA-256 `752825932e81d72b37006fb148d6b75ef979e3480387cffa02d5ac212597fc59` and records that ZIP hash. Active direct-child inventory moved `139 → 141` and in-scope trash remained `0 → 0`. The Drive-read archive passed `unzip -t`; `GIT_METADATA_ENTRIES`, `UNSAFE_ENV_ENTRIES`, `CREDENTIAL_NAMED_ENTRIES` and `CREDENTIAL_CONTENT_HITS` were all zero.

Migration 010 was subsequently applied to production exactly once. Its linked dry run listed exactly one pending migration, `20260928120000_010_direction_guarded_protective_stops`; independent remote history then contained version `20260928120000` exactly once. The independently read production catalog reports the generic RPC ACL as `{postgres=X/postgres}`, the tightening wrapper ACL as `{postgres=X/postgres,authenticated=X/postgres}`, and the loosening wrapper ACL as `{postgres=X/postgres}`. None has a `PUBLIC` ACL entry; all three are owned by `postgres`, are `SECURITY DEFINER`, and have `search_path=""`. The generic function retained OID `50623`, proving that the migration altered grants rather than recreating it. **The generic-RPC bypass is now closed in production**—this is the first roadmap checkpoint with evidence sufficient for that claim. The post-push catalog-cache warning was not retried; independent migration-history and catalog evidence established the committed state.

Release classification reported `backendChanged=true`, but this release lacked a same-procedure pre-deployment health sample: the new merge was already serving when the release-health run made its first capture. Future releases with `backendChanged=true` must save live and ready health captures within the same release procedure: a pre-merge capture and a post-deployment capture, each naming the commit it observed. The Release Health workflow starts after merge, so its own sample can only be a post-deployment observation.

The reported Supabase Data API grant change dated 30 October 2026 remains a **pending re-verification item**. Before it is used in any roadmap conclusion, verify the date and primary Supabase source against the then-current platform behavior and effective catalog privileges. Do not claim that a platform change secures these functions; explicit function ACLs, including `PUBLIC` inheritance, remain the security boundary to verify.

## Application-facing PR A backend — merged and deployed

PR #82 merged as true merge commit `7d3866755e5e2ad28f65d632e4c21e51fb79ef8e`, tree `4acead787851a0c7ba9470421593bed523f845c5`, with ordered parents `3730eabbbd82a81cb485f547d9f2aa51161362f6` and `651ddaf9b33a66b28e1930a71008e6083684d33a`. Its 41,075-byte first-parent patch has SHA-256 `54db42c31365602dd2ef4a34205fe78ecac9f8880e02e22627280da756ec20e3` and was byte-identical to the frozen reviewed patch. PR Reliability Gates run `36540038953` and exact-merge run `36540581533` both passed on attempt 1. Release Health run `36541023065`, attempt 1, reported `backendChanged=true` and `deployment.commit=7d3866755e5e2ad28f65d632e4c21e51fb79ef8e`.

Migration 010 was applied and independently production-verified before PR #82 merged, so `tighten_outcome_protective_stop` existed in production before any route calling it was deployed.

The backend-only increment provides owner-only broker-confirmed partial/final-exit recording and protective-stop tightening through the tightening wrapper, plus owner-scoped readback and distinct commit-known, commit-unknown and recovery behavior. PR #82 deployed those backend routes but did not exercise a production lifecycle RPC, write a position, or execute a Saxo order. AzaLens records broker-confirmed events; Saxo executes trades and orders. The UI remains unbuilt and is the single next implementation increment.

The same release procedure preserved pre-merge live/ready captures at `08:05:24` observing `c664b387615c1cf60d0cb7119352251a421a5a60` and post-deployment live/ready captures at `08:11:03` observing `7d3866755e5e2ad28f65d632e4c21e51fb79ef8e`. Release Health run `36541023065` contains a post-deployment observation only; it did not and structurally could not capture the pre-deployment state.

The exact merge is privately backed up as owner-only, unshared `AzaLens-2026-09-29-7d38667.zip` (SHA-256 `69434688ae751cd9e9392d4c766ddc26675c5bd12d7ceb1bd5729590f6c110a5`) and its sidecar (SHA-256 `732c0f81a10af766318d73b864cef45db02cc222b0f30704e8d785ba9ef07efe`). Immutable-ID readback, `unzip -t`, and reconstruction of all 486 blobs proved tree `4acead787851a0c7ba9470421593bed523f845c5`; all four credential/Git/environment audit counters were zero, both objects were `shared:false`, active direct-child inventory moved `143 → 145`, and trash remained `0 → 0`.

## Personal Risk lifecycle UI — merged and deployed (PR #85)

PR #85 merged as true merge commit `1ffdbd87c0d89437dad5a6a3a32c5dfa4d94cdc3`, tree
`42e53d0a6a2add9b57b878a765e42e9e85a7a00a`, with ordered parents
`5975cbcf40e4273f8be06fef449a25cc0bba431d` and `e26c23fcae6734da27465877497afb9ff256d293`. Its
128,772-byte first-parent patch has SHA-256
`6858a2c49e44f19efe7ceec69f15eeff24d36d744ad083688374285a1afaa7ea` and was byte-identical to the frozen
reviewed patch; the second-parent diff was empty and the first-parent path list was exactly the nine
reviewed `frontend/src/` paths. The merge tree equals the feature tree.

The slice is frontend-only. It adds a separate route `/settings/personal-risk/lifecycle` inside the
existing `ClosedDemoGate`, a typed client for PR #82's four lifecycle endpoints, and a versioned
seven-field pending safety record. No backend, migration, CI-workflow, fixture or visual-baseline byte
changed; accepted visual wiring remains 24/24 and no Personal Risk baseline was accepted.

**The first PR CI attempt is a genuine failure and was never rerun.** Run `36622052421`, attempt 1, head
`275100a76a6ae375d434ab01dbb84e863ebe24c3`: four jobs passed and **Browser journeys and accessibility**
failed. `e2e/personal-risk.spec.ts:99` reported a serious axe `color-contrast` violation on both
`desktop-chromium` and `mobile-chromium`. The new lifecycle entry control was an `<a>` styled
`bg-brand text-white`; the day-theme rule at `frontend/src/index.css:526` replaces `.text-white` inside
`.app-shell` with `var(--az-text)`, and the AA carve-out at line 538 covers `button.bg-brand` only, so the
anchor rendered `#0f172a` on `#0e7490` at **3.33:1** against a 4.5:1 requirement. The three visual-proof
step failures in that run were **cascading, not independent**: the test step exited non-zero before the
visual phase ran, so `visual-run.log` never existed and the proof steps could not execute. No visual
baseline is implicated.

Corrective commit `e26c23fcae6734da27465877497afb9ff256d293` changed only
`frontend/src/pages/PersonalRiskSettingsPage.tsx`, rendering the entry with the existing `Button` — a real
`<button type="button">` carrying `bg-brand`, which the proven line-538 carve-out covers — and navigating
with `useNavigate`. No CSS rule or token was added, no interactive element nested, and the other eight
reviewed paths stayed byte-identical. Measured in the browser from the element's own resolved styles
rather than inferred from the class: `rgb(255, 255, 255)` on `rgb(14, 116, 144)` is **5.358:1**; axe
reported **zero** violations on the tested page; Enter and Space each activated navigation to
`/settings/personal-risk/lifecycle`. `npm run test:e2e` passed 30 with 2 skipped and contained no contrast
violation.

PR run `36631347755` was **attempt 1 on the corrected bytes — not a rerun of `36622052421`** — and all
five jobs passed. Exact-merge push run `36632008513`, attempt 1, event `push`, head
`1ffdbd87c0d89437dad5a6a3a32c5dfa4d94cdc3`, also passed all five jobs and emitted its **own** required
proof lines, including `VISUAL_COMPARISON_PROOF=exact-set:24/24`, the snapshot-write-marker absence
statement, `DECISION_PARITY_CASES_COMPLETED=37` and `REVERSIBILITY CHECK PASSED`.

Release Health run `36632546515`, attempt 1, reported `backendChanged=false` with an empty
`expectedCommit`. The backend `deployment.commit` **remained**
`7d3866755e5e2ad28f65d632e4c21e51fb79ef8e` — correct for a frontend-only release — with liveness and
readiness both HTTP 200 and `ready=true`. Vercel served the production frontend shell HTTP 200 and served
the new `PersonalRiskLifecyclePage-BPNhVPfh.js` chunk (28,014 bytes) HTTP 200, so the new code is
deployed. **An HTTP 200 on the SPA route `/settings/personal-risk/lifecycle` proves shell delivery only.**
It does not prove that an authenticated owner rendered the page, that `ClosedDemoGate` admitted anyone, or
that any lifecycle action was performed. **No production lifecycle RPC, position write or Saxo order
occurred.**

The exact merge is privately backed up as owner-only, unshared `AzaLens-2026-09-30-1ffdbd8.zip`, immutable
ID `1vFsKs7MzX3AGjhDjJ7KALUA75kqCnb3w`, Drive-read SHA-256
`c0acf8fc8e23985242ba66732b4991f73533aac447bc953c1a8ad2c86a9c5209`, with sidecar immutable ID
`164nZvmXTuNXP1Wm8GKowqFCLFtdgyQB6`, Drive-read SHA-256
`de363bf2d70eccdfe5789932206b434865c88622a9aee45ffacc6dbfb7b23e91`. The sidecar matched the Drive-read
ZIP, `unzip -t` passed on the Drive-read bytes, and all 494 paths and blobs — including three
executable-mode entries — reconstructed to merge tree `42e53d0a6a2add9b57b878a765e42e9e85a7a00a`. All four
audit counters (`GIT_METADATA_ENTRIES`, `UNSAFE_ENV_ENTRIES`, `CREDENTIAL_NAMED_ENTRIES`,
`CREDENTIAL_CONTENT_HITS`) were zero, both objects are `shared:false`, active direct-child inventory moved
`149 → 151`, in-scope trash remained `0 → 0`, and no pre-existing immutable ID was lost.

## Roadmap and Personal Risk test-readiness release evidence

PR #75 was documentation-only and merged as true merge commit `bcaae1f436d404dcf53eeb8719bd576aaf57e9af`. Its first main Reliability Gates run `36302337862`, attempt 1, remains a genuine failure and was not rerun: while bootstrap status was still loading, the Personal Risk page test found **Create policy version** in the DOM but clicked it while the control was disabled, so the expected **Confirm and submit** dialog did not open. The failure was a test synchronization race; it is not recorded as a passing run or as evidence of a production defect.

PR #76 changed only `frontend/src/pages/PersonalRiskSettingsPage.test.tsx` so gated controls are located, awaited until enabled, and only then clicked before the resulting dialog or state is awaited. It merged as true merge commit `d7c3900cd4126df6009422a9e81d9ebc6099f4dc`, tree `5144aa02cec3b46336a03c76dab908f421c0fb09`. Corrected-head PR run `36304706626`, attempt 1, and first-main run `36304981261`, attempt 1, both passed all five Reliability Gates jobs; the latter retained native `VISUAL_COMPARISON_PROOF=exact-set:24/24`. Release Health classified `backendChanged=false`; Render remained healthy on `4c74803216b4cd37fd50b44dffe9200323969582`, while Vercel completed the production frontend result without requiring asset hashes to change. The exact merge is privately backed up with owner-only ZIP and sidecar, immutable-ID byte readback, archive/tree and credential checks, active direct-child inventory `131 → 133`, and in-scope trash `0 → 0`.

## THE SINGLE NEXT TASK

The former single next task — build the Personal Risk lifecycle UI — is **DONE**: PR #85 merged it and
Vercel deployed it. Its evidence is recorded above. That superseded wording is preserved in the change log
rather than silently rewritten.

**The risk-reducing lane is now built and deployed behind `ClosedDemoGate`, and the application has no
built path that would create something for it to act on.** Recording a partial exit, a final exit or a
protective-stop tightening each require an existing owner position, and the UI reaches one only through a
pasted position UUID that the owner must already hold. The established boundary, stated without asserting a
current production row count:

- **No production lifecycle RPC, position write or Saxo order occurred during the PR #82 or PR #85
  releases.** That is verified release evidence for those releases.
- **The opening and increase application paths are unbuilt.** Migration 008 defines
  `create_risk_enforced_outcome_position` and `increase_risk_enforced_position`, but **no backend route or
  service in this repository references either**, and no repository migration grants either to
  `authenticated`.
- **The UI requires a valid position UUID**, which it neither discovers nor creates; no position-listing
  endpoint exists.

The most recent point-in-time evidence about row counts is the **2026-09-26** authenticated owner-scoped
audit recorded above, which found zero rows in all nine Migration 004/008 outcome-ledger, position-risk and
evaluation tables. **That is a dated observation, not a current reading.** This roadmap change accessed no
production database, so it does not assert what exists in production now; a present-tense row count would
require an independent authenticated production read. The boundary above holds regardless of that count.
It is a structural gap in the application, not a defect in PR #85.

**The next Core implementation increment is therefore the new-risk position-opening path through the
existing `create_risk_enforced_outcome_position` RPC**, taken before increase, because increase requires a
position that opening must create first. Scope it the way PR #82 was scoped — backend route, service,
strict input validation, owner context, idempotency and recovery — and review it separately before any UI.
Three things are **undetermined and must be decided under separate review rather than assumed here**: the
HTTP route path and request contract; whether any ACL or grant change is needed for the RPC to be callable
by the authenticated owner, which requires independent production catalog evidence and must not be inferred
from migration text; and the confirmation and evidence-class semantics for creating risk rather than
reducing it. No route, default, field or operation is invented by this documentation change.

Do not begin shadow trading, create live production position writes, call production lifecycle RPCs, or
imply Saxo execution without separate authorization and evidence.

## Current repository position

- Canonical merged `main` / `origin/main`: `1ffdbd87c0d89437dad5a6a3a32c5dfa4d94cdc3`.
- Canonical tree: `42e53d0a6a2add9b57b878a765e42e9e85a7a00a`.
- Merge parents, in order: `5975cbcf40e4273f8be06fef449a25cc0bba431d`, `e26c23fcae6734da27465877497afb9ff256d293`.
- Migration 010 is applied exactly once and independently production-catalog verified; the generic-RPC bypass is closed in production.
- PR #82's application-facing backend is merged and deployed. Its first-attempt PR/exact-merge CI, same-procedure health captures and exact private backup are verified.
- PR #85's frontend lifecycle UI is merged and deployed behind `ClosedDemoGate`, with its genuine failed first PR attempt preserved and its exact private backup verified.
- The new-risk position-opening path through `create_risk_enforced_outcome_position` is the next Core implementation increment; no route or contract for it exists yet.
- The `frontend/src/pages/SettingsPage.tsx:144` accessibility work is a **shipped-code defect fix** recommended before the next Core increment. It is **not itself a Core increment**, so ordering it first does not displace or renumber anything.

**Superseded position statements, retained as historical evidence and not rewritten.** Until the
2026-09-30 reconciliation this block named `7d3866755e5e2ad28f65d632e4c21e51fb79ef8e` (tree
`4acead787851a0c7ba9470421593bed523f845c5`, ordered parents `3730eabbbd82a81cb485f547d9f2aa51161362f6` and
`651ddaf9b33a66b28e1930a71008e6083684d33a`) as canonical `main`. That was accurate at PR #82 and was left
stale through documentation merges PR #83, PR #84 and the PR #85 release; both of those documentation
merges touched only `WHAT_TO_DO_NEXT.md` and `IMPLEMENTER_HANDOVER.md`, so no implementation byte or
contract depended on the stale reference. The PR #82 figures remain correct **as PR #82's** identity
wherever they appear in that section above.

## Current working-tree scope

This 2026-09-30 documentation checkpoint is limited to this roadmap; no implementation, migration, test,
baseline or configuration file is changed. The 2026-09-29 checkpoint before it had the same scope.

## Private backup and Drive recovery state

- Canonical merge `526e1c4f4d2f3f2b2e7f468bedcf80b2c0d60fb8` is backed up as `AzaLens-2026-09-26-526e1c4.zip` (7,503,531 bytes; SHA-256 `174e415b5c3edfba5ed2cdfb8fa34b75587967805acd87a48e47a53c6973c5f2`) and `AzaLens-2026-09-26-526e1c4.sha256` (97 bytes; SHA-256 `411ca16ace01532795ad765822b58dbf29305da0f10963b924e3778b5fd10875`). Immutable-ID `copyid` readback proved byte identity, ZIP integrity and reconstructed tree `f63f8a202015dd5ef08195b0c7ccc9c405d71efc`; both objects are owner-only and `shared:false`.
- Canonical merge `4c74803216b4cd37fd50b44dffe9200323969582` is backed up as `AzaLens-2026-09-27-4c74803.zip` (7,513,019 bytes; SHA-256 `2cfcba85761e4a58776c73c5170fa9ed8de6b04ad7be967fc0c2ce2bd663bb82`) and `AzaLens-2026-09-27-4c74803.sha256` (97 bytes; SHA-256 `2db2211a488e3630f643a2de021de3bf6d1b2ca7aabfd319f278a8ba16b37c5f`). Immutable-ID readback proved byte identity, ZIP integrity, exact tracked paths and modes, and reconstructed tree `7f9153b3d270e88fca91753ea9fb64b422c7111c`; both objects are owner-only and `shared:false`. Active direct-child inventory moved `129 → 131`, recursive inventory moved `143 → 145`, and in-scope trash remained `0 → 0`.
- Canonical merge `d7c3900cd4126df6009422a9e81d9ebc6099f4dc` is backed up as `AzaLens-2026-09-27-d7c3900.zip` (7,514,637 bytes; SHA-256 `c6855cc4fbb8d9752f2903319b92517e14890c89a749eaa6afade65799983132`) and `AzaLens-2026-09-27-d7c3900.sha256` (97 bytes; SHA-256 `77ff0c564aa22ace9d039962f491040d2bf69c6662486b3766c175a21470147c`). Immutable-ID readback proved byte identity; ZIP integrity, exact tracked paths and modes, credential audit and reconstruction verified tree `5144aa02cec3b46336a03c76dab908f421c0fb09`. Both objects are owner-only and `shared:false`; active direct-child inventory moved `131 → 133` and in-scope trash remained `0 → 0`.
- Canonical merge `271ff3f3c34e5d25dd2357068901be47cf4c4845` is backed up as `AzaLens-2026-09-28-271ff3f.zip` (7,532,742 bytes; SHA-256 `d3d72d898ec54149a6100058c78407412dc25849feaaa8fd18017d8987fc92c2`) and `AzaLens-2026-09-28-271ff3f.sha256` (97 bytes; SHA-256 `518a16ba730c5fa0fab62a4205adbca293f481926395430f9acab4a0377fd4c3`). Immutable-ID readback proved byte identity, ZIP integrity and reconstruction of all 477 merge-tree blobs; credential and Git-metadata audits were clean. Both objects are owner-only and `shared:false`; active direct-child inventory moved `135 → 137` and in-scope trash remained `0 → 0`.
- Documentation merge `3cb47a5f4569a57462667afcc7d28c2ef927ab0f` is backed up as `AzaLens-2026-09-28-3cb47a5.zip` (SHA-256 `f10d9901702e67076b21d0251652efc57292102509986fa06a7e5a678aee23b6`) with sidecar SHA-256 `fb510c6180b06f58be9b2724fc2da92b3160004d86d299ed56cbcdac36f05007`; active direct-child inventory moved `137 → 139` and in-scope trash remained `0 → 0`.
- Canonical merge `c664b387615c1cf60d0cb7119352251a421a5a60`, tree `132901c8b61c62468fb2b64e83119e246faa7f5c`, is backed up by ZIP immutable ID `132XeAJsaheFTijC2sixYn2CT2VKl0o0D` (SHA-256 `59a44c7a023de18ddcea2f4860453109085a25826ddb5bb4698d5f73ed4c6620`) and sidecar immutable ID `1ys8QNauFkbNyrq44W8wPQNzyxdTWLZnl` (SHA-256 `752825932e81d72b37006fb148d6b75ef979e3480387cffa02d5ac212597fc59`). Drive-read verification passed `unzip -t`, the sidecar recorded the ZIP hash, and all four Git/environment/credential audit counts were zero. Active direct-child inventory moved `139 → 141` and in-scope trash remained `0 → 0`.
- Canonical merge `7d3866755e5e2ad28f65d632e4c21e51fb79ef8e`, tree `4acead787851a0c7ba9470421593bed523f845c5`, is backed up as `AzaLens-2026-09-29-7d38667.zip` (SHA-256 `69434688ae751cd9e9392d4c766ddc26675c5bd12d7ceb1bd5729590f6c110a5`) with sidecar SHA-256 `732c0f81a10af766318d73b864cef45db02cc222b0f30704e8d785ba9ef07efe`. Immutable-ID readback, `unzip -t`, reconstruction of all 486 blobs, and four zero credential/Git/environment audit counters passed; both objects are owner-only and `shared:false`, active direct-child inventory moved `143 → 145`, and trash remained `0 → 0`.
- Before the 2026-09-26 backup, 64 direct backup ZIPs and seven `Plans/` records were found in Drive trash. All 71 confirmed AzaLens objects were restored to their original parents without deletion, relocation or sharing changes. Active counts moved from 61 to 125 direct and 68 to 139 recursive; in-scope trash moved from 71 to zero. The later canonical backup produced the verified active deltas 125 to 127 direct and 139 to 141 recursive, with trash remaining zero and no original immutable ID missing or changed.
- Available metadata/activity evidence did not identify who or what caused the mass trashing; storage usage did not prove a quota-cleanup explanation. Do not infer one.
- Four legacy archives have no sidecars and therefore are **not fully verified backups**: `AzaLens_Backup_2026-08-01_ca61241.zip`, `AzaLens_2026-07-31_4f80c13.zip`, `AzaLens_Phase0_Production_2122bdd_2026-07-31.zip`, and `AzaLens-2026-07-30.zip`.

## Review artifacts and pinning rules

- Personal Risk reviewer ZIP SHA-256: `04d3ad3a2463f1946d8b4ade553e62e93e5eaf6b5aee360dfcb969f5d525f6be`. It is the final reviewer bundle for the reviewed 14-path Personal Risk Checkpoint A state. It predates the ClosedDemoGate correction and this roadmap refresh, remains a historical anchor for those exact 14 paths, and is not the final merge artifact for the expanded tree.
- Reviewed 15-path complete patch: 98,878 bytes; SHA-256 `d03195a793d8df848d80117a232f141c2b4b4291a5cd61b442ab5a24fce173c5`. It covers the 14 Personal Risk paths plus the ClosedDemoGate test correction. It predates this roadmap change and becomes a historical pre-roadmap-update anchor once this file changes.
- Reviewed initial 16-path roadmap patch: SHA-256 `22d3cae94db85d187f3a5b42808536dbc0c59f663110ea7e796173e7f242f739`. Together with the independently reviewed roadmap bytes at SHA-256 `f2b70dd19ffcc1770919653c13983b4fdc73be3df8aa252279f9fe99cfa09055`, this is time-bound historical review evidence that predates the present status reconciliation; neither is the final current patch or roadmap hash.
- A fresh final patch/artifact must be pinned after every authorized correction. The exact commit proposed for PR must be pinned again.
- Do not store individual mutable pre-merge source hashes as permanent roadmap truth. Per-file and patch hashes belong in time-bound evidence and the PR description.
- Final current roadmap and complete-patch hashes live in the standalone evidence manifest and checkpoint review report, and later in the PR description pinned to the commit; they are intentionally not embedded here.

## Visual state

- C1 is **DONE** for exactly eight independently reviewed candidate states: day/night desktop complete pages, day/night mobile top viewports, day/night mobile Current basis state viewports, and desktop/mobile equity confirmations. These candidates were reviewed for layout and geometry; they are not accepted baselines.
- C1 review evidence is pinned by ZIP SHA-256 `e32c00c640d98955c8dc8b9f4823e8d842a948bd6c531e93d1262144ab486d19` and reviewed source SHA-256 `e724384b50e2a82fbfe48e88bb5656756737f4be423145a04775996e47573205`.
- C2 is **DEFERRED — separate visual-baseline slice required**: macOS candidate bytes and the Playwright comparator differ; mobile capture scale and resolved snapshot filenames were incompatible; and CI-native candidate generation requires a separate workflow and review. The failed first-attempt Linux visual run remains historical evidence and is not represented as a pass.
- Accepted visual wiring remains exactly 24/24. A future visual slice may reuse the researched CI-native candidate plan, but it must obtain and review new CI-produced bytes before accepting any Personal Risk baseline.
- The candidate collection guard is corrected locally: excluded candidate tests can be imported without candidate configuration, while each candidate test still fails closed inside its test body unless a validated `/private/tmp/` output directory is supplied.
- Local Docker visual evidence remains non-canonical: the original run stopped at collection with 0/24; the corrected run reached 22/24 but three independent tests each timed out after 45 seconds under extreme slowness; and the latest positive candidate run wrote one review-only PNG before the day-desktop candidate timed out on `main`, after which the container was deliberately stopped and returned exit 137. Exit 137 is not evidence of an out-of-memory kill.
- The retained 22/24 failure showed the landing heading rendered before its locator wait reported a closed page/context/browser. That contradiction leaves the landing-timeout root cause unresolved; it is neither a proven product regression nor a proven environmental flake.
- Read-only GitHub evidence shows the pinned-base native Reliability Gates visual and proof steps succeeded, but the exact-base job log was not downloaded after approval to access it was rejected. A green conclusion is not substituted for the unavailable reporter line.
- Mobile top evidence is a real 390×664 viewport at scroll `(0,0)`; mobile basis evidence is the same real viewport normally scrolled so the complete Current basis state card is unobstructed between the production fixed header and navigation.
- **Lesson:** DOM containment is not capture containment. Stretched page captures, CSS-expanded confirmation captures, and tall-main locator captures with stitched fixed UI are rejected evidence and prohibited as baselines.
- **Lesson:** Playwright imports excluded specs before grep filtering, so candidate-only configuration must be validated inside the selected test body rather than at module scope. A locator failure reporting a closed session can coexist with a target that visibly rendered; preserve traces and surrounding errors before assigning causality.
- **Lesson:** an inverse grep includes every test whose title lacks the excluded tag. Ordinary browser selection must explicitly exclude both `@visual` and `@candidate`; candidate-only tests are not excluded merely because they live in a visual-spec file.

## Reliability status

### ClosedDemoGate

- Original classification: confirmed test synchronization defect; a production defect was not established.
- Cause: manually invoked mocked auth callbacks occurred outside awaited React `act`, with insufficient reset of hoisted callback/mock state.
- Vitest has zero retries, so the defect could fail the first frontend CI gate.
- The test-only correction is complete and independently reviewed. Production `ClosedDemoGate.tsx` remains byte-identical.
- The mutation check failed for the intended reason, then the restored production implementation passed.
- Twenty isolated executions and three complete 409/409 frontend suites passed on their first executions.

### Mobile pending recovery

- Classification: **D — INCONCLUSIVE**. The item remains **OPEN**.
- Original failure artifacts were overwritten before inspection. The exact two-worker matrix and ten additional two-worker repetitions subsequently passed; these reruns do not erase the original failure.
- No scripted preview-generation invalidation occurs after Retry. Current evidence justifies neither a product correction nor a test correction.
- CI uses one Playwright worker and one configured framework retry.
- A second occurrence requires evidence preservation and instrumentation before any rerun. Never rerun merely to manufacture green output.
- **NOT IMPLEMENTED — REQUIRES SEPARATE REVIEWED SCOPE:** retain Personal Risk Playwright failure traces, screenshots, error context, request/response evidence, console/page errors, and final DOM locally and in CI before reruns can overwrite them.

### Local Docker visual tooling

- Classification: **OPEN — operationally unreliable for canonical visual proof on this host**.
- The collection-time candidate-directory defect is corrected locally and independently reviewed; it is distinct from the subsequent runtime timeouts.
- The retained corrected visual run executed 22 of 24 expected comparisons, then recorded three independent 45-second test timeouts under severe container slowness. The later tests did not merely inherit a deliberately closed shared session.
- A subsequent positive candidate run wrote one review-only PNG, then the day-desktop candidate timed out even against pinned `main`; the container was deliberately stopped, producing exit 137. No OOM cause was established.
- Do not erase these failures by local rerun. The next canonical checkpoint is the first native CI run for the exact committed feature tree, with 24/24 wiring unchanged and snapshot updates disabled.

### PR #71, PR #72, PR #74, PR #75 and PR #76 release record

- PR #71's first run `35976581438` on `6248a376452e78b0531cf37981a2f822518c9d6d` remains a genuine failure. The corrected-head run `35979740951`, attempt 1, passed all five jobs, and the first main run `35980677862`, attempt 1, emitted `VISUAL_COMPARISON_PROOF=exact-set:24/24`.
- PR #71 merged as `6e6ae248fe6e7a63f1f95a7319816e3c8d7c29c4`; its production frontend release and exact-commit private backup were verified.
- PR #72 corrected the prospective cost schedule through forward Migration 009 and matching application code. It merged as `526e1c4f4d2f3f2b2e7f468bedcf80b2c0d60fb8`; Migration 009 is applied once and the matching frontend/backend release is live.
- PR #74's original run `36270527058`, attempt 1, remains a genuine failure caused by the database job's missing frontend runner. The reviewed in-process Option 1 correction passed corrected-head run `36272559294`, attempt 1; PR #74 then merged as `4c74803216b4cd37fd50b44dffe9200323969582`, tree `7f9153b3d270e88fca91753ea9fb64b422c7111c`, and first-main run `36272831375`, attempt 1, passed all five jobs. Matching Vercel and Render deployments and the exact-merge private backup were verified.
- PR #75 merged the roadmap-only reconciliation as `bcaae1f436d404dcf53eeb8719bd576aaf57e9af`. Its first-main run `36302337862`, attempt 1, genuinely failed when the Personal Risk test clicked **Create policy version** while it was disabled during status loading; that run remains failed and was not rerun.
- PR #76 corrected only the affected Personal Risk test synchronization. Corrected-head PR run `36304706626`, attempt 1, and first-main run `36304981261`, attempt 1, passed all five jobs; true merge `d7c3900cd4126df6009422a9e81d9ebc6099f4dc` retained the reviewed one-file scope. Release Health reported `backendChanged=false`, Render stayed healthy on `4c74803216b4cd37fd50b44dffe9200323969582`, Vercel completed its production result, and the exact merge's private backup moved active inventory `131 → 133` with trash `0 → 0`.
- C2 Personal Risk baseline acceptance remains deferred. Accepted visual wiring remains 24/24.

## Current proof boundary

The Personal Risk bootstrap is **CONTROLLED LIVE-WRITE VERIFIED** and independently re-read through authenticated owner-scoped production access. Exactly one policy, schedule, snapshot, daily basis and weekly basis exist with the reviewed values recorded above. The separate, unwired `SHADOW_PREVIEW` matches `_risk008_calculate` for 16 synthetic fixtures and 192 numeric-field comparisons, including negative half-unit rounding. It does not prove rejection-code or decision-precedence parity, runtime risk-flow integration, a live position write, or trade execution. No position, trade, risk evaluation or outcome-ledger row exists, and Core must not yet be described as `PRODUCTION-TRUSTED`, shadow-trading verified or real-money validated.

Migration 010 is applied exactly once and independently verified in the production catalog; its generic-RPC bypass is closed in production. PR #82 merged and deployed the application-facing backend routes, service, owner-scoped lifecycle readback, key-preserving recovery states and stable lifecycle error mapping without a production lifecycle call or position write.

PR #85 merged and deployed the frontend lifecycle UI behind `ClosedDemoGate`. Its proof is **delivery and
local behaviour only**: first-attempt PR and exact-merge CI, a measured 5.358:1 contrast with zero axe
violations on the tested page, and a Vercel-served chunk returning HTTP 200. An SPA-route HTTP 200 proves
shell delivery, not that an authenticated owner rendered the page. **No production lifecycle RPC, position
write or Saxo order occurred during these releases**, the opening and increase application paths are
unbuilt, and the UI acts only on a position UUID the owner supplies. The risk-reducing UI is therefore
unexercised against real data. This roadmap change performed no production read and asserts no current
production row count. The new-risk opening path is unbuilt.

No overall completion percentage is authoritative. Any preserved historical percentage is a **SUPERSEDED PLANNING ESTIMATE — NOT A VERIFIED PROGRESS MEASURE**.

## Immediate next sequence

Every step has exactly one live status. A future step is not done because its fixture or plan exists.

| Step | Status | Action and completion evidence |
|---|---|---|
| A | **DONE** | Independently reviewed roadmap bytes (`f2b70dd19ffcc1770919653c13983b4fdc73be3df8aa252279f9fe99cfa09055`), reviewed pre-roadmap-update 15-path patch (`d03195a793d8df848d80117a232f141c2b4b4291a5cd61b442ab5a24fce173c5`), and reviewed initial 16-path roadmap patch (`22d3cae94db85d187f3a5b42808536dbc0c59f663110ea7e796173e7f242f739`) are time-bound historical review evidence that predates this status edit, not final current hashes. |
| B | **DONE — fresh 16-path patch and standalone evidence manifest produced and independently reviewable outside the repository** | Final current identities are recorded in the standalone evidence manifest and checkpoint review report, not self-referentially in this roadmap. |
| C | **DEFERRED — separate visual-baseline slice required** | The eight C1 candidates remain reviewed layout/geometry evidence, not accepted baselines. Accepted wiring remains 24/24; new CI-produced bytes require separate review before any future acceptance. |
| D | **DONE** | PR #71 first CI failure is preserved; the corrected-head first run and exact-merge main run passed with native 24/24 proof. |
| E | **DONE** | PR #71 and its corrected first-attempt CI evidence were reviewed without manually rerunning the failed earlier head. |
| F | **DONE** | Playwright retry/skip evidence was reported without recasting the original failed run as green. |
| G | **DONE** | PR #71 and PR #72 were true-merge verified, culminating in canonical merge `526e1c4f4d2f3f2b2e7f468bedcf80b2c0d60fb8`. |
| H | **DONE** | Matching production frontend and backend deployments for PR #72 were verified; backend health identifies the canonical merge. |
| I | **DONE** | The canonical merge was archived and immutable-ID read back from the private Drive folder with exact bytes/tree and owner-only permissions. |
| J | **DONE** | Authenticated Personal Risk status was read before writes and showed the expected empty state. |
| K | **DONE** | Ownership, origin, schema and empty-state gates matched before controlled writes. |
| L | **DONE** | Immutable policy version 1 was created under separate authorization. |
| M | **DONE** | Policy version 1 was refreshed and re-read with exact approved values. |
| N | **DONE** | `Saxo Bank` Classic cost-schedule version 1 was created after Migration 009 and matching-code deployment. |
| O | **DONE** | Authenticated audit verified the schedule and exactly four reviewed components, including FINRA effective `2026-01-01`. |
| P | **DONE** | Broker-confirmed total account equity `2784.95000000 USD` was used; cash and buying power were not substituted. |
| Q | **DONE** | The snapshot and resulting New York bases were previewed before the controlled write. |
| R | **DONE** | One equity snapshot was created under deliberate confirmation. |
| S | **DONE** | One daily and one weekly basis were authenticated-owner re-read with exact values, sequence and snapshot relationship. |
| T | **DONE** | Evidence is recorded without owner UUIDs, row IDs, credentials, tokens or personal-document contents. |
| U | **DONE** | PR #74 released the unwired arithmetic-only `SHADOW_PREVIEW`; both first-attempt passing CI runs proved 16 fixtures and 192 numeric-field comparisons, while the original missing-runner failure remains preserved. |
| V | **DONE** | PR #75's documentation-only merge and genuine failed first-main run remain recorded; PR #76's reviewed one-file readiness correction passed its first PR and first-main attempts, retained `backendChanged=false`, and was privately backed up. |
| W | **DONE** | PR #78 / merge `271ff3f3c34e5d25dd2357068901be47cf4c4845` proves 37 actual Migration 008 RPC cases: database rejection precedence, exit/stop-tightening independence and separate-connection rollback. Runtime wiring, shadow trading, live position writes and Saxo execution remain unproven. |

Migration 010 and PR A are deliberately recorded outside the lettered sequence: V and W retain their existing meanings and are not reassigned. Migration 010 is applied and independently verified in production; PR #82 completes the backend application increment.

**PR #85 is likewise recorded outside the lettered sequence.** No letter is created, reused or reassigned
for it: V and W keep exactly the meanings they already had, and the lettered sequence remains closed at W.
PR #85's evidence lives in its own section above and in the open-items register. The lifecycle UI that step
W's era described as "the single next implementation task" is now merged and deployed; that earlier wording
stays in place as historical evidence of what was true when written.

### Recommended order after PR #85

Neither of the following is assigned a sequence letter, and neither renames or reorders an existing step.

These are two different categories of work, which is why the ordering below and the "next Core
implementation increment" designation above are consistent rather than contradictory: item 1 is a
**shipped-code defect fix** and item 2 is the **next Core implementation increment**. Ordering the defect
fix first does not make it a Core increment, and does not displace the Core increment.

1. **First — the shipped `SettingsPage.tsx:144` accessibility repair, a shipped-code defect fix, not a Core
   increment.** It is small and it is
   already-shipped user-facing code carrying the same observed class pattern whose anchor form measured
   3.33:1 **on `/settings/personal-risk`** in run `36622052421`. `/settings` itself has never been measured,
   so the repair must begin by adding an axe check covering `/settings` and then act on what that check
   actually reports. Doing this first also means the new-risk increment is built on a page set whose
   accessibility is genuinely tested rather than assumed.
2. **Second — the new-risk position-opening path, the next Core implementation increment,** through
   `create_risk_enforced_outcome_position`. It is
   materially larger, it creates risk rather than reducing it, and it carries undetermined route, ACL and
   confirmation questions that need separate review and independent production catalog evidence.

The order is a recommendation for review, not an authorization to start either one.

## Maintenance rule

This roadmap is updated as work completes, not weeks afterward.

Every item in the immediate next sequence and open-items register carries a status. When a step is completed and independently reviewed, its status is updated in this file during the same working session, with the evidence proving completion—for example, an approved patch hash, commit SHA, CI run, merge SHA/tree, deployment commit, authenticated live-read result, or controlled live-write result.

A step is never marked complete from a plan, intention, unreviewed local change, or successful rerun that hides an earlier failure.

Tests must await enablement before interacting with a gated control. A control's presence in the DOM is not readiness evidence. This standing rule applies to both the earlier `ClosedDemoGate` synchronization race and the Personal Risk **Create policy version** race: find the control, assert or await that it is enabled, then interact and await the resulting state.

If a step is abandoned, blocked, or superseded, its status and reason are recorded.

Any model or person continuing AzaLens must update this roadmap before declaring a checkpoint closed.

The standard merge/checkpoint checklist is:

- pinned SHAs and tree;
- authorized path scope;
- first workflow-run CI evidence;
- disclosed framework-internal retries/flakes;
- true merge verification;
- deployment verification;
- for every `backendChanged=true` release, saved live/ready captures within the same release procedure: a pre-merge capture and a post-deployment capture, each naming the observed commit; the post-merge Release Health workflow's sample is post-deployment evidence only;
- authenticated Drive backup;
- Drive backup inventory proof that active direct-child count increases by exactly two, in-scope trashed count is zero before and after, and the new ZIP and sidecar pass the established private immutable-ID readback and integrity checks; a count that includes trashed objects is never proof of this invariant;
- **Roadmap updated and evidence status reconciled**.

## Readiness before Fable/Astra redesign

Fable previously rated the interface approximately 6.4/10 and proposed a path toward 9.9/10. The latter is a design target, not a guaranteed or verified future score. The design handoff must not be triggered by a completion percentage.

Before the full Fable/Astra handoff: obtain authenticated live-read and controlled live-write verification; verify policy/schedule/snapshot/basis persistence; safely exercise recovery behavior; complete remaining Core slices; perform product-wide truthfulness, functional, responsive, and accessibility review; conduct sufficient shadow trading to expose workflow weaknesses; and address material findings. The redesign must inspect a functioning product rather than a fixture-only demo.

## Real-money readiness

- Shadow trading precedes real-money trust.
- Small controlled real positions, if later authorized, come only after shadow-trading evidence plus legal, Shariah, and risk readiness.
- Cash, buying power, position market value, and cost basis must never be entered as total account equity. Only broker-confirmed total account equity qualifies.
- **Synthetic illustration only—not personal account advice and not a new configured product rule:** at 0.50% planned loss per position and a 5% stop, a $1,000 position requires approximately $10,000 of risk-basis equity before costs.
- Do not record actual or historical balances, brokerage figures, or private screenshots here.

## Separate Gapper/Momentum Room

This remains a separate later module/model. It must not begin merely because Core appears visually polished. Start only after Core reaches stable beta and has been exercised through shadow trading and any authorized controlled real use. It may share authentication, infrastructure, design primitives, and selected market-data plumbing, but it requires its own real-time premarket/intraday pipeline; gap scanner/ranking; relative-volume and momentum features; session/halt handling; liquidity/spread protections; intraday risk framework; APIs/caching; monitoring; and test/evidence strategy. It must not silently inherit Core risk assumptions.

## Reviewer and model workflow

- Codex implements and produces raw evidence.
- Claude provides an independent second review.
- Sol independently reviews implementation evidence and Claude's verdict.
- Fable/Astra performs the later full-product design audit.
- No verdict is followed blindly; disagreements are resolved against source, tests, artifacts, and repository identity.
- Codex prompts remain one-click copyable.
- Stop on identity/scope mismatch rather than finding a workaround.
- After a reviewed slice, any newly found issue must be reported and separately authorized before implementation.

## Current open-items register

| Item | Status | Evidence boundary / next action |
|---|---|---|
| Repin/review ClosedDemoGate correction and roadmap | **DONE** | Time-bound historical review anchors are recorded; the fresh final 16-path patch and standalone evidence manifest are independently reviewable outside the repository. Final current hashes live in that manifest and the checkpoint review report. |
| Mobile pending recovery | **BLOCKED — original causal artifacts were overwritten** | Classification D — INCONCLUSIVE; preserve complete evidence on recurrence before rerun. |
| Durable Playwright artifact retention | **NOT STARTED** | Requires separately reviewed implementation scope. |
| Eight-baseline Personal Risk acceptance | **DEFERRED — separate visual-baseline slice required** | C1 candidates are reviewed and pinned but are not accepted baselines. Preserve 24/24 until new CI-produced bytes receive separate review. |
| Slice 2 commit/PR/merge/deployment/backup | **DONE** | PR #71 and PR #72 are merged and deployed; canonical merge `526e1c4f4d2f3f2b2e7f468bedcf80b2c0d60fb8` has an exact private Drive backup. Preserve the genuine failed first PR #71 run alongside later passing evidence. |
| First authenticated read-only Personal Risk checkpoint | **DONE** | Live owner-scoped status and the subsequent read-only database audit match the deployed schema and expected state. |
| First controlled policy/schedule/equity sequence | **DONE** | Exact version-1 policy/schedule and snapshot/bases are live and authenticated-owner re-read; no risk or ledger row was created. |
| Roadmap production-evidence reconciliation | **DONE** | The reviewed roadmap-only reconciliation completed its PR #73 release on 2026-09-26. |
| Shadow arithmetic parity | **DONE — ARITHMETIC ONLY** | PR #74 proves the unwired `SHADOW_PREVIEW` matches `_risk008_calculate` on 16 synthetic fixtures and 192 numeric-field comparisons, including negative half-unit rounding. It does not prove lifecycle decisions or runtime integration. |
| PR #75/#76 roadmap and test readiness | **DONE** | PR #75's first-main run `36302337862` remains failed; PR #76 corrected only the gated-control test synchronization, passed first-attempt PR/main CI, retained the unchanged healthy Render deployment, and has a verified private backup. |
| Decision parity | **DONE — DATABASE DECISION AND RECORDING ONLY** | PR #78 / merge `271ff3f3c34e5d25dd2357068901be47cf4c4845` proves 37 actual-RPC cases, precedence, exit/stop-tightening independence and separate-connection rollback. Runtime wiring, shadow trading, live position writes and Saxo execution remain unproven. |
| Decision-parity marker derivation | **NON-BLOCKING MAINTENANCE** | The SQL prints a literal `37` rather than deriving the displayed marker from `completed`. The preceding `completed<>37` exception guards its correctness today; no SQL change belongs in this documentation slice. |
| Migration 010 direction-guard infrastructure | **APPLIED ONCE AND INDEPENDENTLY PRODUCTION-VERIFIED** | The dry run listed only `20260928120000_010_direction_guarded_protective_stops`; remote history contains `20260928120000` exactly once. Catalog evidence proves the reviewed generic/tightening/loosening ACL matrix, no `PUBLIC` entries, `postgres` ownership, `SECURITY DEFINER`, empty `search_path`, and unchanged generic OID `50623`. **The generic-RPC bypass is closed in production.** |
| Supabase Data API 30 October 2026 grant report | **PENDING RE-VERIFICATION** | Verify the reported date and primary Supabase source, then verify effective catalog privileges including `PUBLIC` inheritance. Do not treat a platform change or route absence as function security. |
| Application-facing PR A backend | **DONE — MERGED AND DEPLOYED, NO PRODUCTION LIFECYCLE WRITE** | PR #82 provides owner-only broker-confirmed partial/final exits and stop tightening, routes/service, owner-scoped readback, distinct commit-known and commit-unknown recovery, stable lifecycle codes, key-preserving recovery and negative independence tests. It called no production lifecycle RPC, wrote no position and executed no Saxo order. |
| Personal Risk lifecycle UI | **DONE — MERGED AND DEPLOYED BEHIND `ClosedDemoGate`, UNEXERCISED** | PR #85 / merge `1ffdbd87c0d89437dad5a6a3a32c5dfa4d94cdc3`. First-attempt PR run `36622052421` remains a genuine accessibility failure and was never rerun; corrective commit `e26c23fc…` and first-attempt runs `36631347755` and `36632008513` passed. No production lifecycle RPC or position write occurred during these releases; the opening and increase application paths are unbuilt; and the UI acts only on an owner-supplied position UUID. Delivery and local behaviour are proven; authenticated owner rendering and any lifecycle action are not. No current production row count is asserted here. |
| New-risk position opening | **NEXT — CORE IMPLEMENTATION INCREMENT** | Build the separately reviewed backend path for the existing `create_risk_enforced_outcome_position` RPC before increase. No route or service references it today and no repository migration grants it to `authenticated`. Route path, request contract, any ACL change and the create-risk confirmation semantics are all undetermined and require separate review plus independent production catalog evidence. |
| Recovery does not verify a tightening's evidence class | **OPEN — BACKEND CHARACTERISTIC, NOT FIXED BY PR #85** | `stopResult(row, replayed, expectedEvidenceClass = null)` asserts the class only when that argument is truthy. The mutation path supplies it, but `recover()` forwards only `{...input, recovery: true}` and never sets it, so a `COMMITTED` recovery **reports** the stored `evidenceClass` without **verifying** it against the submitted one. PR #85's UI labels a recovered class as reported rather than verified. A separately reviewed backend change is required; do not describe this as fixed. |
| Shipped `SettingsPage.tsx:144` anchor contrast pattern | **OPEN — OBSERVED IDENTICAL CSS PATTERN, UNTESTED ON `/settings`, NOT FIXED BY PR #85** | `frontend/src/pages/SettingsPage.tsx:144` ships an `<a>` carrying the **same observed `bg-brand` + `text-white` class pattern** whose anchor form measured 3.33:1 on `/settings/personal-risk` in run `36622052421`. **No contrast measurement has been taken on `/settings` itself**, because axe runs only in `analysis.spec.ts` and `personal-risk.spec.ts` and never on that route; the pattern match is a code observation, not a measured `/settings` result, and this item must not be reported as a confirmed `/settings` violation until that page is tested. The scoped repair is: add an axe check covering `/settings`, observe what it actually reports, and repair accordingly. It is recommended **first** in the order above as a **shipped-code defect fix**; it is **not a Core implementation increment** and does not displace the next Core increment. PR #85 fixed only its own new control and deliberately left this file untouched. |
| Release-health same-procedure before/after evidence | **REQUIRED FOR FUTURE `backendChanged=true` RELEASES** | PR #82 satisfied the rule with saved pre-merge live/ready captures at `08:05:24` observing `c664b387615c1cf60d0cb7119352251a421a5a60` and post-deployment captures at `08:11:03` observing `7d3866755e5e2ad28f65d632e4c21e51fb79ef8e`. Use the same release procedure, not the post-merge Release Health workflow alone. |
| Remaining Core slices | **SEPARATE SCOPE REQUIRED AFTER THE UI** | Preserve risk-reducing-path independence. Do not create live trade/risk rows or imply Saxo execution prematurely. |
| Shadow trading | **NOT STARTED** | Requires functioning, verified Core workflows. |
| Fable/Astra redesign | **BLOCKED — remaining Core and shadow-trading evidence absent** | Live Personal Risk bootstrap read/write evidence now exists; do not trigger redesign from that bootstrap milestone or from a percentage. |
| Beta readiness | **BLOCKED — Core and non-code gates remain** | Requires product-wide functional, responsive, accessibility, truthfulness, and operational review. |
| Legal, Shariah, regulatory/licensing, monitoring, and support readiness | **REQUIRES REVALIDATION** | Preserve the historical tracks below; establish current evidence before beta or money use. |
| Later Gapper/Momentum Room | **BLOCKED — Core has not reached stable exercised beta** | Separate model and evidence program required. |

### Older-item disposition

This is a narrow reconciliation against locally available repository evidence, not a new broad technical audit.

| Older item | Disposition | Evidence |
|---|---|---|
| Unmapped backend errors returning 503 without a logged code | **REQUIRES REVALIDATION** | Current routes include generic 503 mappings and many error logs, but this checkpoint did not reconstruct every error path. Preserve as possible debt, not a confirmed defect. |
| Backend Shariah-path suites not gating CI | **CONFIRMED OPEN** | Several named package scripts remain outside `backend/tests/runCiSuite.js`; current registration is incomplete for the historical list. |
| Workflow ↔ `package.json` parity | **REQUIRES REVALIDATION** | Both are present and extensively wired, but no locally identified exhaustive parity assertion closes the historical concern. |
| Migration 007 `CONFLICTING_AUTHORITIES` design | **REQUIRES REVALIDATION** | The exact design label is not present in current Migration 007 or focused repository search; preserve the decision question without asserting a defect. |
| Production-cap behavioral proof | **COMPLETED — CI-wired database invariant suites** | Workflow runs watchlist cap plus portfolio cap/mutation suites; package scripts identify their focused tests. This is repository/CI coverage, not a fresh production write. |
| Local `.env` provider-pair mismatch | **REQUIRES REVALIDATION** | Local secrets/configuration were intentionally not inspected or printed in this documentation checkpoint. |

## Change log

### 2026-09-30

- Recorded PR #85 / true merge `1ffdbd87c0d89437dad5a6a3a32c5dfa4d94cdc3`, tree
  `42e53d0a6a2add9b57b878a765e42e9e85a7a00a`, ordered parents `5975cbcf40e4273f8be06fef449a25cc0bba431d`
  and `e26c23fcae6734da27465877497afb9ff256d293`, with its 128,772-byte first-parent patch SHA-256
  `6858a2c49e44f19efe7ceec69f15eeff24d36d744ad083688374285a1afaa7ea` matching the frozen reviewed patch
  byte-for-byte and an empty second-parent diff.
- Preserved PR run `36622052421`, attempt 1, head `275100a76a6ae375d434ab01dbb84e863ebe24c3` as a genuine
  accessibility failure at 3.33:1, never rerun, with its cascading visual-proof steps explained; recorded
  corrective commit `e26c23fc…`, the measured 5.358:1 contrast, zero axe violations on the tested page,
  Enter/Space navigation, and first-attempt runs `36631347755` and `36632008513` with the exact-merge run's
  own proof lines.
- Recorded Release Health `36632546515`, attempt 1: `backendChanged=false`, backend `deployment.commit`
  unchanged at `7d3866755e5e2ad28f65d632e4c21e51fb79ef8e`, live/ready HTTP 200 with `ready=true`, and the
  Vercel-served `PersonalRiskLifecyclePage-BPNhVPfh.js` chunk at HTTP 200. Stated that an SPA-route HTTP 200
  proves shell delivery only, not authenticated owner rendering or any lifecycle action.
- Recorded the exact-merge private backup by immutable ID with Drive-read hashes, sidecar match,
  `unzip -t`, 494/494 path and blob reconstruction including three executable modes, four zero audit
  counters, both objects `shared:false`, active direct children `149 → 151`, trash `0 → 0`, and no lost
  pre-existing ID.
- Corrected the stale "Current repository position" block from `7d386675…` to the PR #85 merge and its
  ordered parents, retaining the superseded statement as labelled historical evidence rather than deleting
  it. The superseded single-next-task wording — build the lifecycle UI — is likewise retained here.
- Marked the risk-reducing UI built and deployed behind `ClosedDemoGate` and stated the practical boundary
  without asserting a current production row count: no production lifecycle RPC or position write occurred
  during the PR #82 or PR #85 releases; `create_risk_enforced_outcome_position` and
  `increase_risk_enforced_position` have no backend route or service and no repository grant to
  `authenticated`; and the UI acts only on an owner-supplied position UUID. The 2026-09-26 zero-row audit is
  cited as a dated observation, since this change performed no production read. Named the new-risk opening
  path as the next increment while leaving its route, ACL and confirmation semantics undetermined pending
  separate review.
- Added two open items: recovery reports but does not verify a tightening's evidence class because
  `recover()` never passes `expectedEvidenceClass`; and `frontend/src/pages/SettingsPage.tsx:144` ships the
  same **observed** `bg-brand`/`text-white` anchor class pattern outside axe's `/settings` coverage. The
  latter is recorded as an untested pattern match, **not** a measured `/settings` violation, and its scoped
  repair begins by adding an axe check on `/settings`. Neither is claimed as fixed by PR #85.
- Recommended doing the small shipped accessibility repair before the new-risk increment, without creating
  or reassigning any sequence letter; V and W retain their existing meanings and the lettered sequence
  remains closed at W.

### 2026-09-29

- Recorded Migration 010's exactly-once production application and independent migration-history/catalog verification, including the three-function ACL matrix, unchanged generic OID `50623`, and the first evidence-backed conclusion that the production generic-RPC bypass is closed. The post-push catalog-cache warning was not retried.
- Recorded PR #82 / true merge `7d3866755e5e2ad28f65d632e4c21e51fb79ef8e`, its frozen 41,075-byte first-parent patch, first-attempt PR/exact-merge CI, `backendChanged=true` release identity, same-procedure pre/post health captures and verified private backup.
- Marked the application-facing backend complete and deployed without a production lifecycle RPC, position write or Saxo order. Set the lifecycle UI as the single next implementation task.
- Corrected the health-evidence rule to require pre-merge and post-deployment captures within the same release procedure; Release Health's own post-merge sample is a post-deployment observation only.

### 2026-09-28

- Recorded documentation merge `3cb47a5f4569a57462667afcc7d28c2ef927ab0f` and its verified private backup, including ZIP and sidecar hashes, active direct-child inventory `137 → 139`, and trash `0 → 0`.
- Recorded PR #80's Migration 010 direction-guard infrastructure, true merge `c664b387615c1cf60d0cb7119352251a421a5a60`, tree `132901c8b61c62468fb2b64e83119e246faa7f5c`, first-attempt PR run `36401404348` and exact-merge push run `36401843207`, and immutable-ID Drive backup evidence. The Drive-read archive passed `unzip -t`; all four credential/Git/environment audit counts were zero.
- Preserved the production boundary: **The production generic-RPC ACL is unverified.** Production migration application requires separate authorization and read-only catalog proof; the application-facing PR A remains unbuilt.
- Recorded the missing same-run pre-deployment health sample and added the mandatory same-release-run before/after live/ready evidence rule for future `backendChanged=true` releases, with observed commits named in both captures.
- Added the reported 30 October 2026 Supabase Data API grant change as pending re-verification rather than evidence that the platform secures functions.
- Marked step W decision parity DONE for PR #78 and true merge `271ff3f3c34e5d25dd2357068901be47cf4c4845`: 37 actual Migration 008 RPC cases, separate-connection rollback proof, first-attempt PR/main CI, matching backend deployment identity, successful Vercel production result and verified owner-only private backup. Opened the next remaining Core slice without treating database recording as runtime wiring, shadow trading, live writes or Saxo execution.

### 2026-09-27

- Recorded PR #75's docs-only true merge `bcaae1f436d404dcf53eeb8719bd576aaf57e9af` and preserved first-main run `36302337862`, attempt 1, as failed: the Personal Risk test clicked **Create policy version** while the gated control was disabled during status loading.
- Recorded PR #76's one-file test-readiness correction, true merge `d7c3900cd4126df6009422a9e81d9ebc6099f4dc`, first-attempt passing PR run `36304706626` and main run `36304981261`, `backendChanged=false`, unchanged healthy Render commit, completed Vercel result, and verified private backup with active inventory `131 → 133` and trash `0 → 0`.
- Added the standing test rule to await enablement before interacting with any gated control, covering the `ClosedDemoGate` and Personal Risk synchronization races.
- Recorded PR #74's genuine first-attempt failure `36270527058`: the database job had backend-only dependencies while the original parity harness attempted to spawn the absent frontend Vitest runner. The failure was preserved and was not rerun.
- Recorded the reviewed Option 1 correction, corrected-head PR run `36272559294`, first-main run `36272831375`, true merge `4c74803216b4cd37fd50b44dffe9200323969582`, tree `7f9153b3d270e88fca91753ea9fb64b422c7111c`, matching Vercel/Render deployment, and exact private backup with active direct-child inventory `129 → 131` and trash `0 → 0`.
- Fixed the proof boundary: the unwired `SHADOW_PREVIEW` matches `_risk008_calculate` across 16 synthetic fixtures and 192 numeric-field comparisons, including negative half-unit rounding; rejection-code/precedence parity, runtime integration, live position writes and trade execution remain unproved.
- Set the single next task to read-only decision-parity scoping through the actual three new-risk RPCs in disposable transactions guaranteed to roll back, including overlapping rejection cases and exit/stop-tightening independence. No implementation, production access or live write is authorized by this documentation edit.

### 2026-09-26

- Reconciled the canonical repository position to PR #72 merge `526e1c4f4d2f3f2b2e7f468bedcf80b2c0d60fb8`, tree `f63f8a202015dd5ef08195b0c7ccc9c405d71efc`, and recorded that Migration 009 is applied exactly once with matching production frontend/backend code.
- Recorded the authenticated owner-scoped, read-only production audit: `transaction_read_only=on`; one exact policy v1; one `Saxo Bank` Classic schedule v1 with four reviewed components and FINRA effective `2026-01-01`; one exact equity snapshot; linked daily/weekly bases; complete bootstrap; no pending intent; and zero owner rows across all nine outcome/risk/evaluation tables.
- Recorded the exact private backup of the canonical merge, including archive/sidecar hashes, immutable-ID readback, reconstructed tree and owner-only permissions.
- Recorded the Drive incident and recovery without inventing causality: 64 direct ZIPs plus seven `Plans/` records were restored, expected active inventories were recovered, and trash returned to zero before backup.
- Recorded the four legacy ZIPs without sidecars as unpaired and not fully verified.
- Recorded completion of content review and moved the single next task to scoping the next Core risk-flow slice. No implementation, deployment, database write or new backup is authorized by this edit.

### 2026-09-24

- Closed C1 for the final eight-state Personal Risk visual design using reviewed ZIP SHA-256 `e32c00c640d98955c8dc8b9f4823e8d842a948bd6c531e93d1262144ab486d19` and source SHA-256 `e724384b50e2a82fbfe48e88bb5656756737f4be423145a04775996e47573205`.
- Recorded the truthful capture boundary: complete desktop pages; real mobile top viewports at scroll zero; real mobile basis viewports with the complete card between fixed shell regions; and production-scroll confirmation viewports.
- Recorded the lesson “DOM containment is not capture containment” and permanently rejected stretched mobile pages, CSS-expanded confirmations, and tall-main locator captures with stitched fixed UI.
- Deferred C2 to a separate visual-baseline slice because macOS candidate bytes and the Playwright comparator differ, mobile capture scale and resolved snapshot filenames were incompatible, and CI-native candidate generation requires a separate workflow and review. The failed first-attempt Linux visual run remains historical evidence, not a pass.
- Restored accepted visual wiring to 24/24. The eight reviewed C1 candidates remain layout/geometry evidence rather than accepted baselines; any future visual slice must obtain and review new CI-produced bytes before acceptance.
- Moved the single next task to Slice 2 commit/PR preparation, subject to final verification and independent review. Personal Risk still has no completed authenticated live API read and no live policy, schedule, snapshot, basis, trade, or outcome row.
- Stopped that transition when the first canonical non-writing Linux visual execution failed during test collection: the candidate-only Personal Risk visual spec unconditionally required `AZALENS_PERSONAL_RISK_CANDIDATE_DIR` although `--grep @visual` excluded its tests. No comparison executed; the reporter emitted 0/24. The run was not retried, source was not corrected, and commit/PR preparation remains blocked pending separate authorization.
- Corrected only the candidate collection boundary by moving the same validated `/private/tmp/` output-directory requirement into the two candidate test bodies. Excluded candidate specs now collect without candidate configuration, while selected candidate tests still fail closed.
- Preserved the corrected local Docker visual failure at 22/24: three tests independently exhausted their 45-second timeouts under severe slowness. The landing heading was present even though its locator wait reported a closed page/context/browser, so the root cause remains unresolved rather than labelled a product regression or environmental flake.
- Preserved the later positive candidate failure: one review-only PNG was written, the day-desktop candidate then timed out against pinned `main`, and deliberate container shutdown returned exit 137 without proving an OOM kill.
- Recorded that the pinned-base native Reliability Gates visual and proof steps were green, while the exact reporter line remains unavailable because approval to download the job log was rejected. No green conclusion is treated as a substitute for raw reporter evidence.
- Completed the authorized non-browser checkpoint: the full frontend unit suite reported 32 files and 409 tests passed; lint reported only the pre-existing empty-pattern warning in the candidate spec; production build and CSP validation passed; and `git diff --check` passed. Accepted visual wiring remains 24/24 and no Personal Risk PNG is accepted.
- Advanced Step D only to the exact local-commit checkpoint. The feature PR and first native CI run remain separately unauthorized, and no browser rerun was performed.
- Pushed feature commit `6248a376452e78b0531cf37981a2f822518c9d6d` and opened PR #71 under separate authorization. Its first Reliability Gates run `35976581438`, attempt 1, genuinely failed and was not rerun.
- Recorded the first CI cause: `--grep-invert @visual` selected six screenshot-producing `@candidate` cases across desktop and mobile; each failed under the intentionally unset candidate-directory guard and again on Playwright Retry #1. The visual step was skipped, so no native `exact-set:24/24` evidence exists for that head.
- Corrected only the ordinary browser selector locally to use one quoted inverse-grep regex excluding both `@visual` and `@candidate`. Collection-only proof retains 32 functional/accessibility cases, the unchanged canonical visual command selects 12 visual tests that own 24 comparisons, and the explicitly targeted screenshot-producing candidate selection retains six cases without requiring its directory merely to list.
- Kept C2 deferred, accepted baselines and reporter/workflow wiring at 24/24, and authenticated live Personal Risk verification pending. The correction remains local pending independent review and separate push/CI authorization.
- No current roadmap hash is embedded here.

### 2026-09-23

- Recorded Slice 2 Checkpoint A's local 14-path implementation and corrections, plus its final reviewed Personal Risk bundle.
- Recorded the reliability investigation and the separately reviewed ClosedDemoGate test-only synchronization correction.
- Recorded mutation sensitivity, 20/20 isolated first-pass stability, and three independent 409/409 full frontend passes.
- Corrected the proof boundary: Personal Risk browser evidence is fixture-backed, local, uncommitted, unmerged, and undeployed.
- Additively refreshed this roadmap with evidence states, current pinning, visual status, ordered next actions, maintenance discipline, readiness gates, and a status-bearing open register.
- Marked the former 2026-07-30 immediate sequence and old Parts 1–5 ordering as historical because later merged work superseded their chronology. No durable release record or still-useful Fable rationale was removed.
- Removed the former “Phase 0 — Specialist Readiness” single-task paragraph and its `specialist readiness → crash fix → docs → design → accounts → beta` immediate ordering because subsequent merged authentication, persistence, migration, and risk-foundation work made that ordering factually stale. The specialist, truthfulness, cost-control, legal, and design rationale remains preserved in the historical archive.
- Replaced the old 2026-07-30 baseline/status header because it could misstate local feature work as current canonical behavior; its original audit context remains in the historical note and archive.
- Closed Step A using the independently reviewed roadmap bytes plus the reviewed historical 15-path and initial 16-path patch anchors; these anchors predate this status reconciliation and are not final current hashes.
- Closed Step B by producing a fresh final 16-path patch and standalone evidence manifest outside the repository. Final current hashes live in the manifest and checkpoint review report, and later belong in the commit-pinned PR description.
- Set Step C as the single next decision after independent review of the Step B artifact: explicit acceptance of the six reviewed visual candidates and the 24/24 → 30/30 wiring change. Baseline acceptance remains unauthorized at this checkpoint.

## Historical roadmap archive

Everything below is retained for rationale, chronology, and durable release evidence. Labels such as “do first,” “next,” “planned,” and the `92d483c` baseline describe their historical checkpoint only. They do not override the current state and sequence above.

---

## PART 1 — PHASE 0: SPECIALIST READINESS (historical; originally “do first”)

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

#### Boundaries reconciled on 2026-08-29

- **Derived-output attribution remains ambiguous for purely non-reconstructive
  outputs.** Twelve Data requires attribution wherever its data is displayed
  and permits non-reconstructive derived analytics, but the supplied provider
  correspondence does not expressly waive attribution for an output that shows
  no provider data. Silence is not permission, and B7b makes no broader claim.
- **The closed-demo / internal-use exception remains unanswered.**
- **Halal Terminal's exact attribution wording is now retained below** from
  Yassir's detailed reply received on 11 August 2026 at 12:48 AM; his later
  message refers to it as the line sent on 10 August.
- **Halal Terminal external display is evidenced for Enterprise, not Starter.**
  Starter must not be treated as permission for client-facing redistribution.
- **Mixed-provider surfaces remain blocked** until each displayed provider's
  attribution is rendered under its own verified terms.
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
price after the free period unless cancelled or changed. As of 2026-08-29 the
offer is recorded as offered and **not redeemed**. No commitment to redeem it is
recorded. The reserved redemption code is deliberately not recorded in this
repository.

A later service notice received on 29 August stated that the free-token monthly
reset had landed and the existing key worked normally again, and separately
described Starter as the $19/month option that removes the free-tier monthly
ceiling. That notice corroborates that AzaLens remains on free access and that
the Starter promotion has not been redeemed; it does not change display rights
or authorize a subscription.

The application's internal safety budget stays at 30 while the commercial
entitlement is 2,500. That divergence is a known, deliberate and unchanged state
under this authorization, not an oversight. Commercial entitlement and the
application's internal cost-safety budget are separate controls, and raising one
does not raise the other. No Render value was changed by this pass.

**Finding 4 — Halal Terminal attribution and external-display rights.** Halal
Terminal stated that the attribution line it sent on 10 August 2026 must appear
wherever screening results are displayed, and described this as a condition
attached to redistribution before the workspace is opened to users.

The exact supplied wording is:

> Company-level Shariah screening data is provided by Halal Terminal, using an
> independent implementation of published AAOIFI Shari'ah Standard No. 21
> screening criteria. Halal Terminal is not affiliated with or endorsed by
> AAOIFI.

This creates a product and UI requirement with likely visual-baseline impact,
and implementation requires separate authorization.

Yassir's detailed reply states that **Enterprise** includes in-app display of
Halal Terminal-derived screening results to end users, with the attribution
above, while bulk re-export remains outside scope. The supplied evidence does
not grant that external-display right to Starter. The three-month Starter offer
is therefore an internal evaluation entitlement only unless Halal Terminal
expressly confirms otherwise. No subscription or provider enablement is
authorized by this record.

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

Bogdan's 27 August 2026 correspondence explicitly states: **"Index data is not
available on any plan."** AzaLens must not design, market or budget Twelve Data
as an index-data source.

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

**Finding TD-12 — trial completed; production remains disabled.** Twelve Data's
**12-day Unlimited trial** was activated for private validation and completed
under the B4 zero-storage evidence protocol. The final freeze recorded **171
planned requests**, a conservative **306-credit** model, **268 dashboard
credits**, and variance **-38**; it stored no raw payloads, passed credential and
owner-only-permission checks, and left the repository clean. The variance is
explained by provider trial/billing behaviour and is not a production saving:
AAPL is a reduced-price trial symbol, while `/symbol_search` and `/stocks`
incorrectly produced no dashboard increment and were later confirmed by Bogdan
as a billing bug; each should cost one credit. `/logo` is one credit and
`/profile` must be budgeted at ten credits per ordinary production symbol. The
corrected nine-symbol Day 5 model is **108 credits**. Trial findings do not
authorize public display, production activation or a subscription purchase.
The startup discount remains unaccepted.

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
- **The 12-day trial is complete** under Finding TD-12; no further trial call is
  implied or authorized.
- **No trial-derived data may be displayed through the AzaLens UI unless its
  licensing and attribution obligations are satisfied**, per the trial-output
  boundary above.

None of this authorizes B1, another trial, a provider switch or any production
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

### B5c evidence reconciliation — recorded 2026-08-29

**Canonical scope.** B5a merged in PR #45 at
`8d8606544232e2620fd169a122a7456130056534`; B5b merged in PR #46 at
`801d06389adf633c49b5346292f3a3c1f587a7d2`, tree
`99250b97d2d8bdf54bdd7d4d673216b89699747a`. B5a added subscription-neutral
pre-transport credit reservations, Basic presets of 8 credits/minute and
800/day, bounded refusal behaviour, redacted accounting and offline tests. B5b
made unsafe topology fail closed: multi-instance operation is refused until a
shared atomic coordinator exists, while single-instance operation requires an
explicit acknowledgement. Neither lifecycle bought or enabled Twelve Data.

**Actual Render topology.** Sanitized Render dashboard evidence on 29 August
2026 shows AzaLens Backend on the **Free** compute plan, autoscaling **off and
unavailable**, and manual instance count fixed at **1**. A shared atomic Twelve
Data coordinator is therefore not presently necessary. B5c distributed-ledger
implementation is deferred until scaling is enabled or more than one backend
instance is otherwise evidenced. This does not solve the separate Halal
Terminal ledger-durability debt.

**Provider correspondence.** Bogdan's detailed Twelve Data response was
received on 24 August 2026 at 2:33 PM; his billing-bug confirmation was received
on 28 August 2026 at 7:16 PM. Yassir's detailed Halal Terminal response was
received on 11 August 2026 at 12:48 AM; the three-month Starter offer was
received on 15 August 2026 at 5:19 AM and remains unredeemed. These timestamps
are displayed local email timestamps with no timezone inferred.

**Backup discovery-integrity audit.** A read-only authenticated audit of private
Drive folder `1yE8o2yX_xpXdtY4_bzaURc6eUYrv0rmd` found **36 complete modern
ZIP/sidecar pairs** and four older standalone ZIPs that predate the sidecar
convention. Every modern ZIP was byte-read, SHA-256 hashed and matched to its
directly read sidecar; no modern object was missing, orphaned, duplicated,
mismatched or corrupted. In particular:

- `AzaLens-2026-08-28-8d86065.zip`: Drive ID
  `11PC4ObBiOMSLdriX-FBQHjmvNEGmbpWT`, 6,838,215 bytes, SHA-256
  `29e1c15cb4c8608566b20d2f670ccbb8b67c711cf2adc65ec3d3f6541fef6a83`;
- `AzaLens-2026-08-29-801d063.zip`: Drive ID
  `1o_pSWEKCVfW4HijOAx9dU-nvp6iAQjAp`, 6,839,637 bytes, SHA-256
  `b822d1a6348c1c9789a7619e4b08edf5d4e25f7f0a5e9dddd122b607613cf733`.

The legacy filename-search path returned sidecars but **zero ZIPs**, including
known-good ZIP IDs; complete direct-child listing and direct-ID reads found all
ZIPs. Therefore filename search is not backup-existence evidence. Future backup
verification must record both Drive IDs and use: complete direct-child listing,
direct-ID metadata, authenticated ZIP byte readback, direct sidecar read and
SHA-256 comparison. Preserve the established sidecar convention
`<backup-without-.zip>.sha256`; 35 of the 36 audited modern pairs use it, while
`801d063`'s `.zip.sha256` is a historical one-off and must not redefine the
convention. Earlier
`+2 objects` claims cannot establish unchanged pre-existing objects unless their
listing method is recoverable; today's full byte audit establishes current
integrity without retroactively inventing that provenance.

**Boundaries left open deliberately.** Attribution remains mandatory for all
displayed Twelve Data content; a waiver for purely non-reconstructive derived
outputs is not evidenced. Halal Terminal Starter is not external-display
authority. No provider purchase, default switch, production enablement or
distributed-coordinator build follows from this record.

---

## PART 2 — FIX (historical correctness-and-truth register)

| # | Item | Status | Rules | Cost |
|---|---|---|---|---|
| 2.1 | **Register unregistered CI suites.** The 5 known CI-safe ones (`testComplianceGate`, `testMarketSession`, `testRvolSessionAwareness`, `testPartialIndicatorFailure`, `testAgreementTrendDegradation`) plus triage of the other 6 the audit found (`testDecisionEngine`, `testHalalterminalProvider`, `testMasterAnalysisShariah`, `testRiskPlanning`, `testScenarioPlanning`, `testShariahComplianceService`). The compliance-gate invariant currently has **no CI protection** via its focused suite | Partially Verified (audit item 12) | 8 | None |
| 2.2 | **Run the full 22-suite backend CI locally on this Mac** for `92d483c` — the recorded pass came from another environment; Rule 7 requires local confirmation | Blocked on a local run only | 7, 8 | None |
| 2.3 | **Scanner rate-limit double-count decision**: `/api/scanner` is on the strict limiter *and* counted by the global limiter (audit items 3–4). Either exempt scanner from global, or move scanner off strict. Recommendation: keep scanner on strict (it is provider-backed), add scanner paths to the global exemption list, and exclude `GET /policy` from strict | Partially Verified | 8, 17 | None |
| 2.4 | **Unmount `/api/portfolio/intelligence`** until a page uses it — it is unauthenticated, unused, and spends ~5 tokens per holding per cold call; when re-mounted, make its withheld state honest (currently degrades to "Unknown") | Live and unused (audit N2, item 11-A) | 13, 17, 23 | Saves tokens |
| 2.5 | **Minimal API access control before any public link circulates.** The unauthenticated-stranger exposure recorded as audit N1 is closed: the production closed-demo gate fronts the protected `/api` routes, and a production request without valid closed-demo access receives HTTP 401. **The cost-control weakness behind this item is not closed.** The gate is an access control, not a durable spend control. Anyone holding valid closed-demo access may initiate permitted analysis requests, and the Halal Terminal usage ledger resolves to non-durable storage on Render's ephemeral filesystem, where a deployment or restart may erase recorded usage. The application therefore does not durably enforce a calendar-month token ceiling — see Finding 3 under the production environment audit, which also records the offered-but-not-redeemed three-month Starter promotion of 2,500 tokens per month, a commercial entitlement distinct from the application's internal safety budget. Restricting access reduces exposure; it does not resolve the underlying weakness. A server-side app-token header is the cheap pre-accounts step; durable spend enforcement is a separate one | Partly closed (unauthenticated exposure closed; durable spend enforcement not built) | 17, 23 | None |
| 2.6 | **Remove obsolete `/api/explanation`.** The frontend already reads the gated explanation from `/api/analyze`; the standalone route had no consumer, duplicated the full provider pipeline, and misreported a valid Shariah-withheld outcome as HTTP 500 | Implemented locally; deployment pending | 5, 13, 17 | Saves tokens |
| 2.7 | Delete `diag/proxy-capture` (local **and** origin) after saving the three captured proxy log lines outside the repo (open item 2); prune the other stale branches and the `legacy-platform` remote | Pending | 7 | None |
| 2.8 | `trust proxy = 3` topology watch: correct today, silently wrong if Render changes its edge (open item 7). Add a startup log of the observed hop count to `/ops/metrics` for periodic eyeballing | Verified, fragile | 8 | None |
| 2.9 | Review/remove the leftover `alpha-lens-ai` Vercel project (open item 5) — harmless (doesn't own the domain) but an attack/typo-confusion surface | Unverifiable from repo | 3, 23 | None |
| 2.10 | Reconcile `design/*.ts` with `index.css` (two conflicting token sources; audit V9) — resolved by Design Phase 1 | Stale files | 7 | None |
| 2.11 | Provider-attribution licensing check (Finnhub, Twelve Data, Halal Terminal): decide hide-vs-attribute per their terms (audit N6). **Halal Terminal is decided for Enterprise:** Yassir's exact wording is retained in Finding 4 and must appear wherever screening results are displayed; the supplied evidence does not grant external display under Starter. **Twelve Data is decided for displayed provider content:** attribution is required wherever its data is displayed, with wording, logo and link requirements governed by its guidelines. B7-0/B7a/B7b closed the history-chart implementation gap. **Still open:** derived analytics and other Twelve Data-sourced surfaces carry no attribution; attribution for purely non-reconstructive outputs remains ambiguous and is not waived; mixed-provider surfaces must render each provider's verified attribution; Finnhub remains undecided. | Partly decided (Halal Terminal Enterprise and displayed Twelve Data content decided; non-reconstructive derived outputs and Finnhub unresolved) | 12, 17 | None |
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

## PART 3 — ADD (historical ordering)

| # | Item | Status | Rules | Cost |
|---|---|---|---|---|
| 3.1 | **Design System Phases 1–2** (token migration; truth-chip/state system) per `docs/DESIGN_SYSTEM.md`; update the 4 visual snapshots + add 2 Shariah ones | Planned | 5, 14, 18 | None |
| 3.2 | **Terms of Use + Privacy Policy pages** — draft with Tahir Khan sahib's input so wording matches UAE positioning from the start | Not Built (audit N4) | 20, 23, 24 | Legal drafting (non-code) |
| 3.3 | **Accounts + database + tier flags as ONE project on Supabase** — not three projects. Includes: auth on every API route, per-user watchlist/portfolio (replacing the shared world-writable JSON files), server-side entitlement middleware (single choke point), tier *flags* only. **Payments must NOT go live before the UAE regulatory memo exists (Rules 24/26).** | Not Built | 21, 23, 26 | Supabase free tier initially; verify limits before relying on it |
| 3.4 | Token-economics hardening: treat 5 tokens/screening as a one-sample estimate; verify against the provider dashboard after the next few screenings and adjust `HALAL_TERMINAL_ESTIMATED_TOKENS_PER_REQUEST` if wrong | Single data point | 17 | None (observation only) |
| 3.5 | Trust/understanding metrics (privacy-respecting, designed after 3.3) | Not Built | 22, 23 | Depends on tooling; prefer free/self-hosted |
| 3.6 | Historical verdict evaluation (store verdicts + outcomes for honesty review) | Not Built | 18, 22 | Needs 3.3's database first |
| 3.7 | Design Phases 3–4 (density/motion; signature aperture) — beauty last, per your own rule | Planned | 18 | None |

### [HISTORICAL PENDING ITEM] Durable storage (original wording: carried forward deliberately — do not start yet)
Paid Render Key Value (Valkey) or Supabase-backed storage is intentionally parked: at one user with 177 tokens the problem does not exist, and it must be built **once, together with accounts (3.3), not twice**. When resumed, the requirements stand as previously specified: durable Shariah cache with TTL and versioned keys (symbol + provider + contract version); atomic token reservation with UTC monthly rollover that cannot carry spend across months or reset early; multi-instance concurrency safety; authoritative-vs-estimated balance labelling preserved (`locallyEstimatedUsed`/`locallyEstimatedRemaining`, provider dashboard authoritative); fail-closed behaviour on storage/provider outage (no unreserved live call, degraded/unknown screening, verdict withheld — never guessed); zero-network tests for hit/miss/TTL/restart/concurrency/rollover/outage; rollout behind explicit env config with staged verification. **Cost when built:** small paid Valkey instance or Supabase paid tier — approve explicitly at that time. Current reality it mitigates: the in-memory Shariah cache dies on every Render spin-down (so the 24h cache rarely helps), and a wiped ledger makes the budget guard *more permissive*, not dangerous.

## PART 4 — REMOVE / STOP CLAIMING (historical register)

- The **"AzaLens Pro" upsell** (1.2) — stop claiming a paid tier exists.
- The landing **BUY mockup** (1.1) — stop displaying a verdict style the product forbids.
- The stale claims in **PRODUCT_BUILD_STATUS.md** and the old roadmap (1.7) — both under- and over-claimed.
- Dead code: `App.tsx`, `LiveAnalysisTest.tsx`, legacy dashboard panels, stale `design/colors.ts`/`typography.ts`, empty feature dirs (1.9, 2.10).
- `backend/fixtures/shariah/` either gets real fixture files (from the recorded META response, sanitized) or fixture mode should say clearly it has no data (audit V10).

## PART 5 — NON-CODE TRACKS (historical rationale; current status requires revalidation)

- **Track A — Scholarly review** (Mufti Ejaz Ahmed Samadani sahib): prerequisite artifacts = Phase 0 items 1.1–1.4; frame as review/correction, never endorsement (Rule 25); afterwards, record his corrections as roadmap items.
- **Track B — UAE regulatory memo** (Tahir Khan sahib): written perimeter memo covering permitted activities, licensing, wording, countries, entity type (Rule 26). **Hard gate:** no external beta, no payments, until it exists. Product boundaries determine the licence — not vice versa (his review of the current no-execution/no-custody/no-advice posture in audit Part 3-B is the starting evidence).
- **Track C — Controlled beta gate** (Rule 20): opens only after Phase 0 + 2.1–2.5 + 3.2 + Track B, with incident ownership named.

## OPEN-ITEMS REGISTER (historical originals + audit additions)

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

## WHAT IS GENUINELY DONE AND HOLDS (historical proof at `92d483c`)

Verified at `92d483c` (evidence in the audit): the server-side Shariah compliance gate on every verdict-bearing surface; INTACT/VIOLATED/REVIEW end to end with CI-registered tests; CORS allowlist (project-and-account-scoped previews, no `*.vercel.app`); layered rate limiting with a genuinely shared strict budget and verified `trust proxy = 3`; the cost-safe scanner (server-side membership + 20-cap, one history call per symbol, zero Shariah calls); the honest dashboard with no auto-analysis token leak; functional local settings; equities-only dynamic search; the fail-closed Shariah runtime with dev guard and budget ledger; blocking CI on every push/PR.

The philosophy is now enforced in the product core. What remains is making the *outside* of the product — landing, docs, legal surface, and the paid-tier fiction — as honest as the inside.
