import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

/*
  Design §7.5 — privilege containment.

  The secret key maps to the service_role Postgres role and bypasses every
  row-level security policy. Its entire safety rests on never leaving the
  backend. This proves it never reaches anything the browser can read: frontend
  source, the deployment configuration, or the built bundle.

  WHAT THIS DOES NOT DO, DELIBERATELY: it does not flag the bare word
  "service_role". That is a legitimate Postgres role name appearing throughout
  supabase/migrations, db/down-migrations, the database tests and the design
  document. A scan that treated every occurrence as a leaked credential would
  fail on correct SQL, and a check that cries wolf on correct code gets
  disabled. The dangerous thing is the *key*, and the key is identifiable by
  its own prefix.

  Scope is frontend-only by construction: source, vercel.json, and dist. Backend
  files are out of scope because the secret key legitimately lives there.
*/

const ROOT = new URL("..", import.meta.url).pathname;

// The literal patterns that indicate privileged key material.
const FORBIDDEN_PATTERNS = [
  {
    pattern: /SUPABASE_SECRET_KEY/,
    label: "SUPABASE_SECRET_KEY",
    why: "the secret-key variable name must not appear in client-reachable code",
  },
  {
    pattern: /sb_secret_/,
    label: "sb_secret_",
    why: "this is the literal prefix of a Supabase secret key",
  },
];

// Public and expected. Named so a reviewer can see what is allowed through.
const ALLOWED_PUBLIC_PATTERNS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "sb_publishable_",
];

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "playwright-report",
  "test-results",
  ".vercel",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".html", ".css", ".md", ".txt", ".env", ".example",
]);

const failures = [];
const scanned = { files: 0, bytes: 0 };

function isTextFile(name) {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot));
}

async function walk(directory, onFile) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      await walk(full, onFile);
    } else if (entry.isFile()) {
      await onFile(full);
    }
  }
}

async function scanFile(absolutePath, { requireText = false } = {}) {
  const name = absolutePath.split("/").pop();
  if (!requireText && !isTextFile(name)) return;

  let content;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch {
    return;
  }

  scanned.files += 1;
  scanned.bytes += content.length;

  const shown = relative(ROOT, absolutePath);

  for (const { pattern, label, why } of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      // Report the location only. Never echo the surrounding text - that would
      // print the very secret this check exists to keep out of logs.
      failures.push(`${shown} contains "${label}" — ${why}.`);
    }
  }

  // A VITE_-prefixed variable must never hold secret-shaped material.
  for (const match of content.matchAll(/VITE_[A-Z0-9_]+/g)) {
    if (/SECRET/.test(match[0])) {
      failures.push(
        `${shown} declares ${match[0]} — no VITE_ variable may hold a secret; ` +
          "everything VITE_ prefixed is compiled into the public bundle.",
      );
    }
  }
}

// 1. Frontend source and configuration.
await walk(join(ROOT, "src"), (file) => scanFile(file));
await scanFile(join(ROOT, "vercel.json"), { requireText: true });
await scanFile(join(ROOT, "index.html"), { requireText: true });

const envExample = join(ROOT, ".env.example");
try {
  await stat(envExample);
  await scanFile(envExample, { requireText: true });
} catch {
  failures.push(
    ".env.example is missing. The frontend template must exist and must " +
      "document that only public values belong in VITE_ variables.",
  );
}

// 2. The built bundle — what the browser actually receives.
const dist = join(ROOT, "dist");
let distExists = false;
try {
  await stat(dist);
  distExists = true;
} catch {
  distExists = false;
}

if (!distExists) {
  console.error(
    "dist/ not found. Run `npm run build` first — this check must inspect the " +
      "bundle the browser receives, not only the source it was built from.",
  );
  process.exit(1);
}

await walk(dist, (file) => scanFile(file, { requireText: true }));

// ------------------------------------------------------------------

if (failures.length > 0) {
  console.error("Privilege containment check failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nThe Supabase secret key bypasses every row-level security policy. " +
      "It must never reach anything the browser can read.",
  );
  process.exit(1);
}

console.log(
  `[privilege] Containment verified across ${scanned.files} frontend files ` +
    `(source, config, and dist).`,
);
console.log(
  `[privilege] Public values permitted: ${ALLOWED_PUBLIC_PATTERNS.join(", ")}.`,
);
console.log(
  '[privilege] The Postgres role name "service_role" is deliberately NOT ' +
    "treated as a secret — it is legitimate SQL.",
);
