"use strict";

const fs = require("node:fs");

const BACKEND_DEPLOYMENT_PATHS = [
  /^backend\//,
  /^render\.ya?ml$/,
];

function requiresBackendDeployment(paths) {
  return paths.some((filePath) =>
    BACKEND_DEPLOYMENT_PATHS.some((pattern) =>
      pattern.test(String(filePath || "").trim())
    )
  );
}

function classifyRelease({
  changedPaths = [],
  commit = "",
} = {}) {
  const backendChanged =
    requiresBackendDeployment(changedPaths);

  return {
    backendChanged,
    expectedCommit: backendChanged
      ? String(commit || "").trim()
      : "",
    deploymentAttempts: backendChanged ? 30 : 1,
  };
}

function writeGitHubOutput(result, outputPath) {
  if (!outputPath) {
    return;
  }

  fs.appendFileSync(
    outputPath,
    [
      `backend_changed=${result.backendChanged}`,
      `expected_commit=${result.expectedCommit}`,
      `deployment_attempts=${result.deploymentAttempts}`,
      "",
    ].join("\n"),
    "utf8"
  );
}

function main() {
  const changedPaths = fs
    .readFileSync(0, "utf8")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  const result = classifyRelease({
    changedPaths,
    commit: process.env.RELEASE_COMMIT,
  });

  writeGitHubOutput(
    result,
    process.env.GITHUB_OUTPUT
  );
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  classifyRelease,
  requiresBackendDeployment,
};
