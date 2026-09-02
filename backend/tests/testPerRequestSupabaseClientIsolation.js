"use strict";

const assert = require("node:assert/strict");
const { createUserSupabaseClient } = require("../services/createUserSupabaseClient");

const env = {
  SUPABASE_URL: "https://xhxlgalaytuqdnmmwypv.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_not_a_credential",
};

const created = [];
function factory(url, key, options) {
  const client = { identity: Symbol("request-client"), url, key, options };
  created.push(client);
  return client;
}

(async () => {
  const tokens = Array.from({ length: 100 }, (_, index) => `fixture.${index}.signature`);
  const clients = await Promise.all(tokens.map(async (value) => {
    await new Promise((resolve) => setImmediate(resolve));
    return createUserSupabaseClient(value, env, factory);
  }));

  assert.equal(created.length, tokens.length);
  assert.equal(new Set(clients.map((client) => client.identity)).size, tokens.length);
  clients.forEach((client, index) => {
    assert.equal(client.url, env.SUPABASE_URL);
    assert.equal(client.key, env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(client.options.global.headers.Authorization, `Bearer ${tokens[index]}`);
    assert.deepEqual(client.options.auth, {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    });
  });

  const source = require("node:fs").readFileSync(require.resolve("../services/createUserSupabaseClient"), "utf8");
  assert.doesNotMatch(source, /setSession\s*\(/);
  assert.doesNotMatch(source, /module[-_ ]level|cached client/i);
  console.log("100 concurrent per-request Supabase clients remained isolated with no Authorization leakage; network/provider calls: 0.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
