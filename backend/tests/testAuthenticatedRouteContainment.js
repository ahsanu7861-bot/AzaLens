"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const express = require("express");
const { middleware: closedDemoGate, registerClosedDemoRoutes } = require("../middleware/closedDemoGate");
const { createRequireUser } = require("../middleware/requireUser");

const ORIGIN = "https://owner.example";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TOKEN_A = "aaa.bbb.ccc";
const TOKEN_B = "ddd.eee.fff";
Object.assign(process.env, {
  NODE_ENV: "test",
  CLOSED_DEMO_ENABLED: "true",
  CLOSED_DEMO_ACCESS_CODE: "owner-fixture-only",
  CLOSED_DEMO_SIGNING_SECRET: "s".repeat(40),
  TRUSTED_FRONTEND_ORIGINS: ORIGIN,
});

let verificationCalls = 0;
let clientCalls = 0;
const logs = [];
const originalError = console.error;
console.error = (...args) => logs.push(args);

const requireUser = createRequireUser({
  verifyAccessToken: async (value) => {
    verificationCalls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    if (value === TOKEN_A) return { userId: USER_A };
    if (value === TOKEN_B) return { userId: USER_B };
    throw Object.assign(new Error(`never log ${value}`), { code: "AUTH_TOKEN_INVALID" });
  },
  createUserClient: (value) => {
    clientCalls += 1;
    return Object.freeze({ requestTokenMarker: value === TOKEN_A ? "A" : "B" });
  },
});

async function jsonRequest(base, path, { method = "GET", origin = ORIGIN, cookie, token, body, secFetchSite } = {}) {
  const headers = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  if (secFetchSite) headers["Sec-Fetch-Site"] = secFetchSite;
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { response, data: await response.json() };
}

function duplicateAuthorization(port, cookie) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1", port, path: "/fixture", method: "GET",
      headers: { Origin: ORIGIN, Cookie: cookie, Authorization: [`Bearer ${TOKEN_A}`, `Bearer ${TOKEN_B}`] },
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(body) }));
    });
    request.on("error", reject);
    request.end();
  });
}

(async () => {
  const app = express();
  app.use(express.json());
  registerClosedDemoRoutes(app);
  app.use("/fixture", closedDemoGate, requireUser);
  app.all("/fixture", (req, res) => res.json({ userId: req.user.id, client: req.db.requestTokenMarker }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    for (const options of [
      {},
      { origin: "https://evil.example", token: TOKEN_A },
      { origin: ORIGIN, token: TOKEN_A, secFetchSite: "cross-site" },
    ]) {
      const denied = await jsonRequest(base, "/fixture", options);
      assert.ok([401, 403].includes(denied.response.status));
    }
    assert.equal(verificationCalls, 0, "owner cookie/origin protections must run before JWT verification");

    const unlock = await jsonRequest(base, "/auth/demo/unlock", {
      method: "POST", body: { accessCode: "owner-fixture-only" },
    });
    assert.equal(unlock.response.status, 200);
    const cookie = unlock.response.headers.get("set-cookie").split(";")[0];

    const missing = await jsonRequest(base, "/fixture", { cookie });
    assert.equal(missing.response.status, 401);
    assert.equal(missing.data.code, "AUTH_REQUIRED");

    const duplicated = await duplicateAuthorization(port, cookie);
    assert.equal(duplicated.status, 401);
    assert.equal(duplicated.data.code, "AUTH_TOKEN_INVALID");

    const beforeOverride = verificationCalls;
    const override = await jsonRequest(base, "/fixture", {
      method: "POST", cookie, token: TOKEN_A, body: { nested: { user_id: USER_B } },
    });
    assert.equal(override.response.status, 400);
    assert.equal(override.data.code, "USER_ID_NOT_ACCEPTED");
    assert.equal(verificationCalls, beforeOverride, "caller-supplied identity is rejected before verification/client creation");

    const responses = await Promise.all(Array.from({ length: 100 }, (_, index) =>
      jsonRequest(base, "/fixture", { cookie, token: index % 2 ? TOKEN_B : TOKEN_A })
    ));
    responses.forEach(({ response, data }, index) => {
      assert.equal(response.status, 200);
      assert.equal(data.userId, index % 2 ? USER_B : USER_A);
      assert.equal(data.client, index % 2 ? "B" : "A");
    });
    assert.equal(clientCalls, 100);

    const hostile = await jsonRequest(base, "/fixture", { cookie, token: "bad.token.value" });
    assert.equal(hostile.response.status, 401);
    assert.equal(hostile.data.code, "AUTH_TOKEN_INVALID");
    assert.equal(JSON.stringify(hostile.data).includes("bad.token.value"), false);
    assert.equal(JSON.stringify(logs).includes("bad.token.value"), false);
    assert.equal(logs.length, 0);

    const serverSource = require("node:fs").readFileSync(require.resolve("../server"), "utf8");
    assert.doesNotMatch(serverSource, /require\([^)]*requireUser[^)]*\)/);
    assert.doesNotMatch(serverSource, /createRequireUser\s*\(/);

    console.error = originalError;
    console.log("Owner-first containment, strict bearer parsing, 100-request identity isolation, safe errors and dormant routing passed; provider calls: 0.");
  } finally {
    console.error = originalError;
    server.close();
    await once(server, "close");
  }
})().catch((error) => { console.error = originalError; console.error(error); process.exitCode = 1; });
