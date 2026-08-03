"use strict";

const assert = require("node:assert/strict");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  DIFF_TREE_ARGS,
  changedPathsForCommit,
  classifyRelease,
  requiresBackendDeployment,
} = require("../scripts/releaseScope");

const COMMIT =
  "6ab0fde42938a0e4f8833cbebaa9ba1069996aad";

/*
  Builds a throwaway repository containing a real merge commit and a real
  direct-push commit.

  A hand-written fixture would not have caught the original defect: the bug was
  in how git reports a merge, so only a genuine merge commit produced by git
  can prove the fix. Everything below runs against actual git objects.
*/
function buildFixtureRepository() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "azalens-release-scope-")
  );

  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@azalens.local");
  git("config", "user.name", "AzaLens Test");
  git("config", "commit.gpgsign", "false");

  const write = (relative, contents) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, "utf8");
  };

  // Base commit on main.
  write("README.md", "base\n");
  git("add", "-A");
  git("commit", "-qm", "base");

  // A direct push to main touching only the frontend.
  write("frontend/app.ts", "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-qm", "direct frontend push");
  const directFrontendCommit = git("rev-parse", "HEAD").trim();

  // A direct push to main touching the backend.
  write("backend/server.js", "module.exports = {};\n");
  git("add", "-A");
  git("commit", "-qm", "direct backend push");
  const directBackendCommit = git("rev-parse", "HEAD").trim();

  // A feature branch changing the backend, merged with a merge commit -
  // exactly how every pull request lands on main.
  git("checkout", "-q", "-b", "feature");
  write("backend/config/thing.js", "module.exports = 1;\n");
  write("frontend/other.ts", "export const b = 2;\n");
  git("add", "-A");
  git("commit", "-qm", "feature work");
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-ff", "-m", "Merge pull request #1", "feature");
  const backendMergeCommit = git("rev-parse", "HEAD").trim();

  // A merge that touches only the frontend, to prove the fix does not simply
  // classify every merge as a backend change.
  git("checkout", "-q", "-b", "frontend-only");
  write("frontend/only.ts", "export const c = 3;\n");
  git("add", "-A");
  git("commit", "-qm", "frontend only work");
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-ff", "-m", "Merge pull request #2", "frontend-only");
  const frontendMergeCommit = git("rev-parse", "HEAD").trim();

  return {
    root,
    backendMergeCommit,
    directBackendCommit,
    directFrontendCommit,
    frontendMergeCommit,
  };
}

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

  // ----------------------------------------------------------------
  // Merge-commit handling, against real git objects.
  //
  // The defect: `git diff-tree -r <merge>` prints nothing, so every merged
  // pull request looked like an empty changeset and skipped the deployment
  // gate. Seven of the eight merges on main carried backend changes.
  // ----------------------------------------------------------------

  const fixture = buildFixtureRepository();

  try {
    // The regression the fix exists to prevent.
    const mergePaths = changedPathsForCommit(fixture.backendMergeCommit, {
      cwd: fixture.root,
    });

    assert.ok(
      mergePaths.length > 0,
      "a merge commit must report the paths it introduced, not an empty list"
    );
    assert.ok(
      mergePaths.includes("backend/config/thing.js"),
      `merge paths missing the backend file: ${mergePaths.join(", ")}`
    );
    assert.deepEqual(
      classifyRelease({
        changedPaths: mergePaths,
        commit: fixture.backendMergeCommit,
      }),
      {
        backendChanged: true,
        expectedCommit: fixture.backendMergeCommit,
        deploymentAttempts: 30,
      },
      "a merge carrying backend changes must demand the deployment gate"
    );

    // Proof the old flags really were the problem, not something else.
    const withOldFlags = execFileSync(
      "git",
      [
        "diff-tree",
        "--no-commit-id",
        "--name-only",
        "-r",
        fixture.backendMergeCommit,
      ],
      { cwd: fixture.root, encoding: "utf8" }
    )
      .split(/\r?\n/)
      .filter(Boolean);

    assert.equal(
      withOldFlags.length,
      0,
      "the old flags are expected to report nothing for a merge - if this " +
        "ever changes, the fix can be simplified"
    );

    // A merge touching only the frontend must NOT become a backend deployment.
    // Without this, the fix could 'pass' by over-triggering on every merge.
    const frontendMergePaths = changedPathsForCommit(
      fixture.frontendMergeCommit,
      { cwd: fixture.root }
    );

    assert.ok(frontendMergePaths.includes("frontend/only.ts"));
    assert.equal(
      classifyRelease({
        changedPaths: frontendMergePaths,
        commit: fixture.frontendMergeCommit,
      }).backendChanged,
      false,
      "a frontend-only merge must not demand a backend deployment"
    );

    // Direct pushes must keep behaving exactly as before.
    const directBackendPaths = changedPathsForCommit(
      fixture.directBackendCommit,
      { cwd: fixture.root }
    );
    assert.deepEqual(directBackendPaths, ["backend/server.js"]);
    assert.equal(
      classifyRelease({
        changedPaths: directBackendPaths,
        commit: fixture.directBackendCommit,
      }).backendChanged,
      true
    );

    const directFrontendPaths = changedPathsForCommit(
      fixture.directFrontendCommit,
      { cwd: fixture.root }
    );
    assert.deepEqual(directFrontendPaths, ["frontend/app.ts"]);
    assert.equal(
      classifyRelease({
        changedPaths: directFrontendPaths,
        commit: fixture.directFrontendCommit,
      }).backendChanged,
      false
    );

    // The flags are asserted explicitly. Dropping -m is the exact regression
    // that caused this, and it would otherwise be invisible.
    assert.ok(
      DIFF_TREE_ARGS.includes("-m"),
      "diff-tree needs -m or it reports nothing for merge commits"
    );
    assert.ok(
      DIFF_TREE_ARGS.includes("--first-parent"),
      "diff-tree needs --first-parent to describe what the merge introduced"
    );

    // A git failure must surface, never be mistaken for an empty changeset.
    assert.throws(
      () =>
        changedPathsForCommit("0000000000000000000000000000000000000000", {
          cwd: fixture.root,
        }),
      /git diff-tree failed/,
      "a git error must throw rather than classify as 'no backend change'"
    );

    assert.throws(
      () => changedPathsForCommit("", { cwd: fixture.root }),
      /requires a commit reference/
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }

  // The workflow must not reintroduce the raw git pipeline it used to carry.
  const workflow = fs.readFileSync(
    path.resolve(__dirname, "../../.github/workflows/release-health.yml"),
    "utf8"
  );

  assert.ok(
    !/git diff-tree[^\n]*\|\s*node/.test(workflow),
    "release-health.yml must not pipe a raw git diff-tree into releaseScope; " +
      "the invocation belongs in the script where tests can reach it"
  );
  assert.match(
    workflow,
    /node backend\/scripts\/releaseScope\.js "\$\{\{/,
    "release-health.yml must pass the commit to releaseScope.js"
  );

  console.log(
    "Release-scope classification tests passed, including real merge-commit " +
      "and direct-push fixtures."
  );
}

run();
