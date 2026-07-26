"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function createManifest({
  commit,
  version,
  artifacts,
  createdAt = new Date().toISOString(),
}) {
  return {
    schemaVersion: 1,
    product: "AzaLens",
    version,
    commit,
    createdAt,
    artifacts: artifacts.map((filePath) => ({
      name: filePath.split("/").pop(),
      sha256: sha256(filePath),
      bytes: fs.statSync(filePath).size,
    })),
  };
}

function main() {
  const [output, ...artifacts] = process.argv.slice(2);
  if (!output || artifacts.length === 0) {
    throw new Error(
      "Usage: createReleaseManifest.js <output> <artifact...>"
    );
  }

  const manifest = createManifest({
    commit: process.env.GITHUB_SHA || "local",
    version:
      process.env.RELEASE_VERSION ||
      `0.0.0-${String(process.env.GITHUB_SHA || "local").slice(0, 7)}`,
    artifacts,
  });
  fs.writeFileSync(
    output,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

if (require.main === module) main();

module.exports = { createManifest, sha256 };
