"use strict";

/*
  Durable proof of the DETECTORS in tests/testOutcomeLedgerMigrationContract.js,
  not of the migration they inspect.

  The migration's financial and access behaviour already has executable
  PostgreSQL coverage in testOutcomeLedgerRpc.js and testOutcomeLedgerRls.js.
  What had no coverage at all was the lexical machinery that decides whether
  those clauses are still present: `inspect`, the exact-boundary slicer
  `rpcBody`, and the 37-entry mutation table. Those are the parts that fail
  open. A detector that stopped matching, a mutation whose `.replace()` silently
  became a no-op, or a duplicated object definition that the first-match slicers
  never look at, all leave a green log and no evidence.

  Nothing here reads a database, a credential or the network: requiring the
  contract module reads two committed .sql files and returns pure functions.
*/

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CONTRACT = path.join(__dirname, "testOutcomeLedgerMigrationContract.js");
const {
  inspect,
  rpcBody,
  occurrences,
  up,
  down,
  mutations,
  tables,
  rpcs,
  NAME,
} = require(CONTRACT);

const ROOT = path.resolve(__dirname, "../..");
const UP_PATH = path.join(ROOT, "supabase/migrations", NAME);
const DOWN_PATH = path.join(ROOT, "db/down-migrations", NAME);

// Recorded before anything else runs, and re-checked at the very end: this file
// must not be able to alter the migration it reasons about.
const sha256 = (file) =>
  require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const UP_SHA = sha256(UP_PATH);
const DOWN_SHA = sha256(DOWN_PATH);

// ------------------------------------------------------------------
// 1. The inventory is exact, and the committed migration satisfies it.
// ------------------------------------------------------------------
assert.deepEqual(
  inspect(up),
  [],
  "the committed migration must satisfy every detector with no errors at all",
);
assert.deepEqual(tables, [
  "outcome_decision_snapshots",
  "outcome_snapshot_provenance",
  "outcome_positions",
  "outcome_position_events",
]);
assert.deepEqual(rpcs, ["create_outcome_position", "append_outcome_position_event"]);

for (const table of tables) {
  assert.equal(
    occurrences(up, `create table public.${table}`),
    1,
    `${table} must be defined exactly once`,
  );
}
for (const rpc of rpcs) {
  assert.equal(
    occurrences(up, `create function public.${rpc}`),
    1,
    `${rpc} must be defined exactly once`,
  );
}

// ------------------------------------------------------------------
// 2. A missing object is detected - each one on its own.
// ------------------------------------------------------------------
for (const table of tables) {
  const without = up.replace(`create table public.${table}`, `create table public.zz_${table}`);
  assert.notEqual(without, up, `removing ${table} must actually change the text`);
  const errors = inspect(without);
  assert.ok(
    errors.includes(`missing table ${table}`),
    `dropping the definition of ${table} must be detected, got: ${JSON.stringify(errors)}`,
  );
}
for (const rpc of rpcs) {
  const without = up.replace(`create function public.${rpc}`, `create function public.zz_${rpc}`);
  assert.notEqual(without, up);
  assert.ok(
    inspect(without).includes(`missing RPC ${rpc}`),
    `dropping the definition of ${rpc} must be detected`,
  );
}

// ------------------------------------------------------------------
// 3. A duplicated or ambiguous definition is detected rather than ignored.
// ------------------------------------------------------------------
{
  /*
    The escape this guards. `inspect` and `rpcBody` both locate an RPC with a
    single indexOf, and slice it at the first following `revoke all on
    function`. A SECOND definition appended after that boundary is outside every
    slice: none of the hardening checks - security definer, auth.uid(), no
    caller-owned user id, numeric validation order, the G-3 block - is ever
    applied to it. Without the occurrence count, the paste below returns [].
  */
  const shadow = [
    "create function public.create_outcome_position(p_user_id uuid)",
    "returns void language plpgsql as $$ begin",
    "  insert into public.outcome_positions(user_id) values (p_user_id);",
    "end $$;",
  ].join("\n");
  const duplicated = `${up}\n${shadow}\n`;

  const errors = inspect(duplicated);
  assert.ok(
    errors.some((error) => error.startsWith("ambiguous RPC definition create_outcome_position")),
    `a second definition of create_outcome_position must be detected, got: ${JSON.stringify(errors)}`,
  );
  // And the detector says how many, so the diagnosis does not need a re-read.
  assert.ok(errors.some((error) => error.includes("(2 occurrences)")));
}
{
  const duplicated = `${up}\ncreate table public.outcome_positions (id uuid primary key);\n`;
  const errors = inspect(duplicated);
  assert.ok(
    errors.some((error) => error.startsWith("ambiguous table definition outcome_positions")),
    `a second definition of outcome_positions must be detected, got: ${JSON.stringify(errors)}`,
  );
}

// ------------------------------------------------------------------
// 4. rpcBody slices at exact boundaries, and fails closed when it cannot.
// ------------------------------------------------------------------
{
  const create = rpcBody(up, "create_outcome_position");
  const append = rpcBody(up, "append_outcome_position_event");

  assert.ok(create.startsWith("create function public.create_outcome_position"));
  assert.ok(append.startsWith("create function public.append_outcome_position_event"));
  // The two slices must not overlap: the ORDER assertions built on them are
  // meaningless if one function's text leaks into the other's.
  assert.ok(
    !create.includes("create function public.append_outcome_position_event"),
    "the create slice must stop before the append function begins",
  );
  assert.ok(
    !append.includes("create function public.create_outcome_position"),
    "the append slice must not reach back into the create function",
  );
  assert.ok(!create.includes("revoke all on function"));
  assert.ok(!append.includes("revoke all on function"));
  assert.ok(create.length > 0 && append.length > 0);
  assert.ok(create.length + append.length < up.length);

  // A text with no boundary yields "", and an empty body must never be read as
  // a clean one: `inspect` reports the absent pipeline rather than passing.
  const boundaryless = "create table public.nothing (id uuid);";
  assert.equal(rpcBody(boundaryless, "create_outcome_position"), "");
  const errors = inspect(boundaryless);
  assert.ok(errors.some((error) => error === "missing RPC create_outcome_position"));
  assert.ok(errors.some((error) => error === "missing RPC append_outcome_position_event"));
  assert.ok(errors.length > 20, "a wholly unrelated file must fail loudly, not quietly");
}

// ------------------------------------------------------------------
// 5. Every mutation in the table really mutates.
// ------------------------------------------------------------------
{
  /*
    The silent-decay failure mode of a mutation table: a `.replace()` whose
    needle no longer appears returns the string unchanged, so the "mutation"
    becomes a no-op. The contract file would still catch that today, because
    inspect(up) is empty - but only by accident of ordering, and only as an
    opaque "must be detected" failure. Asserting it directly names the entry.
  */
  assert.equal(
    mutations.length,
    37,
    `the mutation table has ${mutations.length} entries; a shrinking table means a ` +
      "detector lost its proof, so the count is pinned rather than merely non-empty",
  );

  const seen = new Set();
  for (const [name, mutated, expected] of mutations) {
    assert.equal(typeof name, "string");
    assert.ok(!seen.has(name), `duplicate mutation name ${name}`);
    seen.add(name);
    assert.notEqual(
      mutated,
      up,
      `mutation "${name}" no longer changes the migration text; its needle has drifted ` +
        "and it is proving nothing",
    );
    const errors = inspect(mutated);
    assert.ok(
      errors.some((error) => error.includes(expected)),
      `mutation "${name}" must be detected as "${expected}", got: ${JSON.stringify(errors)}`,
    );
  }
}

// ------------------------------------------------------------------
// 6. The migration text is restored: no mutation escaped into a file.
// ------------------------------------------------------------------
assert.equal(sha256(UP_PATH), UP_SHA, "the migration file must be byte-identical after inspection");
assert.equal(sha256(DOWN_PATH), DOWN_SHA, "the down migration must be byte-identical");
assert.equal(fs.readFileSync(UP_PATH, "utf8"), up, "the in-memory `up` must still equal the file");
assert.equal(fs.readFileSync(DOWN_PATH, "utf8"), down);

// ------------------------------------------------------------------
// 7. Diagnostics are deterministic and do not depend on locale or ordering.
// ------------------------------------------------------------------
{
  const damaged = up
    .replace(" for update;", ";")
    .replaceAll("auth.uid()", "null::uuid");

  const first = inspect(damaged);
  const second = inspect(damaged);
  assert.deepEqual(second, first, "the same input must produce the same errors, in the same order");
  assert.ok(first.length > 1, "independent damage must be reported in one pass, not one at a time");

  // Order is the order the detectors run in, never a sort: a locale-sorted list
  // reads differently on a runner with a different collation.
  const byLocale = [...first].sort((a, b) => a.localeCompare(b));
  assert.notDeepEqual(
    first,
    byLocale,
    "this fixture is chosen so that detector order and locale order differ; if they " +
      "ever coincide the assertion above stops proving anything",
  );
}

// ------------------------------------------------------------------
// 8. No word splitting, no partial match, no suppressed error.
// ------------------------------------------------------------------
{
  // `outcome_positions` must not be satisfied by `outcome_position_events`, nor
  // the reverse, so a table can never be "found" inside a longer sibling name.
  const withoutPositions = up.replace(
    "create table public.outcome_positions",
    "create table public.zz_outcome_positions",
  );
  assert.ok(inspect(withoutPositions).includes("missing table outcome_positions"));
  assert.ok(!inspect(withoutPositions).includes("missing table outcome_position_events"));

  const withoutEvents = up.replace(
    "create table public.outcome_position_events",
    "create table public.zz_outcome_position_events",
  );
  assert.ok(inspect(withoutEvents).includes("missing table outcome_position_events"));
  assert.ok(!inspect(withoutEvents).includes("missing table outcome_positions"));

  // A weakened clause is not a present one. `includes` on a long exact string
  // is what stops "the revoke is still there" from being true of a revoke that
  // no longer covers service_role.
  const partialRevoke = up.replace(
    "revoke all on public.outcome_positions from public, anon, authenticated, service_role",
    "revoke all on public.outcome_positions from public, anon, authenticated",
  );
  assert.notEqual(partialRevoke, up, "the partial-revoke mutation must change the text");
  assert.ok(
    inspect(partialRevoke).includes("incomplete revoke outcome_positions"),
    "a revoke that stops short of service_role must not satisfy the detector",
  );

  /*
    Weakening ONE of the two functions must be detected as that function. Both
    are defined before the first `revoke all on function`, so a per-RPC slice
    taken at that boundary spans them both, and a hardening clause surviving in
    the other function is enough to satisfy the check for the damaged one. These
    two assertions are what hold the slice to exact boundaries.
  */
  const spliceCreate = (transform) => {
    const body = rpcBody(up, "create_outcome_position");
    assert.ok(body.length > 0);
    const damaged = transform(body);
    assert.notEqual(damaged, body, "the single-function mutation matched nothing");
    return up.replace(body, damaged);
  };

  const unpinnedSearchPath = spliceCreate((body) =>
    body.replace("security definer set search_path = ''", "security definer"),
  );
  assert.deepEqual(
    inspect(unpinnedSearchPath),
    ["unhardened RPC create_outcome_position"],
    "dropping search_path from one function must be reported for exactly that function",
  );

  const noAuthUid = spliceCreate((body) => body.replaceAll("auth.uid()", "null::uuid"));
  assert.ok(
    inspect(noAuthUid).includes("RPC does not derive auth.uid create_outcome_position"),
    "one function that stops deriving auth.uid() must be detected",
  );
  assert.ok(
    !inspect(noAuthUid).includes("RPC does not derive auth.uid append_outcome_position_event"),
    "and the undamaged function must not be blamed for it",
  );

  /*
    And the honest limit of a lexical contract, asserted so nobody mistakes it
    for more than it is: these detectors read text, so a clause moved into a
    comment still reads as present. That is exactly why the executable
    PostgreSQL proofs in testOutcomeLedgerRpc.js and testOutcomeLedgerRls.js are
    the authority on behaviour, and this file is a tripwire.
  */
  const commented = up.replace(" for update;", ";\n  -- for update;");
  assert.notEqual(commented, up);
  assert.deepEqual(
    inspect(commented),
    [],
    "if this ever starts failing, the contract became comment-aware and the " +
      "comment above is out of date",
  );
}

// ------------------------------------------------------------------
// 9. The contract file depends on no database, credential or network.
// ------------------------------------------------------------------
{
  /*
    Run it in a stripped environment: no SUPABASE_*, no provider key, no
    DATABASE_URL, and decoy values for the names it would use if it ever
    reached for one. A pass here is behavioural proof that the whole contract is
    text over two committed files.
  */
  const result = spawnSync(process.execPath, [CONTRACT], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      SUPABASE_URL: "http://127.0.0.1:1/must-not-be-used",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
      SUPABASE_ANON_KEY: "must-not-be-used",
      DATABASE_URL: "postgresql://must-not-be-used@127.0.0.1:1/none",
      TWELVE_DATA_API_KEY: "must-not-be-used",
      FINNHUB_API_KEY: "must-not-be-used",
    },
  });

  assert.equal(
    result.status,
    0,
    `the migration contract must pass with no database or credential available:\n${result.stdout}${result.stderr}`,
  );
  assert.match(result.stdout, /Outcome ledger migration and mutation contracts passed\./);
  assert.equal(result.stderr, "");
}

// ------------------------------------------------------------------
// 10. The down migration is still paired, and still refuses to run itself.
// ------------------------------------------------------------------
for (const table of [...tables].reverse()) {
  assert.equal(
    occurrences(down, `drop table if exists public.${table}`),
    1,
    `the down migration must drop ${table} exactly once`,
  );
}
for (const rpc of rpcs) {
  assert.equal(occurrences(down, `drop function if exists public.${rpc}`), 1);
}
assert.match(down, /NEVER RUN AUTOMATICALLY/);

console.log(
  `Outcome ledger contract-helper tests passed: ${mutations.length} mutations are live, ` +
    "duplicate definitions are detected, diagnostics are order-stable, and the " +
    "contract runs with no database, credential or network.",
);
