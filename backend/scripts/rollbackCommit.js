"use strict";

const { execFileSync } = require("node:child_process");

function execGit(args, { cwd = process.cwd() } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = String(error.stderr || error.message || "").trim();
    throw new Error(stderr || `git ${args.join(" ")} failed.`);
  }
}

function getCommitParentCount(commit, { cwd = process.cwd() } = {}) {
  const output = execGit([
    "rev-list",
    "--parents",
    "-n",
    "1",
    commit,
  ], { cwd });

  const parts = output.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0 || parts[0] !== commit) {
    throw new Error(`Unexpected git rev-list output for ${commit}.`);
  }

  return Math.max(0, parts.length - 1);
}

function revertCommit(commit, { cwd = process.cwd() } = {}) {
  const target = String(commit || "").trim();

  if (!target) {
    throw new Error("A commit SHA is required to revert.");
  }

  const parentCount = getCommitParentCount(target, { cwd });

  if (parentCount === 0) {
    throw new Error(
      `Commit ${target} has no parents and cannot be reverted.`
    );
  }

  const args = ["revert", "--no-edit"];
  if (parentCount > 1) {
    args.push("-m", "1");
  }
  args.push(target);

  return execGit(args, { cwd });
}

function main(argv = process.argv.slice(2)) {
  const commit = String(argv[0] || process.env.FAILED_COMMIT || "").trim();

  if (!commit) {
    console.error("ERROR: FAILED_COMMIT is required.");
    process.exitCode = 1;
    return;
  }

  try {
    const result = revertCommit(commit);
    process.stdout.write(result);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  execGit,
  getCommitParentCount,
  revertCommit,
};
