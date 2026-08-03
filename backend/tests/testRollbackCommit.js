"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  getCommitParentCount,
  revertCommit,
} = require("../scripts/rollbackCommit");

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function buildFixtureRepository() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "azalens-rollback-")
  );

  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@azalens.local");
  git(root, "config", "user.name", "AzaLens Test");
  git(root, "config", "commit.gpgsign", "false");

  fs.writeFileSync(path.join(root, "README.md"), "base\n", "utf8");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");

  fs.writeFileSync(path.join(root, "frontend.txt"), "frontend\n", "utf8");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "frontend change");
  const frontendCommit = git(root, "rev-parse", "HEAD");

  git(root, "checkout", "-q", "-b", "feature");
  fs.writeFileSync(path.join(root, "backend.txt"), "backend\n", "utf8");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "backend change");
  const featureCommit = git(root, "rev-parse", "HEAD");

  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "Merge feature", "feature");
  const mergeCommit = git(root, "rev-parse", "HEAD");

  return {
    root,
    base,
    frontendCommit,
    featureCommit,
    mergeCommit,
  };
}

function run() {
  const fixture = buildFixtureRepository();

  try {
    assert.equal(
      getCommitParentCount(fixture.mergeCommit, { cwd: fixture.root }),
      2,
      "expected the fixture merge commit to have two parents"
    );

    assert.equal(
      getCommitParentCount(fixture.frontendCommit, { cwd: fixture.root }),
      1,
      "expected the direct commit to have one parent"
    );

    assert.throws(
      () => revertCommit(""),
      /required to revert/,
      "empty commit input should fail loudly"
    );

    assert.throws(
      () => revertCommit("0000000000000000000000000000000000000000", { cwd: fixture.root }),
      /fatal: bad object|git rev-list failed|Unexpected git rev-list output/,
      "invalid commit SHA should fail loudly"
    );

    assert.throws(
      () => revertCommit(fixture.base, { cwd: fixture.root }),
      /has no parents/,
      "root commit revert should fail loudly"
    );

    const initialMain = git(fixture.root, "rev-parse", "HEAD");
    assert.equal(initialMain, fixture.mergeCommit);

    assert.throws(
      () =>
        git(fixture.root, "revert", "--no-edit", fixture.mergeCommit),
      /merge commit.*-m|no -m option|cannot revert a merge commit/i,
      "raw git revert without -m should fail for merge commits"
    );

    // Revert the merge commit using the helper; it should succeed.
    revertCommit(fixture.mergeCommit, { cwd: fixture.root });
    const afterRevert = git(fixture.root, "rev-parse", "HEAD");
    assert.notEqual(
      afterRevert,
      fixture.mergeCommit,
      "reverting a merge commit should create a new commit"
    );

    const revertMessage = git(
      fixture.root,
      "log",
      "-1",
      "--pretty=%B"
    );
    assert.match(
      revertMessage,
      /Revert "Merge feature"/,
      "merge revert commit message should be preserved"
    );

    // Another repo to isolate a direct-commit revert test.
    const directRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "azalens-rollback-direct-2-"));
    git(directRoot, "init", "-q", "-b", "main");
    git(directRoot, "config", "user.email", "test@azalens.local");
    git(directRoot, "config", "user.name", "AzaLens Test");
    git(directRoot, "config", "commit.gpgsign", "false");
    fs.writeFileSync(path.join(directRoot, "README.md"), "base\n", "utf8");
    git(directRoot, "add", "-A");
    git(directRoot, "commit", "-qm", "base");
    fs.writeFileSync(path.join(directRoot, "file.txt"), "hello\n", "utf8");
    git(directRoot, "add", "-A");
    git(directRoot, "commit", "-qm", "direct change");
    const directCommit = git(directRoot, "rev-parse", "HEAD");

    revertCommit(directCommit, { cwd: directRoot });
    const directRevertMessage = git(
      directRoot,
      "log",
      "-1",
      "--pretty=%B"
    );
    assert.match(
      directRevertMessage,
      /Revert "direct change"/,
      "direct commit revert should succeed"
    );

    console.log(
      "Rollback commit regression tests passed for merge, direct, invalid, and empty input."
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

run();
