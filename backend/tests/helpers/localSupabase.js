"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

/*
  Shared plumbing for the database tests.

  Deliberately dependency-free. Node's global fetch talks to the local
  Auth and PostgREST endpoints, and schema introspection goes through
  psql inside the database container. Adding @supabase/supabase-js would
  test the client library's behaviour as much as our policies; raw HTTP
  tests the contract the browser and backend actually speak.

  Every helper fails loudly. There is no skip-if-unavailable path: a
  missing stack, a stopped container or an unparseable status must break
  the run, not quietly pass it.
*/

const PROJECT_ROOT = path.resolve(__dirname, "../../..");

function fail(message) {
  console.error(`\n[db-test] ${message}\n`);
  process.exit(1);
}

function readStatus() {
  let raw;

  try {
    raw = execFileSync("supabase", ["status", "-o", "env"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    fail(
      "`supabase status` failed. The local stack must be running:\n" +
        "  supabase start\n\n" +
        String(error.stderr || error.message).trim()
    );
  }

  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) values[match[1]] = match[2];
  }

  const apiUrl = values.API_URL;

  // The local stack still emits legacy-style key names. The hosted
  // projects use the current publishable/secret model; that difference is
  // exactly why our own variable names spell out which key they hold.
  const publishableKey = values.PUBLISHABLE_KEY || values.ANON_KEY;
  const secretKey = values.SECRET_KEY || values.SERVICE_ROLE_KEY;

  if (!apiUrl || !publishableKey || !secretKey) {
    fail(
      "`supabase status` did not report API_URL and both keys.\n" +
        `Parsed: ${JSON.stringify(Object.keys(values))}`
    );
  }

  return { apiUrl, publishableKey, secretKey };
}

function databaseContainer() {
  let names;

  try {
    names = execFileSync(
      "docker",
      ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"],
      { encoding: "utf8" }
    )
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (error) {
    fail(`docker is not usable: ${String(error.message).trim()}`);
  }

  if (names.length !== 1) {
    fail(
      `Expected exactly one supabase_db_* container, found ${names.length}: ` +
        `${names.join(", ") || "none"}. Run \`supabase start\`.`
    );
  }

  return names[0];
}

// Runs SQL as the database superuser. Used only for schema introspection
// and for seeding, never to assert application behaviour.
function sql(query) {
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        databaseContainer(),
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-tAqc",
        query,
      ],
      { encoding: "utf8" }
    ).trim();
  } catch (error) {
    fail(
      `SQL failed:\n  ${query}\n\n${String(error.stderr || error.message).trim()}`
    );
  }
}

async function request(url, { token, apikey, method = "GET", body, prefer }) {
  const headers = { apikey, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return { status: response.status, ok: response.ok, body: parsed };
}

module.exports = {
  PROJECT_ROOT,
  databaseContainer,
  fail,
  readStatus,
  request,
  sql,
};
