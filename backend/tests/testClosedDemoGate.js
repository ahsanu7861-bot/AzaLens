"use strict";

const assert = require("node:assert/strict");
const { authorized, credentials, enabled } = require("../middleware/closedDemoGate");

assert.equal(enabled({}), false);
assert.equal(authorized({ headers: {} }, {}), true);
assert.equal(enabled({ CLOSED_DEMO_ENABLED: "true" }), true);
assert.throws(() => credentials({ CLOSED_DEMO_ENABLED: "true" }), /requires/);

console.log("Closed-demo gate configuration tests passed.");

/*
  Gate/validator coupling (PR A2).

  enabled() now shares parseFlag with scripts/validateEnvironment.js
  instead of its own permissive list-membership test. Every spelling
  the codebase defines intentionally must keep working, and a
  malformed value must never resolve quietly to false - that silent
  false is what would have left /api/watchlist and /api/portfolio
  open with no authentication and no tenant identity.
*/
for (const spelling of ["true", "1", "yes", "on", "TRUE", " true "]) {
  assert.equal(
    enabled({ CLOSED_DEMO_ENABLED: spelling }),
    true,
    `intentional true spelling ${JSON.stringify(spelling)} must enable the gate`
  );
}

for (const spelling of ["false", "0", "no", "off"]) {
  assert.equal(
    enabled({ CLOSED_DEMO_ENABLED: spelling }),
    false,
    `intentional false spelling ${JSON.stringify(spelling)} must disable the gate`
  );
}

// Absent stays false: development and test must still start with no gate.
assert.equal(enabled({}), false);
assert.equal(enabled({ CLOSED_DEMO_ENABLED: "" }), false);

// The whole point: malformed must be loud, never a silent false.
for (const malformed of ["ture", "enabled", "TRUE!", "yess", "1 0"]) {
  assert.throws(
    () => enabled({ CLOSED_DEMO_ENABLED: malformed }),
    /Invalid feature-flag value/,
    `malformed value ${JSON.stringify(malformed)} must throw, not resolve to false`
  );
}

console.log(
  "Closed demo gate: boolean parsing is canonical - all intentional " +
    "spellings preserved, malformed values rejected loudly."
);
