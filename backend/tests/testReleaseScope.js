"use strict";

const assert = require("node:assert/strict");

const {
  classifyRelease,
  requiresBackendDeployment,
} = require("../scripts/releaseScope");

const COMMIT =
  "6ab0fde42938a0e4f8833cbebaa9ba1069996aad";

function run() {
  assert.equal(
    requiresBackendDeployment([
      "frontend/src/services/analysis.ts",
      "frontend/package.json",
      ".github/workflows/reliability-gates.yml",
    ]),
    false
  );

  assert.deepEqual(
    classifyRelease({
      changedPaths: [
        "frontend/src/services/analysis.ts",
        "frontend/src/services/analysis.test.ts",
      ],
      commit: COMMIT,
    }),
    {
      backendChanged: false,
      expectedCommit: "",
      deploymentAttempts: 1,
    }
  );

  assert.deepEqual(
    classifyRelease({
      changedPaths: [
        "backend/server.js",
        "frontend/src/App.tsx",
      ],
      commit: COMMIT,
    }),
    {
      backendChanged: true,
      expectedCommit: COMMIT,
      deploymentAttempts: 30,
    }
  );

  assert.equal(
    requiresBackendDeployment(["render.yaml"]),
    true
  );
  assert.equal(
    requiresBackendDeployment(["render.yml"]),
    true
  );
  assert.equal(
    requiresBackendDeployment([
      "docs/backend/operations.md",
    ]),
    false
  );

  console.log(
    "Release-scope classification tests passed."
  );
}

run();
