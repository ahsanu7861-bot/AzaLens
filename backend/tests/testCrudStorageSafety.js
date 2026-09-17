"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PORTFOLIO_RECORD_LIMIT,
  addHolding,
  canonicalDecimal,
  getPortfolio,
  removeHolding,
  updateHolding,
} = require("../services/portfolioService");
const {
  WATCHLIST_RECORD_LIMIT,
  addSymbol,
  getWatchlist,
  removeSymbol,
  updateNote,
} = require("../services/watchlistService");

function dbResult(result, calls = []) {
  return {
    from(table) {
      const call = { table, filters: [], orders: [] };
      calls.push(call);
      const query = {
        select(columns) { call.select = columns; return query; },
        insert(payload) { call.operation = "insert"; call.payload = payload; return query; },
        update(payload) { call.operation = "update"; call.payload = payload; return query; },
        delete() { call.operation = "delete"; return query; },
        eq(column, value) { call.filters.push([column, value]); return query; },
        order(column, options) { call.orders.push([column, options]); return query; },
        single() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return query;
    },
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function run() {
  assert.equal(PORTFOLIO_RECORD_LIMIT, 50);
  assert.equal(WATCHLIST_RECORD_LIMIT, 100);
  assert.throws(() => canonicalDecimal(0.1 + 0.2, "Shares"), /eight decimal/);
  assert.throws(() => canonicalDecimal(1.123456789, "Shares"), /eight decimal/);
  assert.throws(() => canonicalDecimal(Infinity, "Shares"), /finite/);
  assert.throws(() => canonicalDecimal(90_071_992.54740992, "Shares"), /exact JSON number range/);
  assert.equal(canonicalDecimal(12345.67890123, "Shares"), "12345.67890123");

  const owner = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  const row = { symbol: "EXACT", shares: "12345.67890123", average_price: "12345.67890123", currency: "USD", opened_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
  const inserted = await addHolding({ db: dbResult({ data: row, error: null }, calls), userId: owner, symbol: "EXACT", shares: 12345.67890123, averagePrice: 12345.67890123 });
  assert.equal(inserted.shares, 12345.67890123);
  assert.deepEqual(calls[0].payload, { user_id: owner, symbol: "EXACT", shares: "12345.67890123", average_price: "12345.67890123", currency: "USD" });

  const updateCalls = [];
  await updateHolding({ db: dbResult({ data: [row], error: null }, updateCalls), userId: owner, symbol: "EXACT", shares: 12345.67890123, averagePrice: 12345.67890123, currency: "USD" });
  assert.deepEqual(Object.keys(updateCalls[0].payload).sort(), ["average_price", "currency", "shares"]);
  for (const protectedColumn of ["id", "user_id", "symbol", "added_at", "opened_at", "updated_at"]) assert.equal(protectedColumn in updateCalls[0].payload, false);

  const watchCalls = [];
  await updateNote({ db: dbResult({ data: [{ symbol: "ABC", note: "note", added_at: "now" }], error: null }, watchCalls), userId: owner, symbol: "ABC", note: "note" });
  assert.deepEqual(watchCalls[0].payload, { note: "note" });
  assert.deepEqual(watchCalls[0].filters, [["user_id", owner], ["symbol", "ABC"]]);

  const listCalls = [];
  assert.deepEqual(await getPortfolio({ db: dbResult({ data: [], error: null }, listCalls), userId: owner }), []);
  assert.deepEqual(listCalls[0].filters, [["user_id", owner]]);
  assert.deepEqual(listCalls[0].orders.map(([column]) => column), ["opened_at", "symbol"]);
  const watchListCalls = [];
  assert.deepEqual(await getWatchlist({ db: dbResult({ data: [], error: null }, watchListCalls), userId: owner }), []);
  assert.deepEqual(watchListCalls[0].filters, [["user_id", owner]]);
  assert.deepEqual(watchListCalls[0].orders.map(([column]) => column), ["added_at", "symbol"]);

  await expectCode(getPortfolio({ db: null, userId: owner }), "PERSISTENCE_UNAVAILABLE");
  await expectCode(getWatchlist({ db: null, userId: owner }), "PERSISTENCE_UNAVAILABLE");
  await expectCode(addHolding({ db: dbResult({ data: null, error: { code: "23505", message: "private SQL" } }), userId: owner, symbol: "ABC", shares: 1, averagePrice: 1 }), "DUPLICATE_HOLDING");
  await expectCode(addSymbol({ db: dbResult({ data: null, error: { code: "PT422", message: "WATCHLIST_LIMIT_REACHED", details: "private" } }), userId: owner, symbol: "ABC" }), "WATCHLIST_LIMIT_REACHED");
  await expectCode(addHolding({ db: dbResult({ data: null, error: { code: "PT422", message: "PORTFOLIO_LIMIT_REACHED" } }), userId: owner, symbol: "ABC", shares: 1, averagePrice: 1 }), "PORTFOLIO_LIMIT_REACHED");
  await expectCode(removeHolding({ db: dbResult({ data: [], error: null }), userId: owner, symbol: "ABC" }), "HOLDING_NOT_FOUND");
  await expectCode(removeSymbol({ db: dbResult({ data: [], error: null }), userId: owner, symbol: "ABC" }), "WATCHLIST_NOT_FOUND");

  const runtimeFiles = ["services/watchlistService.js", "services/portfolioService.js", "routes/watchlistRoutes.js", "routes/portfolioRoutes.js", "server.js"];
  for (const relative of runtimeFiles) {
    const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
    assert.doesNotMatch(source, /watchlists\.json|portfolios\.json|AZALENS_STORAGE_DIR/);
    assert.doesNotMatch(source, /service[_-]?role/i);
  }
  const portfolioSource = fs.readFileSync(path.join(__dirname, "../services/portfolioService.js"), "utf8");
  const watchlistSource = fs.readFileSync(path.join(__dirname, "../services/watchlistService.js"), "utf8");
  const portfolioRouteSource = fs.readFileSync(path.join(__dirname, "../routes/portfolioRoutes.js"), "utf8");
  const watchlistRouteSource = fs.readFileSync(path.join(__dirname, "../routes/watchlistRoutes.js"), "utf8");
  const frontendApiSource = fs.readFileSync(path.join(__dirname, "../../frontend/src/services/api.ts"), "utf8");
  assert.doesNotMatch(portfolioSource, /25\s*AAPL|210\.50/);
  assert.match(portfolioSource, /\.eq\("user_id", userId\)/);
  assert.match(fs.readFileSync(path.join(__dirname, "../server.js"), "utf8"), /requirePersonalPersistence/);

  const runtimeRoots = ["auth", "config", "contracts", "middleware", "providers", "routes", "services", "utils"];
  const runtimeFilesDiscovered = [path.join(__dirname, "../server.js")];
  function discover(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) discover(target);
      else if (entry.name.endsWith(".js")) runtimeFilesDiscovered.push(target);
    }
  }
  runtimeRoots.forEach((root) => discover(path.join(__dirname, "..", root)));
  for (const file of runtimeFilesDiscovered) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /watchlists\.json|portfolios\.json|AZALENS_STORAGE_DIR/, `retired JSON persistence referenced by ${file}`);
  }

  function contractFailures(sources) {
    const failures = [];
    const combined = Object.values(sources).join("\n");
    if (/watchlists\.json|portfolios\.json|AZALENS_STORAGE_DIR/.test(combined)) failures.push("json-fallback");
    if (/25\s*AAPL|210\.50/.test(combined)) failures.push("fixture-seed");
    if (/createClient\(|service[_-]?role/i.test(sources.portfolio + sources.watchlist)) failures.push("global-client");
    if (!sources.portfolio.includes('.eq("user_id", userId)') || !sources.watchlist.includes('.eq("user_id", userId)')) failures.push("owner-scope");
    if (!sources.portfolioRoute.includes("{1,12}") || !sources.watchlistRoute.includes("{1,12}")) failures.push("symbol-limit");
    if (!sources.portfolio.includes("const PORTFOLIO_RECORD_LIMIT = 50")) failures.push("portfolio-limit");
    if (!sources.portfolio.includes('const payload = { shares: canonicalDecimal(shares, "Shares"), average_price: canonicalDecimal(averagePrice, "Average price"), currency };')) failures.push("protected-update");
    if (!sources.portfolio.includes("fraction.padEnd(8, \"0\")") || sources.portfolio.includes("toFixed(8)")) failures.push("decimal-rounding");
    if (!sources.frontend.includes('code === "WATCHLIST_LIMIT_REACHED"') || !sources.frontend.includes('code === "PORTFOLIO_LIMIT_REACHED"')) failures.push("generic-422");
    if (sources.portfolioRoute.includes("error.message, details") || sources.watchlistRoute.includes("error.message, details")) failures.push("sql-leak");
    return failures;
  }
  const sources = { portfolio: portfolioSource, watchlist: watchlistSource, portfolioRoute: portfolioRouteSource, watchlistRoute: watchlistRouteSource, frontend: frontendApiSource };
  assert.deepEqual(contractFailures(sources), []);
  const mutations = [
    ["json-fallback", "portfolio", (value) => `${value}\n// portfolios.json fallback via AZALENS_STORAGE_DIR`],
    ["fixture-seed", "portfolio", (value) => `${value}\n// 25 AAPL at 210.50`],
    ["global-client", "portfolio", (value) => `${value}\ncreateClient(SUPABASE_URL, service_role)`],
    ["owner-scope", "portfolio", (value) => value.replaceAll('.eq("user_id", userId)', '.eq("symbol", symbol)')],
    ["symbol-limit", "portfolioRoute", (value) => value.replace("{1,12}", "{1,15}")],
    ["portfolio-limit", "portfolio", (value) => value.replace("PORTFOLIO_RECORD_LIMIT = 50", "PORTFOLIO_RECORD_LIMIT = 100")],
    ["protected-update", "portfolio", (value) => value.replace("const payload = { shares:", "const payload = { user_id: userId, shares:")],
    ["decimal-rounding", "portfolio", (value) => `${value}\nNumber(value).toFixed(8)`],
    ["generic-422", "frontend", (value) => value.replace('code === "WATCHLIST_LIMIT_REACHED"', 'code === "IGNORED"')],
    ["sql-leak", "portfolioRoute", (value) => `${value}\nconst leaked = { error.message, details };`],
  ];
  for (const [expected, key, mutate] of mutations) {
    const mutated = { ...sources, [key]: mutate(sources[key]) };
    assert.ok(contractFailures(mutated).includes(expected), `${expected} mutation must be detected`);
  }

  console.log(`Authenticated Supabase persistence contracts and ${mutations.length} independent mutation controls passed: exact decimals, owner scope, fail-closed errors, protected updates, deterministic ordering, no JSON fallback and zero fixture import.`);
}

run().catch((error) => { console.error(error); process.exit(1); });
