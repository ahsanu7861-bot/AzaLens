"use strict";

const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

/*
  Classifies a release: did it change anything the backend deploys?

  The answer decides whether release-health waits for the new commit to appear
  in production, or accepts whatever is already running.

  WHY THE GIT CALL LIVES HERE. It used to live in the workflow YAML:

      git diff-tree --no-commit-id --name-only -r "$SHA" | node releaseScope.js

  `git diff-tree -r` prints NOTHING for a merge commit - a merge needs -m
  before it will emit a diff at all. So every pull request merged into main
  produced an empty path list, was classified "no backend change", and skipped
  the deployment gate. All eight merge commits on main were affected; seven of
  them contained backend changes.

  Nothing caught it because logic in YAML is reachable by no test. Moving the
  invocation into this module is most of the fix: the flags are now covered by
  tests that run against a real merge commit.

  -m              emit a diff for merge commits at all
  --first-parent  ...but only against the first parent, which on main is the
                  previous tip - exactly "what did this merge introduce"
*/

const BACKEND_DEPLOYMENT_PATHS = [
  /^backend\//,
  /^render\.ya?ml$/,
];

const DIFF_TREE_ARGS = [
  "diff-tree",
  "--no-commit-id",
  "--name-only",
  "-r",
  "-m",
  "--first-parent",
];

function requiresBackendDeployment(paths) {
  return paths.some((filePath) =>
    BACKEND_DEPLOYMENT_PATHS.some((pattern) =>
      pattern.test(String(filePath || "").trim())
    )
  );
}

/*
  Resolves the paths a commit changed, correctly for merges and non-merges.

  Throws if git fails. That matters more than it looks: the original defect was
  harmful precisely because an empty list is indistinguishable from "nothing
  changed". A shallow clone missing the first parent, a bad SHA, or any git
  error must surface as a red build, never as a silent "no backend change".
*/
function changedPathsForCommit(commit, { cwd = process.cwd() } = {}) {
  const target = String(commit || "").trim();

  if (!target) {
    throw new Error("changedPathsForCommit requires a commit reference.");
  }

  let output;
  try {
    output = execFileSync("git", [...DIFF_TREE_ARGS, target], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `git diff-tree failed for ${target}: ` +
        `${String(error.stderr || error.message).trim()}`
    );
  }

  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
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

function readPathsFromStdin() {
  return fs
    .readFileSync(0, "utf8")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/*
  Usage:
    node releaseScope.js <commit>   resolve the commit's paths here (preferred)
    ... | node releaseScope.js      read paths from stdin, for callers that
                                    already hold a list
*/
function main(argv = process.argv.slice(2)) {
  const commitArgument = String(argv[0] || "").trim();
  const commit = commitArgument || process.env.RELEASE_COMMIT;

  const changedPaths = commitArgument
    ? changedPathsForCommit(commitArgument)
    : readPathsFromStdin();

  const result = classifyRelease({ changedPaths, commit });

  writeGitHubOutput(result, process.env.GITHUB_OUTPUT);
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  DIFF_TREE_ARGS,
  changedPathsForCommit,
  classifyRelease,
  requiresBackendDeployment,
};
