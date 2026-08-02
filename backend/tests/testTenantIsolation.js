"use strict";

const { fail, readStatus, request } = require("./helpers/localSupabase");

/*
  User A cannot reach user B's data - proven against the database.

  This is the test the whole slice exists to pass. It is driven by a
  per-table permission matrix rather than one generic loop, because
  profiles, user_entitlements and user_preferences have no insert policy
  by design. A loop that inserted into every table would fail on three of
  five for reasons unrelated to isolation, and red builds that mean
  nothing train people to ignore red builds.

  Rows for the trigger-owned tables are seeded by the signup trigger,
  never by this test.

  Runs against the LOCAL stack only. It creates and deletes users, so
  pointing it at a hosted project would be destructive - it reads its
  connection details from `supabase status`, which only describes local.
*/

const RUN = Date.now();
const PASSWORD = "azalens-local-test-password";

const results = [];

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

function summarise() {
  const failed = results.filter((r) => !r.ok);

  for (const r of results) {
    console.log(`${r.ok ? "  ok  " : "  FAIL"}  ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
  }

  console.log(
    `\n[tenant-isolation] ${results.length - failed.length}/${results.length} checks passed`
  );

  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exit(1);
  }
}

async function main() {
  const { apiUrl, publishableKey, secretKey } = readStatus();

  const admin = (path, options = {}) =>
    request(`${apiUrl}${path}`, {
      apikey: secretKey,
      token: secretKey,
      ...options,
    });

  const rest = (path, token, options = {}) =>
    request(`${apiUrl}/rest/v1${path}`, {
      apikey: publishableKey,
      token,
      ...options,
    });

  const created = [];

  async function makeUser(label) {
    const email = `slice1-${label}-${RUN}@azalens.test`;
    const create = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: {
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: `Tester ${label.toUpperCase()}` },
      },
    });

    if (!create.ok) {
      fail(`could not create user ${label}: ${JSON.stringify(create.body)}`);
    }

    created.push(create.body.id);

    const signIn = await request(
      `${apiUrl}/auth/v1/token?grant_type=password`,
      { apikey: publishableKey, method: "POST", body: { email, password: PASSWORD } }
    );

    if (!signIn.ok) {
      fail(`could not sign in user ${label}: ${JSON.stringify(signIn.body)}`);
    }

    return { id: create.body.id, email, token: signIn.body.access_token };
  }

  try {
    const A = await makeUser("a");
    const B = await makeUser("b");

    // ----------------------------------------------------------
    // The signup trigger seeded three rows per user.
    // ----------------------------------------------------------
    for (const [table, key] of [
      ["profiles", "id"],
      ["user_entitlements", "user_id"],
      ["user_preferences", "user_id"],
    ]) {
      const own = await rest(`/${table}?select=*`, A.token);
      check(
        `signup trigger seeded ${table} for A`,
        own.ok && Array.isArray(own.body) && own.body.length === 1 &&
          own.body[0][key] === A.id,
        `status=${own.status} rows=${Array.isArray(own.body) ? own.body.length : "?"}`
      );
    }

    const tier = await rest("/user_entitlements?select=tier", A.token);
    check(
      "A's tier defaults to free",
      tier.ok && tier.body?.[0]?.tier === "free",
      `tier=${tier.body?.[0]?.tier}`
    );

    // ----------------------------------------------------------
    // Positive path - A may do exactly what the matrix allows.
    // ----------------------------------------------------------
    const renamed = await rest(`/profiles?id=eq.${A.id}`, A.token, {
      method: "PATCH",
      body: { display_name: "Renamed A" },
      prefer: "return=representation",
    });
    check(
      "A can update own display_name",
      renamed.ok && renamed.body?.[0]?.display_name === "Renamed A",
      `status=${renamed.status}`
    );

    const prefs = await rest(`/user_preferences?user_id=eq.${A.id}`, A.token, {
      method: "PATCH",
      body: { theme: "dark" },
      prefer: "return=representation",
    });
    check(
      "A can update own preferences",
      prefs.ok && prefs.body?.[0]?.theme === "dark",
      `status=${prefs.status}`
    );

    const addWatch = await rest("/watchlists", A.token, {
      method: "POST",
      body: { user_id: A.id, symbol: "AAPL", note: "first" },
      prefer: "return=representation",
    });
    check("A can insert a watchlist row", addWatch.ok, `status=${addWatch.status}`);
    const watchId = addWatch.body?.[0]?.id;

    const addHolding = await rest("/portfolio_holdings", A.token, {
      method: "POST",
      body: { user_id: A.id, symbol: "AAPL", shares: 10, average_price: 100 },
      prefer: "return=representation",
    });
    check("A can insert a holding", addHolding.ok, `status=${addHolding.status}`);
    const holdingId = addHolding.body?.[0]?.id;
    const holdingUpdatedAt = addHolding.body?.[0]?.updated_at;

    // ----------------------------------------------------------
    // Absent permissions asserted as positives.
    // ----------------------------------------------------------
    const selfInsertProfile = await rest("/profiles", A.token, {
      method: "POST",
      body: { id: A.id, display_name: "duplicate" },
    });
    check(
      "A cannot insert into profiles",
      !selfInsertProfile.ok,
      `status=${selfInsertProfile.status}`
    );

    const selfInsertPrefs = await rest("/user_preferences", A.token, {
      method: "POST",
      body: { user_id: A.id },
    });
    check(
      "A cannot insert into user_preferences",
      !selfInsertPrefs.ok,
      `status=${selfInsertPrefs.status}`
    );

    const selfGrantPro = await rest(`/user_entitlements?user_id=eq.${A.id}`, A.token, {
      method: "PATCH",
      body: { tier: "pro" },
      prefer: "return=representation",
    });
    check(
      "A cannot grant themselves tier=pro",
      !selfGrantPro.ok ||
        (Array.isArray(selfGrantPro.body) && selfGrantPro.body.length === 0),
      `status=${selfGrantPro.status}`
    );

    const tierAfter = await rest("/user_entitlements?select=tier", A.token);
    check(
      "A's tier is still free afterwards",
      tierAfter.body?.[0]?.tier === "free",
      `tier=${tierAfter.body?.[0]?.tier}`
    );

    const deleteProfile = await rest(`/profiles?id=eq.${A.id}`, A.token, {
      method: "DELETE",
      prefer: "return=representation",
    });
    check(
      "A cannot delete own profile row",
      !deleteProfile.ok ||
        (Array.isArray(deleteProfile.body) && deleteProfile.body.length === 0),
      `status=${deleteProfile.status}`
    );

    // ----------------------------------------------------------
    // Cross-user denial - every applicable operation, every table.
    // ----------------------------------------------------------
    for (const table of [
      "profiles",
      "user_entitlements",
      "user_preferences",
      "watchlists",
      "portfolio_holdings",
    ]) {
      const asB = await rest(`/${table}?select=*`, B.token);
      const rowsOfA = Array.isArray(asB.body)
        ? asB.body.filter((row) => (row.user_id ?? row.id) === A.id)
        : [];
      check(
        `B sees none of A's ${table} rows`,
        asB.ok && rowsOfA.length === 0,
        `status=${asB.status} foreignRows=${rowsOfA.length}`
      );
    }

    const bReadsAWatchlist = await rest(
      `/watchlists?id=eq.${watchId}&select=*`,
      B.token
    );
    check(
      "B cannot read A's watchlist row by id",
      bReadsAWatchlist.ok && bReadsAWatchlist.body.length === 0,
      `rows=${bReadsAWatchlist.body?.length}`
    );

    const bUpdatesA = await rest(`/watchlists?id=eq.${watchId}`, B.token, {
      method: "PATCH",
      body: { note: "hijacked" },
      prefer: "return=representation",
    });
    check(
      "B cannot update A's watchlist row",
      !bUpdatesA.ok || bUpdatesA.body.length === 0,
      `status=${bUpdatesA.status}`
    );

    const stillMine = await rest(`/watchlists?id=eq.${watchId}&select=note`, A.token);
    check(
      "A's watchlist note is unchanged after B's update attempt",
      stillMine.body?.[0]?.note === "first",
      `note=${stillMine.body?.[0]?.note}`
    );

    const bDeletesA = await rest(`/watchlists?id=eq.${watchId}`, B.token, {
      method: "DELETE",
      prefer: "return=representation",
    });
    check(
      "B cannot delete A's watchlist row",
      !bDeletesA.ok || bDeletesA.body.length === 0,
      `status=${bDeletesA.status}`
    );

    const stillThere = await rest(`/watchlists?id=eq.${watchId}&select=id`, A.token);
    check(
      "A's watchlist row still exists after B's delete attempt",
      stillThere.body?.length === 1,
      `rows=${stillThere.body?.length}`
    );

    const bImpersonates = await rest("/watchlists", B.token, {
      method: "POST",
      body: { user_id: A.id, symbol: "MSFT" },
    });
    check(
      "B cannot insert a watchlist row owned by A",
      !bImpersonates.ok,
      `status=${bImpersonates.status}`
    );

    const bImpersonatesHolding = await rest("/portfolio_holdings", B.token, {
      method: "POST",
      body: { user_id: A.id, symbol: "MSFT", shares: 1, average_price: 1 },
    });
    check(
      "B cannot insert a holding owned by A",
      !bImpersonatesHolding.ok,
      `status=${bImpersonatesHolding.status}`
    );

    // ----------------------------------------------------------
    // Anonymous - the publishable key alone grants nothing.
    // ----------------------------------------------------------
    for (const table of [
      "profiles",
      "user_entitlements",
      "user_preferences",
      "watchlists",
      "portfolio_holdings",
    ]) {
      const anon = await rest(`/${table}?select=*`, undefined);
      check(
        `anonymous cannot read ${table}`,
        !anon.ok || (Array.isArray(anon.body) && anon.body.length === 0),
        `status=${anon.status} rows=${Array.isArray(anon.body) ? anon.body.length : "?"}`
      );
    }

    const anonInsert = await rest("/watchlists", undefined, {
      method: "POST",
      body: { user_id: A.id, symbol: "TSLA" },
    });
    check(
      "anonymous cannot insert",
      !anonInsert.ok,
      `status=${anonInsert.status}`
    );

    // ----------------------------------------------------------
    // Ownership reassignment and immutable columns (design 3.0.1).
    // ----------------------------------------------------------
    const reassign = await rest(`/watchlists?id=eq.${watchId}`, A.token, {
      method: "PATCH",
      body: { user_id: B.id },
      prefer: "return=representation",
    });
    check(
      "A cannot reassign own row to B",
      !reassign.ok || reassign.body.length === 0,
      `status=${reassign.status}`
    );

    const backdate = await rest(`/watchlists?id=eq.${watchId}`, A.token, {
      method: "PATCH",
      body: { added_at: "2000-01-01T00:00:00Z" },
      prefer: "return=representation",
    });
    check(
      "A cannot rewrite added_at",
      !backdate.ok || backdate.body.length === 0,
      `status=${backdate.status}`
    );

    const backdateOpened = await rest(
      `/portfolio_holdings?id=eq.${holdingId}`,
      A.token,
      {
        method: "PATCH",
        body: { opened_at: "2000-01-01T00:00:00Z" },
        prefer: "return=representation",
      }
    );
    check(
      "A cannot rewrite opened_at",
      !backdateOpened.ok || backdateOpened.body.length === 0,
      `status=${backdateOpened.status}`
    );

    const forgeUpdatedAt = await rest(
      `/portfolio_holdings?id=eq.${holdingId}`,
      A.token,
      {
        method: "PATCH",
        body: { updated_at: "2000-01-01T00:00:00Z" },
        prefer: "return=representation",
      }
    );
    check(
      "A cannot rewrite updated_at",
      !forgeUpdatedAt.ok || forgeUpdatedAt.body.length === 0,
      `status=${forgeUpdatedAt.status}`
    );

    // The other half: blocking the write must not have broken the trigger.
    const legitimate = await rest(
      `/portfolio_holdings?id=eq.${holdingId}`,
      A.token,
      {
        method: "PATCH",
        body: { shares: 12 },
        prefer: "return=representation",
      }
    );
    check(
      "A can still update shares",
      legitimate.ok && Number(legitimate.body?.[0]?.shares) === 12,
      `status=${legitimate.status}`
    );
    check(
      "updated_at still moves on its own",
      legitimate.body?.[0]?.updated_at &&
        legitimate.body[0].updated_at !== holdingUpdatedAt,
      `before=${holdingUpdatedAt} after=${legitimate.body?.[0]?.updated_at}`
    );

    // ----------------------------------------------------------
    // Deleting a user cascades.
    // ----------------------------------------------------------
    await admin(`/auth/v1/admin/users/${B.id}`, { method: "DELETE" });
    created.splice(created.indexOf(B.id), 1);

    const orphanCheck = await rest(
      `/profiles?id=eq.${B.id}&select=id`,
      A.token
    );
    check(
      "deleting a user leaves no readable profile row",
      Array.isArray(orphanCheck.body) && orphanCheck.body.length === 0,
      `rows=${orphanCheck.body?.length}`
    );
  } finally {
    for (const id of created) {
      await request(`${apiUrl}/auth/v1/admin/users/${id}`, {
        apikey: secretKey,
        token: secretKey,
        method: "DELETE",
      }).catch(() => {});
    }
  }

  summarise();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
