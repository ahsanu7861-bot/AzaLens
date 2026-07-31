"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");

process.env.NODE_ENV = "test";
process.env.APP_ENV = "test";
process.env.CLOSED_DEMO_ENABLED = "false";
process.env.FEATURE_SCANNER_ENABLED = "false";
process.env.SERVICE_VERSION = "9.8.7-test";

async function run() {
  const { app } = require("../server");
  const server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const rootResponse = await fetch(`${baseUrl}/`);
    const versionResponse = await fetch(`${baseUrl}/version`);
    const healthResponse = await fetch(`${baseUrl}/health`);
    const scannerResponse = await fetch(
      `${baseUrl}/api/scanner`
    );

    const root = await rootResponse.json();
    const version = await versionResponse.json();
    const health = await healthResponse.json();
    const scanner = await scannerResponse.json();

    assert.equal(rootResponse.status, 200);
    assert.equal(versionResponse.status, 200);
    assert.equal(healthResponse.status, 200);
    assert.equal(root.version, version.version);
    assert.equal(version.version, "9.8.7-test");
    assert.equal(
      health.deployment.version,
      version.version
    );

    assert.equal(version.features.scanner, false);
    assert.equal(scannerResponse.status, 404);
    assert.equal(scanner.success, false);
    assert.equal(scanner.error, "Route not found.");
    assert.ok(scanner.requestId);

    console.log(
      "Feature truthfulness: all assertions passed."
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
