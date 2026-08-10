# Shariah development fixtures

Fixture mode reads a raw provider-shaped JSON response named after the
normalized ticker, for example `AAPL.json`.

Characters other than letters, numbers, and hyphens are converted to
underscores in fixture filenames, so `BRK.B` is read from `BRK_B.json`.

Fixtures must contain no credentials or personal data. Do not commit licensed
provider responses unless AzaLens has written permission to store and reuse
them. When no approved fixture exists, the application must return an
unavailable Shariah result instead of inventing a verdict.

## Committed synthetic scenarios

The fixtures in this directory are **entirely invented**. Every company, ticker,
figure and sentence was written by hand for AzaLens. Nothing here is copied from,
derived from, or a sanitised version of any real screening response — which is
also why no licensed payload appears, per the paragraph above.

They exist so tests, local development and internal review can exercise every
materially different screening state without contacting the provider or spending
its quota.

| Fixture | Scenario | Why it is needed |
|---|---|---|
| `ZZCOMPLIANT.json` | `COMPLIANT` — both screens pass | The only path that unlocks directional guidance |
| `ZZNONCOMPBUS.json` | `NON_COMPLIANT` — business screen fails | Refusal caused by the business activity |
| `ZZNONCOMPFIN.json` | `NON_COMPLIANT` — financial screen fails | The same public status reached by a different screen; keeps the two separable |
| `ZZUNKNOWN.json` | `UNKNOWN` — no determination supplied | Pending/indeterminate must withhold, never assume |
| `ZZPROVIDERERROR.json` | `UNKNOWN`, `success: false` — error instead of a verdict | Screening service failure must fail closed |

Two further states need no committed file: a **missing** fixture
(`SHARIAH_FIXTURE_NOT_FOUND`) and a **malformed** one
(`SHARIAH_FIXTURE_INVALID`). Both are covered in
`backend/tests/testShariahSyntheticFixtures.js`, the malformed case from a
temporary directory so no broken JSON is ever committed.

## Conventions

Every committed fixture must:

- use a `ZZ`-prefixed ticker that cannot be mistaken for a listed security;
- name a company ending `(SYNTHETIC TEST DATA - NOT A REAL COMPANY)`;
- use `"country": "Nowhere"` and an `https://example.invalid/…` website;
- carry the synthetic disclaimer;
- contain only fields the normalizer already reads, and no timestamp, random or
  environment-derived value, so snapshots stay stable.

## Production isolation

Fixtures are opt-in and cannot leak into production:

- they are served only when `SHARIAH_DATA_MODE=fixture`; the default is
  `offline`, which refuses with `SHARIAH_LIVE_API_DISABLED`;
- an unrecognised mode string refuses with `SHARIAH_DATA_MODE_INVALID` rather
  than degrading to fixtures;
- a fixture is never a fallback for a failed live call;
- results are tagged `provider.id = "halal_terminal_fixture"` and
  `metadata.fixture = true`, so a fixture can never be mistaken for a real
  screening;
- no production module imports a fixture file — enforced by test.
