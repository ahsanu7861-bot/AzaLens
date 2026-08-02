"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MIGRATION_PATTERN =
  /^\d{14}_[a-z0-9][a-z0-9_-]*\.(js|sql)$/;

function inspectMigrations(directory) {
  if (!fs.existsSync(directory)) {
    return { valid: true, files: [], errors: [] };
  }

  const files = fs
    .readdirSync(directory)
    .filter(
      (name) =>
        !name.startsWith(".") &&
        name.toLowerCase() !== "readme.md"
    )
    .sort();
  const errors = [];
  const timestamps = new Set();

  for (const file of files) {
    if (!MIGRATION_PATTERN.test(file)) {
      errors.push(
        `${file} does not use YYYYMMDDHHMMSS_description.(js|sql).`
      );
      continue;
    }

    const timestamp = file.slice(0, 14);
    if (timestamps.has(timestamp)) {
      errors.push(
        `${file} duplicates migration timestamp ${timestamp}.`
      );
    }
    timestamps.add(timestamp);
  }

  return { valid: errors.length === 0, files, errors };
}

// Up migrations live in supabase/migrations because the Supabase CLI cannot be
// pointed elsewhere - see db/README.md for the evidence.
const MIGRATIONS_DIRECTORY = path.resolve(
  __dirname,
  "../../supabase/migrations"
);

function main() {
  const result = inspectMigrations(MIGRATIONS_DIRECTORY);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { MIGRATIONS_DIRECTORY, inspectMigrations };
