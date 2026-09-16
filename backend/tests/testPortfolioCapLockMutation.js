"use strict";

/*
  Load-bearing concurrency proof for migration 006. This runs only on the
  disposable local stack. It replaces the installed function temporarily,
  removes the owner lock, widens the race window, runs all three synchronized
  rounds even after an early near-miss, and restores the exact original
  function definition in finally.
*/

const { readStatus, request, sql } = require("./helpers/localSupabase");
const { apiUrl, publishableKey, secretKey } = readStatus();

const RUN = Date.now();
const PASSWORD = "azalens-local-mutation-password";
const CAP = 50;
const CONCURRENCY = 12;
const ROUNDS = 3;
const created = [];

const admin = (path, options = {}) =>
  request(`${apiUrl}${path}`, { apikey: secretKey, token: secretKey, ...options });
const rest = (path, token, options = {}) =>
  request(`${apiUrl}/rest/v1${path}`, { apikey: publishableKey, token, ...options });

async function makeUser() {
  const email = `pcap-lock-mutant-${RUN}@azalens.local`;
  const made = await admin("/auth/v1/admin/users", {
    method: "POST", body: { email, password: PASSWORD, email_confirm: true },
  });
  if (!made.ok) throw new Error(`could not create mutation user: ${made.status}`);
  created.push(made.body.id);
  const login = await request(`${apiUrl}/auth/v1/token?grant_type=password`, {
    apikey: publishableKey, method: "POST", body: { email, password: PASSWORD },
  });
  if (!login.ok) throw new Error(`could not sign in mutation user: ${login.status}`);
  return { id: made.body.id, token: login.body.access_token };
}

const symbol = (round, n) => `LM${round}${String(n).padStart(3, "0")}`;
async function clear(user) {
  const response = await rest(`/portfolio_holdings?user_id=eq.${user.id}`, user.token, { method: "DELETE" });
  if (!response.ok) throw new Error(`mutation cleanup failed: ${response.status}`);
}
async function seed49(user, round) {
  const body = Array.from({ length: CAP - 1 }, (_, n) => ({
    user_id: user.id, symbol: symbol(round, n), shares: 1, average_price: 10, currency: "USD",
  }));
  const response = await rest("/portfolio_holdings", user.token, {
    method: "POST", body, prefer: "return=minimal",
  });
  if (!response.ok) throw new Error(`mutation seed failed: ${response.status}`);
}
async function insert(user, round, n) {
  return rest("/portfolio_holdings", user.token, {
    method: "POST",
    body: { user_id: user.id, symbol: `LR${round}${String(n).padStart(3, "0")}`, shares: 1, average_price: 10, currency: "USD" },
    prefer: "return=minimal",
  });
}
async function count(user) {
  const response = await rest("/portfolio_holdings?select=id", user.token);
  if (!response.ok || !Array.isArray(response.body)) throw new Error("mutation count failed");
  return response.body.length;
}

const definitionQuery = `
  select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='enforce_portfolio_holding_cap'
`;

(async () => {
  const original = sql(definitionQuery);
  if (!original.includes("pg_catalog.pg_advisory_xact_lock")) {
    throw new Error("installed function lacks the expected lock before mutation");
  }
  let mutant = original.replace(
    /perform pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(new\.user_id::text, 0\)\s*\);/,
    "-- owner lock deliberately removed by local mutation proof"
  );
  mutant = mutant.replace(
    /where user_id = new\.user_id;\n\n  if v_current >= v_limit then/,
    "where user_id = new.user_id;\n\n  perform pg_catalog.pg_sleep(0.35);\n\n  if v_current >= v_limit then"
  );
  if (mutant === original || mutant.includes("pg_catalog.pg_advisory_xact_lock")) {
    throw new Error("lock mutation did not produce the intended function");
  }

  let user;
  const rounds = [];
  let primaryError;
  try {
    user = await makeUser();
    for (let round = 1; round <= ROUNDS; round += 1) {
      sql(original);
      await clear(user);
      await seed49(user, round);
      sql(mutant);
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const attempts = Array.from({ length: CONCURRENCY }, (_, n) => gate.then(() => insert(user, round, n)));
      release();
      const responses = await Promise.all(attempts);
      rounds.push({
        round,
        accepted: responses.filter((response) => response.status === 201).length,
        capped: responses.filter((response) => response.status === 422).length,
        final: await count(user),
      });
      sql(original);
    }
    if (!rounds.some((round) => round.final > CAP || round.accepted > 1)) {
      throw new Error(`removing the lock did not expose a breach in ${ROUNDS} rounds: ${JSON.stringify(rounds)}`);
    }
  } catch (error) {
    primaryError = error;
  } finally {
    try { sql(original); } catch (error) {
      throw new Error(`could not restore exact function definition: ${error.message}`);
    }
    if (user) await clear(user).catch(() => {});
    for (const id of created) {
      await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
    }
  }

  const restored = sql(definitionQuery);
  if (restored !== original) throw new Error("function definition was not restored byte-exactly");
  if (primaryError) throw primaryError;
  console.log(`Portfolio cap no-lock mutation failed safely across all ${ROUNDS} rounds: ${JSON.stringify(rounds)}`);
})().catch(async (error) => {
  for (const id of created) {
    await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
  }
  console.error(`Portfolio cap lock mutation proof failed: ${error.message}`);
  process.exit(1);
});
