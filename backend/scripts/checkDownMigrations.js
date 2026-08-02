"use strict";

const fs = require("node:fs");
const path = require("node:path");

/*
  Pairing guard for down migrations.

  Up migrations live in supabase/migrations because the Supabase CLI cannot be
  pointed elsewhere. Down migrations live in db/down-migrations, outside
  supabase/, so no CLI operation can ever execute them.

  That separation is correct but it leaves the down directory unchecked by
  default, and unchecked files rot. By the time anyone needs a down-script,
  discovering it was never written is too late. This proves the two
  directories stay in step.
*/

const MIGRATION_PATTERN =
  /^\d{14}_[a-z0-9][a-z0-9_-]*\.(js|sql)$/;

const UP_DIRECTORY = path.resolve(
  __dirname,
  "../../supabase/migrations"
);

const DOWN_DIRECTORY = path.resolve(
  __dirname,
  "../../db/down-migrations"
);

function listMigrations(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter(
      (name) =>
        !name.startsWith(".") &&
        name.toLowerCase() !== "readme.md"
    )
    .sort();
}

function inspectPairs(upDirectory, downDirectory) {
  const up = listMigrations(upDirectory);
  const down = listMigrations(downDirectory);
  const errors = [];

  for (const file of down) {
    if (!MIGRATION_PATTERN.test(file)) {
      errors.push(
        `${file} does not use YYYYMMDDHHMMSS_description.(js|sql).`
      );
    }
  }

  // 1. Every up migration has exactly one matching down script.
  // 2. Timestamps match exactly, because the filenames match exactly.
  for (const file of up) {
    const matches = down.filter(
      (candidate) => candidate === file
    );

    if (matches.length === 0) {
      errors.push(
        `${file} has no down migration. Expected db/down-migrations/${file}.`
      );
    }
  }

  // 4. No orphan down scripts.
  for (const file of down) {
    if (!up.includes(file)) {
      errors.push(
        `${file} is an orphan down migration with no matching up migration.`
      );
    }
  }

  // 3. Down ordering is the exact reverse of up ordering.
  const expectedDownOrder = [...up].reverse();
  const actualDownOrder = [...down].reverse();

  if (
    errors.length === 0 &&
    expectedDownOrder.join("|") !== actualDownOrder.join("|")
  ) {
    errors.push(
      "Down migrations do not reverse the up order. Expected " +
        `${expectedDownOrder.join(", ")} but found ${actualDownOrder.join(", ")}.`
    );
  }

  return {
    valid: errors.length === 0,
    up,
    down,
    downExecutionOrder: expectedDownOrder,
    errors,
  };
}

function main() {
  const result = inspectPairs(UP_DIRECTORY, DOWN_DIRECTORY);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  DOWN_DIRECTORY,
  UP_DIRECTORY,
  inspectPairs,
};
