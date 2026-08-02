"use strict";

const { sql } = require("./helpers/localSupabase");

/*
  The test that catches the table we add next year.

  testTenantIsolation.js only covers tables someone remembered to list.
  This one asks the database itself, with no exceptions list, so a table
  added later without policies fails immediately. It protects against the
  mistake we have not made yet.
*/

const EXPECTED = {
  profiles: {
    policies: ["SELECT", "UPDATE"],
    updatableColumns: ["display_name"],
  },
  user_entitlements: {
    policies: ["SELECT"],
    updatableColumns: [],
  },
  user_preferences: {
    policies: ["SELECT", "UPDATE"],
    updatableColumns: ["default_market", "settings", "theme"],
  },
  watchlists: {
    policies: ["DELETE", "INSERT", "SELECT", "UPDATE"],
    updatableColumns: ["note"],
  },
  portfolio_holdings: {
    policies: ["DELETE", "INSERT", "SELECT", "UPDATE"],
    updatableColumns: ["average_price", "currency", "shares"],
  },
};

const IMMUTABLE = [
  "id",
  "user_id",
  "created_at",
  "added_at",
  "opened_at",
  "updated_at",
];

const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

function rows(query) {
  const out = sql(query);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

// ------------------------------------------------------------
// 1. Every table in public has RLS enabled AND forced.
// ------------------------------------------------------------

const unprotected = rows(`
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and (not c.relrowsecurity or not c.relforcerowsecurity)
   order by 1
`);

check(
  "every public table has row level security enabled and forced",
  unprotected.length === 0,
  unprotected.join(", ")
);

// ------------------------------------------------------------
// 2. The set of tables matches the design. A new table with no
//    entry here fails, which is the point.
// ------------------------------------------------------------

const actualTables = rows(`
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by 1
`);

const expectedTables = Object.keys(EXPECTED).sort();

check(
  "public contains exactly the designed tables",
  actualTables.join(",") === expectedTables.join(","),
  `found: ${actualTables.join(", ")}`
);

// ------------------------------------------------------------
// 3. Terms-blocked tables must not exist.
// ------------------------------------------------------------

for (const blocked of ["shariah_screenings", "saved_analyses"]) {
  check(
    `${blocked} is absent (blocked pending provider-terms answers)`,
    !actualTables.includes(blocked)
  );
}

// ------------------------------------------------------------
// 4. Per-table policy commands match the design exactly.
// ------------------------------------------------------------

for (const [table, expected] of Object.entries(EXPECTED)) {
  const commands = rows(`
    select distinct cmd
      from pg_policies
     where schemaname = 'public' and tablename = '${table}'
     order by 1
  `);

  check(
    `${table} policies cover exactly ${expected.policies.join("/")}`,
    commands.join(",") === expected.policies.join(","),
    `found: ${commands.join(", ") || "none"}`
  );
}

// ------------------------------------------------------------
// 5. Every policy is scoped by auth.uid(). None is open.
// ------------------------------------------------------------

const unscoped = rows(`
  select tablename || '.' || policyname
    from pg_policies
   where schemaname = 'public'
     and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%'
   order by 1
`);

check(
  "every policy references auth.uid()",
  unscoped.length === 0,
  unscoped.join(", ")
);

const openToAuthenticated = rows(`
  select tablename || '.' || policyname
    from pg_policies
   where schemaname = 'public'
     and 'authenticated' = any(roles)
     and (qual = 'true' or with_check = 'true')
   order by 1
`);

check(
  "no policy grants authenticated unconditional access",
  openToAuthenticated.length === 0,
  openToAuthenticated.join(", ")
);

// ------------------------------------------------------------
// 6. Column-level update grants. This is the check that catches
//    someone "fixing" a permission error by widening a grant back
//    to table level, which would silently undo design 3.0.1.
// ------------------------------------------------------------

for (const [table, expected] of Object.entries(EXPECTED)) {
  const columns = rows(`
    select column_name
      from information_schema.column_privileges
     where grantee = 'authenticated'
       and table_schema = 'public'
       and table_name = '${table}'
       and privilege_type = 'UPDATE'
     order by 1
  `);

  check(
    `${table} grants UPDATE on exactly [${expected.updatableColumns.join(", ")}]`,
    columns.join(",") === expected.updatableColumns.join(","),
    `found: ${columns.join(", ") || "none"}`
  );
}

const forgeable = rows(`
  select table_name || '.' || column_name
    from information_schema.column_privileges
   where grantee = 'authenticated'
     and table_schema = 'public'
     and privilege_type = 'UPDATE'
     and column_name in (${IMMUTABLE.map((c) => `'${c}'`).join(", ")})
   order by 1
`);

check(
  "no immutable column is grantable to authenticated",
  forgeable.length === 0,
  forgeable.join(", ")
);

// ------------------------------------------------------------
// 7. anon holds nothing at all.
// ------------------------------------------------------------

const anonGrants = rows(`
  select table_name || ':' || privilege_type
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
   order by 1
`);

check(
  "anon has zero table privileges in public",
  anonGrants.length === 0,
  anonGrants.join(", ")
);

// ------------------------------------------------------------
// 8. No function in public is executable by anon or authenticated.
//    Proves the default-privilege revoke in migration 001 took hold.
// ------------------------------------------------------------

const executable = rows(`
  select p.proname || ' by ' || r.rolname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   cross join (values ('anon'), ('authenticated')) as r(rolname)
   where n.nspname = 'public'
     and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
   order by 1
`);

check(
  "no public function is executable by anon or authenticated",
  executable.length === 0,
  executable.join(", ")
);

// ------------------------------------------------------------

const failed = results.filter((r) => !r.ok);

for (const r of results) {
  console.log(`${r.ok ? "  ok  " : "  FAIL"}  ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
}

console.log(
  `\n[rls-coverage] ${results.length - failed.length}/${results.length} checks passed`
);

if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}
