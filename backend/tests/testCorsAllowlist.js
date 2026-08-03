"use strict";

const assert = require("node:assert/strict");

// ============================================================
// AzaLens - CORS Allowlist Contract Tests
//
// Boots the real Express app (require("../server").app) on an
// ephemeral loopback port and issues real HTTP requests with
// different Origin headers, asserting on the actual
// Access-Control-Allow-Origin response header - not a unit test of
// an extracted function, a contract test of the real middleware.
//
// environmentConfig.isProduction is read once at server.js's
// require-time, so the two environments below each re-require the
// module fresh (clearing require.cache) after setting APP_ENV, then
// restore the prior APP_ENV immediately - the already-built app
// instance keeps whatever environment it was built with.
// ============================================================

const SERVER_MODULE_PATH = require.resolve("../server");

function setOrDeleteEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// Slice 2 made server.js validate its environment before it will start, so
// booting as "production" now requires a complete production environment.
// These are structurally valid, obviously fake values - this suite tests CORS,
// not credentials, and the guard is deliberately not weakened for tests.
const PRODUCTION_FIXTURE = {
  FINNHUB_API_KEY: "test-only",
  TWELVE_DATA_API_KEY: "test-only",
  OBSERVABILITY_METRICS_TOKEN: "test-only",
  SUPABASE_URL: "https://jexphwidcfbgxpthgwum.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_notarealkey000000000",
  SUPABASE_SECRET_KEY: "sb_secret_notarealkey000000000",
};

async function bootServer(appEnv) {
  delete require.cache[SERVER_MODULE_PATH];

  const previousAppEnv = process.env.APP_ENV;
  const previousFixture = {};

  setOrDeleteEnv("APP_ENV", appEnv);

  if (appEnv === "production") {
    for (const [key, value] of Object.entries(PRODUCTION_FIXTURE)) {
      previousFixture[key] = process.env[key];
      process.env[key] = value;
    }
  }

  const { app } = require("../server");

  setOrDeleteEnv("APP_ENV", previousAppEnv);

  for (const [key, value] of Object.entries(previousFixture)) {
    setOrDeleteEnv(key, value);
  }

  const server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => {
    if (server.listening) {
      resolve();
      return;
    }

    server.once("listening", resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function close() {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  return { app, server, baseUrl, close };
}

async function fetchWithOrigin(baseUrl, origin) {
  const headers = {};

  if (origin !== undefined) {
    headers.Origin = origin;
  }

  return fetch(`${baseUrl}/health`, { headers });
}

async function assertAllowed(baseUrl, origin) {
  const response = await fetchWithOrigin(baseUrl, origin);

  assert.equal(
    response.status,
    200,
    `expected 200 for allowed origin ${origin}`
  );

  assert.equal(
    response.headers.get("access-control-allow-origin"),
    origin,
    `expected ${origin} to be reflected as an allowed CORS origin`
  );
}

async function assertRejected(baseUrl, origin) {
  const response = await fetchWithOrigin(baseUrl, origin);

  // A rejected origin still gets a normal response - cors's
  // callback(null, false) never throws, it just omits the header.
  // Only a real browser refuses to let the calling page read it.
  assert.equal(
    response.status,
    200,
    `a disallowed origin must still receive a normal response, got a non-200 for ${origin}`
  );

  assert.equal(
    response.headers.get("access-control-allow-origin"),
    null,
    `expected no CORS header for disallowed origin ${origin}`
  );
}

async function run() {
  // ------------------------------------------------------------
  // Non-production: azalens.com/www/vercel.app, both preview URL
  // shapes, and localhost/127.0.0.1 dev origins are all allowed.
  // ------------------------------------------------------------

  const dev = await bootServer("development");

  try {
    await assertAllowed(dev.baseUrl, "https://azalens.com");
    await assertAllowed(dev.baseUrl, "https://www.azalens.com");
    await assertAllowed(dev.baseUrl, "https://azalens.vercel.app");

    await assertAllowed(
      dev.baseUrl,
      "https://azalens-git-agent-sprint-47-cicd-environments-ahsan-khan2.vercel.app"
    );

    await assertAllowed(
      dev.baseUrl,
      "https://azalens-47eejjq7j-ahsan-khan2.vercel.app"
    );

    await assertRejected(
      dev.baseUrl,
      "https://azalens-evil-someoneelse.vercel.app"
    );

    await assertRejected(dev.baseUrl, "https://evil.com");

    await assertAllowed(dev.baseUrl, "http://localhost:5173");
    await assertAllowed(dev.baseUrl, "http://127.0.0.1:5173");

    // No Origin header at all - curl, CI, server-to-server calls.
    // Not a browser cross-origin request, must go through untouched.
    const noOriginResponse = await fetchWithOrigin(
      dev.baseUrl,
      undefined
    );

    assert.equal(noOriginResponse.status, 200);

    console.log(
      "Non-production CORS allowlist: all assertions passed."
    );
  } finally {
    await dev.close();
  }

  // ------------------------------------------------------------
  // Production: localhost must now be rejected, while the real
  // production domain remains allowed - proves the dev-origin
  // carve-out is actually gated on environmentConfig.isProduction
  // and doesn't leak into production.
  // ------------------------------------------------------------

  const prod = await bootServer("production");

  try {
    await assertRejected(prod.baseUrl, "http://localhost:5173");
    await assertAllowed(prod.baseUrl, "https://azalens.com");

    console.log(
      "Production CORS allowlist: all assertions passed."
    );
  } finally {
    await prod.close();
  }

  console.log("CORS allowlist contract tests: all scenarios passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
