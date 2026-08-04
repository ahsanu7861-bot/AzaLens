"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const Module = require("node:module");
const axios = require("axios");

// ============================================================
// AzaLens - Portfolio Intelligence Removal Contract Tests
//
// GET /api/portfolio/intelligence used to run a full master
// analysis per holding, in an uncapped loop, behind no
// authentication. It had no client on any ref in this
// repository's history. The route is now unmounted.
//
// This suite proves the four things that removal has to mean:
//
//   1. the public path is gone (404), for every method that
//      could plausibly reach it;
//   2. no request to that path can invoke getMasterAnalysis -
//      asserted with a counting spy, which is the check that
//      survives future route reshuffling;
//   3. portfolio create/read/update/delete, duplicate-symbol
//      rejection and input validation are byte-for-byte
//      unchanged;
//   4. /api/analyze/:symbol still works - the POSITIVE CONTROL
//      that stops this suite passing merely because everything
//      404s.
//
// getMasterAnalysis is stubbed with a spy before the server is
// constructed, so the analysis pipeline is never entered and no
// provider is contacted. axios.get/post/put/delete/request are
// additionally replaced with throwing stubs: any provider call
// from any layer fails the run loudly rather than silently
// reaching the network.
// ============================================================

process.env.NODE_ENV = "test";
process.env.APP_ENV = "test";
process.env.CLOSED_DEMO_ENABLED = "false";
process.env.FINNHUB_API_KEY = "portfolio-intelligence-removal-test-key";
process.env.TWELVE_DATA_API_KEY = "portfolio-intelligence-removal-test-key";
process.env.SHARIAH_DATA_MODE = "offline";
delete process.env.HALAL_TERMINAL_LIVE_ENABLED;

// ------------------------------------------------------------
// Hard network block
// ------------------------------------------------------------

const originalAxiosMethods = {};
let blockedProviderCallCount = 0;

for (const method of ["get", "post", "put", "delete", "request"]) {
  originalAxiosMethods[method] = axios[method];

  axios[method] = async (...args) => {
    blockedProviderCallCount += 1;

    throw new Error(
      `No provider call may occur in this suite: axios.${method} ${String(
        args[0]
      )}`
    );
  };
}

// ------------------------------------------------------------
// getMasterAnalysis spy, installed before the server is built
// ------------------------------------------------------------

const MASTER_ANALYSIS_PATH = require.resolve(
  "../services/masterAnalysisService"
);

let masterAnalysisCallCount = 0;
const masterAnalysisSymbols = [];

const realMasterAnalysis = require("../services/masterAnalysisService");

function installMasterAnalysisSpy() {
  const spyModule = new Module(MASTER_ANALYSIS_PATH, null);

  spyModule.filename = MASTER_ANALYSIS_PATH;
  spyModule.loaded = true;
  spyModule.exports = {
    ...realMasterAnalysis,
    getMasterAnalysis: async (symbol) => {
      masterAnalysisCallCount += 1;
      masterAnalysisSymbols.push(symbol);

      return {
        success: true,
        apiVersion: "test",
        meta: { symbol },
        data: { spy: true },
      };
    },
  };

  require.cache[MASTER_ANALYSIS_PATH] = spyModule;
}

// ------------------------------------------------------------
// Portfolio storage snapshot
//
// portfolioService derives its file path from __dirname, so it
// cannot be redirected. The committed storage file is snapshotted
// here and restored in the finally block, and the restore is
// asserted byte-for-byte at the end of the run.
// ------------------------------------------------------------

const PORTFOLIO_FILE = path.join(
  __dirname,
  "../storage/portfolios.json"
);

const portfolioSnapshot = fs.existsSync(PORTFOLIO_FILE)
  ? fs.readFileSync(PORTFOLIO_FILE)
  : null;

function restorePortfolioFile() {
  if (portfolioSnapshot === null) {
    if (fs.existsSync(PORTFOLIO_FILE)) {
      fs.unlinkSync(PORTFOLIO_FILE);
    }

    return;
  }

  fs.writeFileSync(PORTFOLIO_FILE, portfolioSnapshot);
}

// ------------------------------------------------------------
// Server harness
// ------------------------------------------------------------

const SERVER_MODULE_PATH = require.resolve("../server");

async function bootServer() {
  delete require.cache[SERVER_MODULE_PATH];
  installMasterAnalysisSpy();

  const { app } = require("../server");
  const server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}

function send(baseUrl, method, urlPath, body) {
  const http = require("node:http");
  const target = new URL(urlPath, baseUrl);
  const payload =
    body === undefined ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : {},
      },
      (response) => {
        let raw = "";

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          let parsed = null;

          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }

          resolve({
            status: response.statusCode,
            body: parsed,
            raw,
          });
        });
      }
    );

    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

// ------------------------------------------------------------
// 1. The public route is gone, and cannot reach getMasterAnalysis
// ------------------------------------------------------------

async function testIntelligencePathIsUnavailable() {
  const { baseUrl, close } = await bootServer();

  try {
    const countBefore = masterAnalysisCallCount;

    const response = await send(
      baseUrl,
      "GET",
      "/api/portfolio/intelligence"
    );

    assert.equal(
      response.status,
      404,
      "GET /api/portfolio/intelligence must be unavailable"
    );

    assert.equal(
      response.body?.success,
      false,
      "the 404 must use the standard error envelope"
    );

    assert.equal(
      response.body?.error,
      "Route not found.",
      "the 404 must come from the application's route-not-found handler"
    );

    assert.equal(
      masterAnalysisCallCount,
      countBefore,
      "a request to the removed path must not invoke getMasterAnalysis"
    );

    /*
      POST is not routed at that path either. PUT and DELETE do
      still match router.put("/:symbol") / router.delete("/:symbol")
      with symbol="intelligence", so they are handled as ordinary
      holding operations. Asserting that here records the real
      behaviour rather than leaving it to be discovered later - and
      proves neither one reaches an analysis path.
    */
    const post = await send(
      baseUrl,
      "POST",
      "/api/portfolio/intelligence"
    );

    assert.equal(
      post.status,
      404,
      "POST /api/portfolio/intelligence must be unavailable"
    );

    const put = await send(
      baseUrl,
      "PUT",
      "/api/portfolio/intelligence",
      {}
    );

    assert.equal(
      put.status,
      400,
      "PUT falls through to the holding updater and fails validation"
    );

    const remove = await send(
      baseUrl,
      "DELETE",
      "/api/portfolio/intelligence"
    );

    assert.equal(
      remove.status,
      404,
      "DELETE falls through to the holding remover and finds no holding"
    );

    assert.equal(
      masterAnalysisCallCount,
      countBefore,
      "no method on the removed path may invoke getMasterAnalysis"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 2. POSITIVE CONTROL
//
// If everything simply 404'd, test 1 would pass while proving
// nothing. /api/analyze/:symbol must still reach its handler AND
// must still increment the very spy that test 1 asserts stays
// flat.
// ------------------------------------------------------------

async function testAnalyzeRouteStillReachesTheAnalysisPipeline() {
  const { baseUrl, close } = await bootServer();

  try {
    const countBefore = masterAnalysisCallCount;

    const response = await send(
      baseUrl,
      "GET",
      "/api/analyze/AAPL"
    );

    assert.equal(
      response.status,
      200,
      "/api/analyze/:symbol must remain available"
    );

    assert.equal(
      response.body?.success,
      true,
      "/api/analyze/:symbol must return a successful envelope"
    );

    assert.equal(
      masterAnalysisCallCount,
      countBefore + 1,
      "the analyze route must invoke getMasterAnalysis exactly once - " +
        "this is what proves the spy in the removal test is live"
    );

    assert.equal(
      masterAnalysisSymbols.at(-1),
      "AAPL",
      "the spy must observe the requested symbol"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 3. Portfolio CRUD, duplicates and validation are unchanged
// ------------------------------------------------------------

async function testPortfolioCrudIsUnchanged() {
  const { baseUrl, close } = await bootServer();
  const symbol = "ZZTESTSYM";

  try {
    const countBefore = masterAnalysisCallCount;

    // READ
    const initial = await send(baseUrl, "GET", "/api/portfolio");

    assert.equal(initial.status, 200);
    assert.equal(initial.body?.success, true);
    assert.ok(
      Array.isArray(initial.body?.data),
      "GET /api/portfolio must return an array"
    );

    // CREATE
    const created = await send(
      baseUrl,
      "POST",
      "/api/portfolio",
      { symbol, shares: 3, averagePrice: 42.5 }
    );

    assert.equal(created.status, 201, "create must return 201");
    assert.equal(created.body?.data?.symbol, symbol);
    assert.equal(created.body?.data?.shares, 3);
    assert.equal(created.body?.data?.averagePrice, 42.5);

    // DUPLICATE
    const duplicate = await send(
      baseUrl,
      "POST",
      "/api/portfolio",
      { symbol, shares: 1, averagePrice: 1 }
    );

    assert.equal(
      duplicate.status,
      409,
      "a duplicate symbol must still be rejected with 409"
    );

    // INVALID INPUT
    const invalidSymbol = await send(
      baseUrl,
      "POST",
      "/api/portfolio",
      { symbol: "not a symbol!", shares: 1, averagePrice: 1 }
    );

    assert.equal(invalidSymbol.status, 400);
    assert.equal(
      invalidSymbol.body?.message,
      "A valid stock symbol is required."
    );

    const invalidShares = await send(
      baseUrl,
      "POST",
      "/api/portfolio",
      { symbol: "ZZOTHER", shares: 0, averagePrice: 1 }
    );

    assert.equal(invalidShares.status, 400);
    assert.equal(
      invalidShares.body?.message,
      "Shares must be greater than zero."
    );

    const invalidPrice = await send(
      baseUrl,
      "POST",
      "/api/portfolio",
      { symbol: "ZZOTHER", shares: 1, averagePrice: -5 }
    );

    assert.equal(invalidPrice.status, 400);
    assert.equal(
      invalidPrice.body?.message,
      "Average price must be greater than zero."
    );

    // UPDATE
    const updated = await send(
      baseUrl,
      "PUT",
      `/api/portfolio/${symbol}`,
      { shares: 7, averagePrice: 51 }
    );

    assert.equal(updated.status, 200, "update must return 200");
    assert.equal(updated.body?.data?.shares, 7);
    assert.equal(updated.body?.data?.averagePrice, 51);

    const updateMissing = await send(
      baseUrl,
      "PUT",
      "/api/portfolio/ZZNOSUCHSYM",
      { shares: 1, averagePrice: 1 }
    );

    assert.equal(
      updateMissing.status,
      404,
      "updating an absent holding must still return 404"
    );

    // DELETE
    const removed = await send(
      baseUrl,
      "DELETE",
      `/api/portfolio/${symbol}`
    );

    assert.equal(removed.status, 200, "delete must return 200");
    assert.ok(
      !removed.body?.data?.some(
        (holding) => holding.symbol === symbol
      ),
      "the deleted holding must no longer be present"
    );

    const removeMissing = await send(
      baseUrl,
      "DELETE",
      `/api/portfolio/${symbol}`
    );

    assert.equal(
      removeMissing.status,
      404,
      "removing an absent holding must still return 404"
    );

    assert.equal(
      masterAnalysisCallCount,
      countBefore,
      "no portfolio CRUD operation may invoke getMasterAnalysis"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 4. The removed route is not merely unrouted - it is also no
//    longer exempt from the global limiter.
//
// An exempt path with no route would be an unrate-limited 404,
// and a future remount would silently inherit the exemption.
// ------------------------------------------------------------

async function testRemovedPathIsNotGlobalLimiterExempt() {
  const {
    isGlobalLimiterExempt,
  } = require("../utils/rateLimitPaths");

  assert.equal(
    isGlobalLimiterExempt("/api/portfolio/intelligence"),
    false,
    "the removed path must not keep a global-limiter exemption"
  );

  assert.equal(
    isGlobalLimiterExempt("/api/analyze/AAPL"),
    true,
    "routes that do carry their own strict limiter stay exempt"
  );

  assert.equal(
    isGlobalLimiterExempt("/api/explanation/AAPL"),
    true,
    "routes that do carry their own strict limiter stay exempt"
  );
}

// ------------------------------------------------------------

async function run() {
  try {
    await testIntelligencePathIsUnavailable();
    await testAnalyzeRouteStillReachesTheAnalysisPipeline();
    await testPortfolioCrudIsUnchanged();
    await testRemovedPathIsNotGlobalLimiterExempt();

    assert.equal(
      blockedProviderCallCount,
      0,
      "no provider call may be attempted by this suite"
    );

    assert.ok(
      masterAnalysisCallCount > 0,
      "the getMasterAnalysis spy must have fired at least once - " +
        "a suite where it never fires proves nothing about the " +
        "assertions that require it to stay flat"
    );

    console.log(
      "Portfolio intelligence removal tests: all scenarios passed. " +
        `getMasterAnalysis invoked ${masterAnalysisCallCount} time(s), ` +
        "all from /api/analyze. No provider network calls were made."
    );
  } finally {
    restorePortfolioFile();

    for (const [method, original] of Object.entries(
      originalAxiosMethods
    )) {
      axios[method] = original;
    }
  }

  const restored = fs.existsSync(PORTFOLIO_FILE)
    ? fs.readFileSync(PORTFOLIO_FILE)
    : null;

  assert.ok(
    (portfolioSnapshot === null && restored === null) ||
      (portfolioSnapshot !== null &&
        restored !== null &&
        portfolioSnapshot.equals(restored)),
    "the committed portfolio storage file must be restored byte-for-byte"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
