"use strict";

/*
  Migration 005 - the watchlist cap as a database invariant.

  Two independent breaches motivated the migration, and both are
  re-proved here rather than taken on trust:

    1. count-then-insert is time-of-check/time-of-use. Twelve
       concurrent requests from 99 rows each observed 99, each passed
       the check, and all twelve inserted.
    2. `authenticated` holds a direct table INSERT grant, so a token
       holder reaches PostgREST without passing through Node at all.

  Everything below therefore drives the REAL PostgREST endpoint as a
  real signed-in user. The superuser SQL channel is used only for
  catalog inspection and for the deliberate local mutations, never to
  assert application behaviour.

  Runs against the LOCAL disposable stack only. It creates and deletes
  users, so pointing it at a hosted project would be destructive - it
  reads its connection details from `supabase status`, which only ever
  describes local.
*/

const { readStatus, request, sql } = require("./helpers/localSupabase");

const { apiUrl, publishableKey, secretKey } = readStatus();

const RUN = Date.now();
const PASSWORD = "azalens-local-test-password";
const CAP = 100;
const CONCURRENCY = 12;
const ROUNDS = 3;

const results = [];
const created = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const admin = (path, options = {}) =>
  request(`${apiUrl}${path}`, { apikey: secretKey, token: secretKey, ...options });

const rest = (path, token, options = {}) =>
  request(`${apiUrl}/rest/v1${path}`, { apikey: publishableKey, token, ...options });

const anonRest = (path, options = {}) =>
  request(`${apiUrl}/rest/v1${path}`, { apikey: publishableKey, ...options });

async function makeUser(label) {
  const email = `wcap-${label}-${RUN}@azalens.local`;
  const create = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password: PASSWORD, email_confirm: true },
  });
  if (!create.ok) throw new Error(`could not create user ${label}`);
  created.push(create.body.id);

  const signIn = await request(`${apiUrl}/auth/v1/token?grant_type=password`, {
    apikey: publishableKey,
    method: "POST",
    body: { email, password: PASSWORD },
  });
  if (!signIn.ok) throw new Error(`could not sign in user ${label}`);

  return { id: create.body.id, token: signIn.body.access_token };
}

const rows = (query) => {
  const out = sql(query);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
};

async function countFor(user) {
  const response = await rest("/watchlists?select=symbol", user.token);
  return Array.isArray(response.body) ? response.body.length : -1;
}

function symbolAt(index) {
  // Stays inside the migration-002 CHECK: ^[A-Z0-9.-]{1,12}$
  return `WC${String(index).padStart(6, "0")}`;
}

async function insertOne(user, symbol) {
  return rest("/watchlists", user.token, {
    method: "POST",
    body: { symbol, user_id: user.id },
    prefer: "return=minimal",
  });
}

async function seedTo(user, target) {
  const existing = await countFor(user);
  const batch = [];
  for (let index = existing; index < target; index += 1) {
    batch.push({ symbol: symbolAt(index), user_id: user.id });
  }
  if (batch.length === 0) return;
  const response = await rest("/watchlists", user.token, {
    method: "POST",
    body: batch,
    prefer: "return=minimal",
  });
  if (response.status >= 400) {
    throw new Error(`seeding to ${target} failed with ${response.status}`);
  }
}

const isCapRejection = (response) =>
  response.status === 422 &&
  response.body &&
  response.body.message === "WATCHLIST_LIMIT_REACHED";

async function clear(user) {
  await rest(`/watchlists?user_id=eq.${user.id}`, user.token, { method: "DELETE" });
}

(async () => {
  // ==========================================================
  // 1. Structural contract, read from the catalog.
  // ==========================================================

  const trigger = rows(`
    select t.tgname
        || '|' || case when (t.tgtype & 2) = 2 then 'BEFORE' else 'AFTER' end
        || '|' || case when (t.tgtype & 1) = 1 then 'ROW' else 'STATEMENT' end
        || '|' || case when (t.tgtype & 4) = 4 then 'INSERT' else 'OTHER' end
        || '|' || t.tgrelid::regclass::text
        || '|' || p.proname
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.watchlists'::regclass
       and not t.tgisinternal
     order by 1
  `);

  check(
    "exactly one non-internal trigger on public.watchlists, BEFORE INSERT FOR EACH ROW",
    trigger.length === 1 &&
      trigger[0] ===
        "watchlists_enforce_record_cap|BEFORE|ROW|INSERT|watchlists|enforce_watchlist_record_cap",
    trigger.join(", ")
  );

  const fn = rows(`
    select case when p.prosecdef then 'definer' else 'invoker' end
        || '|' || coalesce(array_to_string(p.proconfig, ','), '(none)')
        || '|' || p.prorettype::regtype::text
        || '|' || pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'enforce_watchlist_record_cap'
  `);

  check(
    "cap function is SECURITY DEFINER with a fixed empty search_path, returns trigger, owned by postgres",
    fn.length === 1 && fn[0] === 'definer|search_path=""|trigger|postgres' ,
    fn.join(", ")
  );

  const body = sql(`
    select pg_get_functiondef(p.oid)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'enforce_watchlist_record_cap'
  `);

  check(
    "cap function takes a TRANSACTION-level advisory lock, never a session-level one",
    body.includes("pg_advisory_xact_lock") &&
      !/pg_advisory_lock\s*\(/.test(body) &&
      !body.includes("pg_advisory_unlock"),
    "pg_advisory_xact_lock present, pg_advisory_lock/unlock absent"
  );

  check(
    "advisory lock key is derived from new.user_id, so contention is per owner",
    body.includes("hashtextextended(new.user_id::text, 0)"),
    "per-owner lock key"
  );

  check(
    "cap function schema-qualifies its relation and its catalog calls",
    body.includes("from public.watchlists") &&
      body.includes("pg_catalog.pg_advisory_xact_lock") &&
      body.includes("pg_catalog.hashtextextended") &&
      body.includes("pg_catalog.count"),
    "public./pg_catalog. qualified"
  );

  check(
    "cap function counts only the inserting owner's rows",
    body.includes("where user_id = new.user_id"),
    "per-owner count predicate"
  );

  check(
    "cap function carries the stable machine-readable code and the exact limit",
    body.includes("WATCHLIST_LIMIT_REACHED") &&
      body.includes("v_limit   constant integer := 100") &&
      body.includes("v_current >= v_limit"),
    "WATCHLIST_LIMIT_REACHED, limit 100, >= comparison"
  );

  const executors = rows(`
    select r.rolname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('authenticated'), ('service_role'), ('public')) as r(rolname)
     where n.nspname = 'public'
       and p.proname = 'enforce_watchlist_record_cap'
       and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
     order by 1
  `);

  check(
    "no role may execute the cap function directly - the trigger still fires regardless",
    executors.length === 0,
    executors.join(", ") || "none"
  );

  // ==========================================================
  // 2. Migration 005 added nothing else.
  // ==========================================================

  const watchlistShape = sql(`
    select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
      from pg_attribute a
     where a.attrelid = 'public.watchlists'::regclass and a.attnum > 0 and not a.attisdropped
  `);
  check(
    "migration 005 added no column to public.watchlists",
    watchlistShape ===
      "id:uuid,user_id:uuid,symbol:text,note:text,added_at:timestamp with time zone",
    watchlistShape
  );

  check(
    "migration 005 added no index",
    rows(`select indexname from pg_indexes where schemaname='public' and tablename='watchlists' order by 1`)
      .join(",") === "watchlists_pkey,watchlists_user_id_idx,watchlists_user_id_symbol_key",
    "three pre-existing indexes only"
  );

  check(
    "migration 005 added no policy - the four migration-002 owner policies stand alone",
    rows(`select policyname from pg_policies where schemaname='public' and tablename='watchlists' order by 1`)
      .join(",") ===
      "watchlists_delete_own,watchlists_insert_own,watchlists_select_own,watchlists_update_own",
    "four owner policies"
  );

  check(
    "migration 005 changed no grant on public.watchlists",
    sql(`select array_to_string(c.relacl, ' ; ') from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='watchlists'`)
      .includes("authenticated=ard/postgres"),
    "authenticated retains exactly INSERT/SELECT/DELETE"
  );

  check(
    "row level security is still enabled AND forced on public.watchlists",
    sql(`select c.relrowsecurity::text || ',' || c.relforcerowsecurity::text
           from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='watchlists'`) === "true,true",
    "enabled and forced"
  );

  check(
    "public.portfolio_holdings deliberately carries no cap trigger in this migration",
    rows(`select t.tgname from pg_trigger t where t.tgrelid='public.portfolio_holdings'::regclass and not t.tgisinternal order by 1`)
      .join(",") === "portfolio_holdings_set_updated_at",
    "only the pre-existing updated_at trigger"
  );

  // ==========================================================
  // 3. Sequential boundaries, driven through PostgREST.
  // ==========================================================

  const owner = await makeUser("owner");
  const other = await makeUser("other");

  check("0 -> 1 insert succeeds", (await insertOne(owner, symbolAt(0))).status === 201);

  await seedTo(owner, 98);
  check("seeded to 98", (await countFor(owner)) === 98, `count=${await countFor(owner)}`);

  check("98 -> 99 insert succeeds", (await insertOne(owner, symbolAt(98))).status === 201);
  check("99 -> 100 insert succeeds", (await insertOne(owner, symbolAt(99))).status === 201);
  check("count is exactly at the cap", (await countFor(owner)) === CAP, `count=${await countFor(owner)}`);

  const overflow = await insertOne(owner, symbolAt(100));
  check(
    "100 -> 101 is rejected with HTTP 422 and the stable code",
    isCapRejection(overflow),
    `status=${overflow.status} message=${overflow.body && overflow.body.message}`
  );
  check(
    "rejection carries the limit and current count without SQL prose",
    overflow.body && overflow.body.details === "limit=100;current=100",
    overflow.body && overflow.body.details
  );
  check(
    "rejection leaks no table, column, policy, role or connection detail",
    overflow.body &&
      !/watchlists|user_id|policy|postgres|pg_|select |insert |function/i.test(
        JSON.stringify(overflow.body)
      ),
    "no schema detail in the body"
  );
  check("a rejected insert leaves exactly 100 rows", (await countFor(owner)) === CAP);

  // Deleting one frees exactly one slot.
  await rest(`/watchlists?symbol=eq.${symbolAt(0)}`, owner.token, { method: "DELETE" });
  check("delete brings the owner below the cap", (await countFor(owner)) === CAP - 1);
  check("one insert is then permitted", (await insertOne(owner, symbolAt(101))).status === 201);
  check("and the cap binds again immediately", isCapRejection(await insertOne(owner, symbolAt(102))));

  // Duplicate rejection must stay distinguishable from cap rejection.
  const duplicate = await insertOne(owner, symbolAt(99));
  check(
    "duplicate symbol is a unique violation (409/23505), NOT a cap rejection",
    duplicate.status === 409 &&
      duplicate.body &&
      duplicate.body.code === "23505" &&
      duplicate.body.message !== "WATCHLIST_LIMIT_REACHED",
    `status=${duplicate.status} code=${duplicate.body && duplicate.body.code}`
  );

  // A single bulk request must not be able to step over the cap either.
  await clear(other);
  await seedTo(other, 98);
  const bulk = await rest("/watchlists", other.token, {
    method: "POST",
    body: [96, 97, 98, 99, 100].map((n) => ({ symbol: `BULK${n}`, user_id: other.id })),
    prefer: "return=minimal",
  });
  check(
    "a single multi-row INSERT cannot cross the cap",
    isCapRejection(bulk) && (await countFor(other)) === 98,
    `status=${bulk.status} count=${await countFor(other)}`
  );

  // ==========================================================
  // 4. Per-owner independence and access control.
  // ==========================================================

  await clear(other);
  check("a second owner starts empty and is unaffected by the first owner's cap",
    (await countFor(other)) === 0);
  check("the second owner can insert while the first is capped",
    (await insertOne(other, "INDEP1")).status === 201);
  check("the first owner is still capped", isCapRejection(await insertOne(owner, symbolAt(103))));

  // The forged insert must be refused by row level security, and the
  // cap must not answer first. If it did, the 422 would both give the
  // wrong reason and tell the caller that some other owner is full.
  const forgedAtCap = await rest("/watchlists", other.token, {
    method: "POST",
    body: { symbol: "FORGED1", user_id: owner.id },
    prefer: "return=minimal",
  });
  check(
    "a forged cross-owner user_id is rejected by RLS (42501), not by the cap",
    forgedAtCap.status >= 400 &&
      !isCapRejection(forgedAtCap) &&
      forgedAtCap.body &&
      forgedAtCap.body.code === "42501",
    `status=${forgedAtCap.status} code=${forgedAtCap.body && forgedAtCap.body.code}`
  );
  check("the forged row never landed", (await countFor(owner)) === CAP);

  // Same probe against an owner who is nowhere near the cap. The two
  // responses must be indistinguishable, so a caller learns nothing
  // about anybody else's row count.
  const third = await makeUser("third");
  const forgedBelowCap = await rest("/watchlists", other.token, {
    method: "POST",
    body: { symbol: "FORGED2", user_id: third.id },
    prefer: "return=minimal",
  });
  check(
    "the cap is not an oracle: forging against a full owner and an empty owner are indistinguishable",
    forgedAtCap.status === forgedBelowCap.status &&
      JSON.stringify(forgedAtCap.body) === JSON.stringify(forgedBelowCap.body),
    `full=${forgedAtCap.status} empty=${forgedBelowCap.status}`
  );

  // Duplicate must outrank the cap even when the owner is full.
  const duplicateAtCap = await insertOne(owner, symbolAt(99));
  check(
    "at the cap, re-adding an existing symbol still reports duplicate, not limit reached",
    duplicateAtCap.status === 409 &&
      duplicateAtCap.body &&
      duplicateAtCap.body.code === "23505",
    `status=${duplicateAtCap.status} code=${duplicateAtCap.body && duplicateAtCap.body.code}`
  );

  const anonymous = await anonRest("/watchlists", {
    method: "POST",
    body: { symbol: "ANON1", user_id: owner.id },
    prefer: "return=minimal",
  });
  check("anon cannot insert at all", anonymous.status >= 400, `status=${anonymous.status}`);
  check("anon cannot read", (await anonRest("/watchlists?select=symbol")).status >= 400 ||
    ((await anonRest("/watchlists?select=symbol")).body || []).length === 0);

  // The allowed column update still works - the trigger is INSERT-only.
  const noteUpdate = await rest(`/watchlists?symbol=eq.${symbolAt(99)}`, owner.token, {
    method: "PATCH",
    body: { note: "still editable" },
    prefer: "return=minimal",
  });
  check(
    "the permitted note update is unaffected by an INSERT-only trigger, even at the cap",
    noteUpdate.status === 204 || noteUpdate.status === 200,
    `status=${noteUpdate.status}`
  );

  // ==========================================================
  // 5. Synchronised concurrency, repeated.
  // ==========================================================

  for (let round = 1; round <= ROUNDS; round += 1) {
    await clear(owner);
    await seedTo(owner, CAP - 1);

    const observed = await countFor(owner);

    // A barrier: every request is constructed first and released
    // together, so they genuinely contend rather than queue.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const attempts = Array.from({ length: CONCURRENCY }, (_, n) =>
      gate.then(() => insertOne(owner, `RACE${round}X${String(n).padStart(2, "0")}`))
    );
    release();
    const settled = await Promise.all(attempts);

    const accepted = settled.filter((r) => r.status === 201).length;
    const capped = settled.filter(isCapRejection).length;
    const final = await countFor(owner);

    check(
      `round ${round}: from ${observed} rows, ${CONCURRENCY} simultaneous inserts -> exactly 1 accepted`,
      accepted === 1,
      `accepted=${accepted}`
    );
    check(
      `round ${round}: the other ${CONCURRENCY - 1} are cap-rejected with the stable code`,
      capped === CONCURRENCY - 1,
      `cap-rejected=${capped}`
    );
    check(
      `round ${round}: final count is exactly ${CAP}`,
      final === CAP,
      `final=${final}`
    );
    check(
      `round ${round}: the database agrees with PostgREST`,
      Number(sql(`select count(*) from public.watchlists where user_id='${owner.id}'`)) === CAP,
      "catalog count matches"
    );
  }

  // ==========================================================
  // Teardown - local users only.
  // ==========================================================

  for (const id of created) {
    await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== migration 005 - watchlist cap invariant ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
})().catch(async (error) => {
  for (const id of created) {
    await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
  }
  console.error(`\nwatchlist cap suite error: ${error.message}`);
  process.exit(1);
});
