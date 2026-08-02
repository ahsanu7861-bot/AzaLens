import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/*
  Build-time guard against CSP hash drift.

  script-src pins the inline theme bootstrap in index.html by sha256 hash. That
  hash is a copy of a value derived from the built output, so the two can
  silently diverge: edit the inline script by one character and the deploy still
  succeeds, but the browser then blocks the script and every page flashes the
  wrong theme before correcting. Nothing in a normal build or test run would
  catch it.

  This runs against dist/index.html AFTER the build — the bytes the browser
  actually receives — and fails if any inline script is unaccounted for, or if
  the policy carries a hash matching nothing.

  Run with: npm run test:csp-hashes   (after npm run build)
*/

const distUrl = new URL("../dist/index.html", import.meta.url);

let dist;
try {
  dist = await readFile(distUrl, "utf8");
} catch (error) {
  if (error.code === "ENOENT") {
    console.error(
      "dist/index.html not found. Run `npm run build` before this check.",
    );
    process.exit(1);
  }
  throw error;
}

const vercelConfig = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

const policy = (vercelConfig.headers ?? [])
  .flatMap((rule) => rule.headers ?? [])
  .find(
    (header) =>
      header.key.toLowerCase() === "content-security-policy-report-only",
  )?.value;

if (!policy) {
  console.error("No Content-Security-Policy-Report-Only header in vercel.json.");
  process.exit(1);
}

const scriptSrc =
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("script-src"))
    ?.split(/\s+/)
    .slice(1) ?? [];

const policyHashes = scriptSrc.filter((source) => source.startsWith("'sha256-"));

// Inline scripts only: anything with a src attribute is covered by 'self'.
const inlineScripts = [
  ...dist.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi),
].map((match) => match[1]);

const builtHashes = inlineScripts.map(
  (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`,
);

const failures = [];

for (const [index, hash] of builtHashes.entries()) {
  if (!policyHashes.includes(hash)) {
    const preview = inlineScripts[index].trim().slice(0, 60).replace(/\s+/g, " ");
    failures.push(
      `dist/index.html inline script #${index + 1} is not allowed by the CSP.\n` +
        `      Expected script-src to contain: ${hash}\n` +
        `      Script begins: ${preview}...\n` +
        "      The inline script changed. Update the hash in vercel.json.",
    );
  }
}

for (const hash of policyHashes) {
  if (!builtHashes.includes(hash)) {
    failures.push(
      `CSP script-src carries ${hash}, which matches no inline script in ` +
        "dist/index.html. It is stale — remove it or correct it.",
    );
  }
}

const inlineHandlers = [
  ...dist.matchAll(/\son([a-z]+)\s*=\s*["'][^"']*["']/gi),
].map((match) => match[0].trim());

if (inlineHandlers.length > 0) {
  failures.push(
    `dist/index.html contains inline event handler(s) that CSP will block: ` +
      inlineHandlers.join(", "),
  );
}

if (failures.length > 0) {
  console.error("CSP hash check failed:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `[csp] Hash check passed: ${builtHashes.length} inline script(s) in ` +
    "dist/index.html, all pinned in script-src.",
);
