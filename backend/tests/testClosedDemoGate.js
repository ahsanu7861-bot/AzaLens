"use strict";

const assert = require("node:assert/strict");
const { authorized, credentials, enabled } = require("../middleware/closedDemoGate");

assert.equal(enabled({}), false);
assert.equal(authorized({ headers: {} }, {}), true);
assert.equal(enabled({ CLOSED_DEMO_ENABLED: "true" }), true);
assert.throws(() => credentials({ CLOSED_DEMO_ENABLED: "true" }), /requires/);

console.log("Closed-demo gate configuration tests passed.");
