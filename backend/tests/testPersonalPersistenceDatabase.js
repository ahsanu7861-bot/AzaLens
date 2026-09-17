"use strict";

const assert = require("node:assert/strict");
const { readStatus, request } = require("./helpers/localSupabase");
const { createUserSupabaseClient } = require("../services/createUserSupabaseClient");
const portfolio = require("../services/portfolioService");
const watchlist = require("../services/watchlistService");

/*
  Persistence prerequisite record: migration 002's schema was verified live;
  migration 004 is applied/catalog-verified and remains inert until its RPCs
  are explicitly called; migrations 005 and 006 are applied/catalog-verified.
  Their behavior is exercised only on byte-identical disposable local
  migrations. This runtime slice depends on 002/005/006 and never contacts
  production to reconfirm them.
*/

const RUN = Date.now();
const PASSWORD = "azalens-local-test-password";

(async () => {
  const { apiUrl, publishableKey, secretKey } = readStatus();
  const admin = (path, options = {}) => request(`${apiUrl}${path}`, { apikey: secretKey, token: secretKey, ...options });
  const created = [];

  async function makeUser(label) {
    const email = `persistence-${label}-${RUN}@azalens.local`;
    const made = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password: PASSWORD, email_confirm: true } });
    assert.equal(made.ok, true, JSON.stringify(made.body));
    created.push(made.body.id);
    const signedIn = await request(`${apiUrl}/auth/v1/token?grant_type=password`, { apikey: publishableKey, method: "POST", body: { email, password: PASSWORD } });
    assert.equal(signedIn.ok, true, JSON.stringify(signedIn.body));
    return {
      id: made.body.id,
      token: signedIn.body.access_token,
      db: createUserSupabaseClient(signedIn.body.access_token, { SUPABASE_URL: apiUrl, SUPABASE_PUBLISHABLE_KEY: publishableKey }),
    };
  }

  try {
    const A = await makeUser("a");
    const B = await makeUser("b");

    const item = await watchlist.addSymbol({ db: A.db, userId: A.id, symbol: "TWELVECHARS1", note: "owned by A" });
    assert.equal(item.symbol, "TWELVECHARS1");
    assert.deepEqual(await watchlist.getWatchlist({ db: B.db, userId: B.id }), []);
    assert.equal((await watchlist.updateNote({ db: A.db, userId: A.id, symbol: "TWELVECHARS1", note: "updated" })).note, "updated");

    const exact = 12345.67890123;
    const firstWrite = await portfolio.addHolding({ db: A.db, userId: A.id, symbol: "EXACT8", shares: exact, averagePrice: exact, currency: "USD" });
    assert.equal(String(firstWrite.shares), "12345.67890123");
    assert.equal(String(firstWrite.averagePrice), "12345.67890123");
    const readBack = (await portfolio.getPortfolio({ db: A.db, userId: A.id }))[0];
    assert.equal(String(readBack.shares), "12345.67890123");
    assert.equal(String(readBack.averagePrice), "12345.67890123");
    const secondWrite = await portfolio.updateHolding({ db: A.db, userId: A.id, symbol: "EXACT8", shares: readBack.shares, averagePrice: readBack.averagePrice, currency: readBack.currency });
    assert.equal(String(secondWrite.shares), "12345.67890123");
    assert.equal(String(secondWrite.averagePrice), "12345.67890123");

    assert.deepEqual(await portfolio.getPortfolio({ db: B.db, userId: B.id }), []);
    await assert.rejects(portfolio.updateHolding({ db: B.db, userId: B.id, symbol: "EXACT8", shares: 1, averagePrice: 1 }), (error) => error.code === "HOLDING_NOT_FOUND");
    const anonymous = await request(`${apiUrl}/rest/v1/portfolio_holdings?select=*`, { apikey: publishableKey });
    assert.equal(anonymous.ok, false);

    assert.deepEqual(await watchlist.removeSymbol({ db: A.db, userId: A.id, symbol: "TWELVECHARS1" }), []);
    assert.deepEqual(await portfolio.removeHolding({ db: A.db, userId: A.id, symbol: "EXACT8" }), []);
    console.log("Request-scoped client CRUD, two-user/anonymous isolation, and exact numeric(20,8) write-read-write round trip passed against disposable local Supabase; provider calls: 0.");
  } finally {
    await Promise.all(created.map((id) => admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" })));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
