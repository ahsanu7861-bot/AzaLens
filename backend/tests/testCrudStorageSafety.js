"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const axios = require("axios");

// ============================================================
// AzaLens - Portfolio & Watchlist storage-safety contract tests
//
// Covers PR A2:
//
//   * record caps that never truncate, hide or rewrite existing
//     data - only the creation of a new distinct record is refused,
//     and only while count >= limit;
//   * duplicate detection running BEFORE the cap check, so a
//     duplicate at the limit still returns 409 and not 422;
//   * atomic replacement, so a rejected create leaves the storage
//     file byte-for-byte unchanged;
//   * malformed storage failing visibly instead of a watchlist
//     truncation being served as HTTP 200 with [].
//
// Storage is redirected to a temporary directory through
// AZALENS_STORAGE_DIR. The committed backend/storage files are
// never opened, and that is asserted by mtime at the end rather
// than asserted by comment.
//
// axios is replaced with throwing stubs: no provider call can be
// made from any layer. Environment variables, module state and
// temporary paths are restored in the finally block.
// ============================================================

const REAL_STORAGE_DIR = path.join(__dirname, "../storage");
const REAL_FILES = ["portfolios.json", "watchlists.json"].map((name) =>
  path.join(REAL_STORAGE_DIR, name)
);

const realStatsBefore = REAL_FILES.map((file) =>
  fs.existsSync(file) ? fs.statSync(file) : null
);

const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  APP_ENV: process.env.APP_ENV,
  CLOSED_DEMO_ENABLED: process.env.CLOSED_DEMO_ENABLED,
  AZALENS_STORAGE_DIR: process.env.AZALENS_STORAGE_DIR,
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
  TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY,
  SHARIAH_DATA_MODE: process.env.SHARIAH_DATA_MODE,
};

const TEMP_STORAGE_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "azalens-crud-safety-")
);

process.env.NODE_ENV = "test";
process.env.APP_ENV = "test";
process.env.CLOSED_DEMO_ENABLED = "false";
process.env.AZALENS_STORAGE_DIR = TEMP_STORAGE_DIR;
process.env.FINNHUB_API_KEY = "crud-safety-test-key";
process.env.TWELVE_DATA_API_KEY = "crud-safety-test-key";
process.env.SHARIAH_DATA_MODE = "offline";

const originalAxios = {};
let providerAttempts = 0;

for (const method of ["get", "post", "put", "delete", "request"]) {
  originalAxios[method] = axios[method];
  axios[method] = async (...args) => {
    providerAttempts += 1;
    throw new Error(
      `No provider call may occur in this suite: axios.${method} ${String(
        args[0]
      )}`
    );
  };
}

const {
  PORTFOLIO_RECORD_LIMIT,
} = require("../services/portfolioService");
const {
  WATCHLIST_RECORD_LIMIT,
} = require("../services/watchlistService");

// ------------------------------------------------------------
// Fixtures and helpers
// ------------------------------------------------------------

const PORTFOLIO_FILE = path.join(TEMP_STORAGE_DIR, "portfolios.json");
const WATCHLIST_FILE = path.join(TEMP_STORAGE_DIR, "watchlists.json");

function symbolFor(index) {
  // Distinct, valid, and never colliding with the symbols the
  // individual assertions add.
  return `SEED${String(index).padStart(3, "0")}`;
}

function seedPortfolio(count) {
  const now = new Date().toISOString();
  const rows = Array.from({ length: count }, (unused, index) => ({
    symbol: symbolFor(index),
    shares: 1,
    averagePrice: 1,
    addedAt: now,
    updatedAt: now,
  }));

  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(rows, null, 2));
  return rows;
}

function seedWatchlist(count) {
  const now = new Date().toISOString();
  const rows = Array.from({ length: count }, (unused, index) => ({
    symbol: symbolFor(index),
    addedAt: now,
  }));

  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(rows, null, 2));
  return rows;
}

function writeRaw(file, contents) {
  fs.writeFileSync(file, contents);
}

function bytes(file) {
  return fs.readFileSync(file);
}

const SERVER_MODULE_PATH = require.resolve("../server");

async function bootServer() {
  delete require.cache[SERVER_MODULE_PATH];

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
  const target = new URL(urlPath, baseUrl);
  const payload = body === undefined ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname,
        method,
        agent: false,
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

          resolve({ status: response.statusCode, body: parsed });
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

// Two shapes, one contract. Everything below runs identically for
// both collections so neither can drift from the other again.
const FEATURES = [
  {
    name: "portfolio",
    urlBase: "/api/portfolio",
    file: PORTFOLIO_FILE,
    limit: PORTFOLIO_RECORD_LIMIT,
    code: "PORTFOLIO_LIMIT_REACHED",
    message: "Portfolio record limit reached.",
    seed: seedPortfolio,
    createBody: (symbol) => ({ symbol, shares: 2, averagePrice: 3 }),
    supportsUpdate: true,
    updateBody: { shares: 42, averagePrice: 7 },
    duplicateStatus: 409,
  },
  {
    name: "watchlist",
    urlBase: "/api/watchlist",
    file: WATCHLIST_FILE,
    limit: WATCHLIST_RECORD_LIMIT,
    code: "WATCHLIST_LIMIT_REACHED",
    message: "Watchlist record limit reached.",
    seed: seedWatchlist,
    createBody: (symbol) => ({ symbol }),
    supportsUpdate: false,
    duplicateStatus: 409,
  },
];

function assertLimitResponse(feature, response, expectedCurrent) {
  assert.equal(
    response.status,
    422,
    `${feature.name}: a create at the limit must return 422`
  );

  // Top-level message: the field every existing client reads.
  assert.equal(
    response.body?.success,
    false,
    `${feature.name}: envelope must keep success:false`
  );
  assert.equal(
    response.body?.message,
    feature.message,
    `${feature.name}: envelope must keep a top-level message`
  );

  // Stable machine-readable contract.
  assert.equal(
    response.body?.error?.code,
    feature.code,
    `${feature.name}: stable error code`
  );
  assert.equal(
    response.body?.error?.message,
    feature.message,
    `${feature.name}: error message`
  );
  assert.equal(
    response.body?.error?.limit,
    feature.limit,
    `${feature.name}: error.limit must be the configured limit`
  );
  assert.equal(
    response.body?.error?.current,
    expectedCurrent,
    `${feature.name}: error.current must be the actual current count`
  );
}

// ------------------------------------------------------------
// 1. Below the limit
// ------------------------------------------------------------

async function testBelowLimit(feature) {
  feature.seed(feature.limit - 1);

  const { baseUrl, close } = await bootServer();

  try {
    const created = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.createBody("BELOWCAP")
    );

    assert.equal(
      created.status,
      201,
      `${feature.name}: a new distinct record below the limit must be created`
    );

    const read = await send(baseUrl, "GET", feature.urlBase);

    assert.equal(
      read.body.data.length,
      feature.limit,
      `${feature.name}: the new record must persist`
    );

    // Duplicate below the limit keeps its existing response.
    const duplicate = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.createBody("BELOWCAP")
    );

    assert.equal(
      duplicate.status,
      feature.duplicateStatus,
      `${feature.name}: duplicate below the limit must keep 409`
    );

    // Invalid input keeps its existing response.
    const invalid = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.name === "portfolio"
        ? { symbol: "not a symbol!", shares: 1, averagePrice: 1 }
        : { symbol: "not a symbol!" }
    );

    assert.equal(
      invalid.status,
      400,
      `${feature.name}: invalid input must keep 400`
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 2. Exactly at the limit
// ------------------------------------------------------------

async function testAtLimit(feature) {
  feature.seed(feature.limit);

  const { baseUrl, close } = await bootServer();

  try {
    const before = bytes(feature.file);

    const rejected = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.createBody("ATCAPNEW")
    );

    assertLimitResponse(feature, rejected, feature.limit);

    assert.ok(
      before.equals(bytes(feature.file)),
      `${feature.name}: a rejected create must leave the file byte-for-byte unchanged`
    );

    // Duplicate at the limit proves ordering: duplicate detection
    // runs first, so this must be 409 and never 422.
    const duplicate = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.createBody(symbolFor(0))
    );

    assert.equal(
      duplicate.status,
      feature.duplicateStatus,
      `${feature.name}: a duplicate at the limit must still return 409, not 422`
    );
    assert.notEqual(
      duplicate.body?.error?.code,
      feature.code,
      `${feature.name}: a duplicate must not be reported as a limit rejection`
    );

    // Updates keep working at the limit.
    if (feature.supportsUpdate) {
      const updated = await send(
        baseUrl,
        "PUT",
        `${feature.urlBase}/${symbolFor(0)}`,
        feature.updateBody
      );

      assert.equal(
        updated.status,
        200,
        `${feature.name}: an update at the limit must succeed`
      );
      assert.equal(updated.body.data.shares, 42);
    }

    // Deletes keep working, and a delete restores the ability to create.
    const removed = await send(
      baseUrl,
      "DELETE",
      `${feature.urlBase}/${symbolFor(1)}`
    );

    assert.equal(
      removed.status,
      200,
      `${feature.name}: a delete at the limit must succeed`
    );

    const createdAfterDelete = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.createBody("AFTERDEL")
    );

    assert.equal(
      createdAfterDelete.status,
      201,
      `${feature.name}: once below the limit, creation must become available again`
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 3. Already over the limit (seeded at limit + 10)
// ------------------------------------------------------------

async function testAlreadyOverLimit(feature) {
  const overCount = feature.limit + 10;
  feature.seed(overCount);

  // Startup must succeed with an over-limit file.
  const { baseUrl, close } = await bootServer();

  try {
    const read = await send(baseUrl, "GET", feature.urlBase);

    assert.equal(
      read.status,
      200,
      `${feature.name}: reads must succeed when already over the limit`
    );
    assert.equal(
      read.body.data.length,
      overCount,
      `${feature.name}: every existing record must be returned - nothing hidden or truncated`
    );
    assert.equal(
      read.body.data[0].symbol,
      symbolFor(0),
      `${feature.name}: existing records must not be rewritten or reordered`
    );
    assert.equal(
      read.body.data.at(-1).symbol,
      symbolFor(overCount - 1),
      `${feature.name}: the last record must survive intact`
    );

    const before = bytes(feature.file);

    const rejected = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.createBody("OVERCAP")
    );

    assertLimitResponse(feature, rejected, overCount);

    assert.ok(
      before.equals(bytes(feature.file)),
      `${feature.name}: a rejected create must not touch an over-limit file`
    );

    if (feature.supportsUpdate) {
      const updated = await send(
        baseUrl,
        "PUT",
        `${feature.urlBase}/${symbolFor(0)}`,
        feature.updateBody
      );

      assert.equal(
        updated.status,
        200,
        `${feature.name}: updates must succeed while over the limit`
      );

      const afterUpdate = await send(baseUrl, "GET", feature.urlBase);

      assert.equal(
        afterUpdate.body.data.length,
        overCount,
        `${feature.name}: an update must not reduce the collection`
      );
    }

    const removed = await send(
      baseUrl,
      "DELETE",
      `${feature.urlBase}/${symbolFor(0)}`
    );

    assert.equal(removed.status, 200);
    assert.equal(
      removed.body.data.length,
      overCount - 1,
      `${feature.name}: a delete must remove exactly one record`
    );

    // Walk back down to the limit; creation must stay refused the
    // whole way and become available only once strictly below it.
    for (let index = 1; index <= 10; index += 1) {
      const stillRejected = await send(
        baseUrl,
        "POST",
        feature.urlBase,
        feature.createBody("WALKDOWN")
      );

      assert.equal(
        stillRejected.status,
        422,
        `${feature.name}: creation must stay refused while count >= limit`
      );

      await send(
        baseUrl,
        "DELETE",
        `${feature.urlBase}/${symbolFor(index)}`
      );
    }

    const finalRead = await send(baseUrl, "GET", feature.urlBase);

    assert.equal(
      finalRead.body.data.length,
      feature.limit - 1,
      `${feature.name}: deletes must bring the collection below the limit`
    );

    const finallyCreated = await send(
      baseUrl,
      "POST",
      feature.urlBase,
      feature.createBody("WALKDOWN")
    );

    assert.equal(
      finallyCreated.status,
      201,
      `${feature.name}: creation must succeed once count < limit`
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 4. Malformed storage fails visibly, for BOTH collections
// ------------------------------------------------------------

async function testMalformedStorageFailsVisibly() {
  // A truncated file is exactly what an interrupted non-atomic
  // write used to leave behind.
  writeRaw(WATCHLIST_FILE, '[{"symbol":"AAA","addedAt":"x"},{"sym');
  writeRaw(
    PORTFOLIO_FILE,
    '[{"symbol":"AAA","shares":1,"averagePrice":1},{"sym'
  );

  const { baseUrl, close } = await bootServer();

  try {
    const watchlist = await send(baseUrl, "GET", "/api/watchlist");
    const portfolio = await send(baseUrl, "GET", "/api/portfolio");

    assert.equal(
      watchlist.status,
      500,
      "a truncated watchlist must fail visibly, not return 200 with []"
    );
    assert.notDeepEqual(
      watchlist.body?.data,
      [],
      "a truncated watchlist must never be reported as an empty watchlist"
    );

    assert.equal(
      portfolio.status,
      500,
      "a truncated portfolio must keep failing visibly"
    );

    assert.equal(
      watchlist.status,
      portfolio.status,
      "both collections must handle corruption consistently"
    );

    // Nothing may be silently overwritten or "repaired".
    assert.ok(
      fs
        .readFileSync(WATCHLIST_FILE, "utf8")
        .endsWith('{"sym'),
      "malformed watchlist storage must be left exactly as found"
    );
    assert.ok(
      fs
        .readFileSync(PORTFOLIO_FILE, "utf8")
        .endsWith('{"sym'),
      "malformed portfolio storage must be left exactly as found"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------
// 5. Atomic replacement leaves no temporary files behind
// ------------------------------------------------------------

async function testNoTemporaryFilesRemain() {
  seedPortfolio(2);
  seedWatchlist(2);

  const { baseUrl, close } = await bootServer();

  try {
    await send(baseUrl, "POST", "/api/portfolio", {
      symbol: "TMPCHK",
      shares: 1,
      averagePrice: 1,
    });
    await send(baseUrl, "POST", "/api/watchlist", { symbol: "TMPCHK" });

    const leftovers = fs
      .readdirSync(TEMP_STORAGE_DIR)
      .filter((name) => name.includes(".tmp"));

    assert.deepEqual(
      leftovers,
      [],
      "atomic replacement must leave no temporary files behind"
    );
  } finally {
    await close();
  }
}

// ------------------------------------------------------------

async function run() {
  try {
    for (const feature of FEATURES) {
      await testBelowLimit(feature);
      await testAtLimit(feature);
      await testAlreadyOverLimit(feature);
    }

    await testMalformedStorageFailsVisibly();
    await testNoTemporaryFilesRemain();

    assert.equal(
      providerAttempts,
      0,
      "no provider call may be attempted by this suite"
    );

    // The committed storage files must never have been opened.
    REAL_FILES.forEach((file, index) => {
      const before = realStatsBefore[index];
      const after = fs.existsSync(file) ? fs.statSync(file) : null;

      assert.equal(
        after === null,
        before === null,
        `${file} must not be created or removed by this suite`
      );

      if (before !== null) {
        assert.equal(
          after.mtimeMs,
          before.mtimeMs,
          `${file} must never be written by this suite`
        );
        assert.equal(
          after.size,
          before.size,
          `${file} must not change size`
        );
      }
    });

    console.log(
      "CRUD storage-safety tests: all scenarios passed. " +
        `Limits ${PORTFOLIO_RECORD_LIMIT}/${WATCHLIST_RECORD_LIMIT} enforced on ` +
        "creation only; existing records never truncated, hidden or rewritten. " +
        "Committed storage untouched. No provider network calls were made."
    );
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    for (const [method, original] of Object.entries(originalAxios)) {
      axios[method] = original;
    }

    delete require.cache[SERVER_MODULE_PATH];
    fs.rmSync(TEMP_STORAGE_DIR, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
