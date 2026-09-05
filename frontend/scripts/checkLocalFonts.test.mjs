import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Durable proof that scripts/checkLocalFonts.mjs still refuses what it exists
 * to refuse.
 *
 * CI runs the checker exactly once per job, against a tree that is already
 * correct. That proves the tree, never the checker: a checker whose
 * missing-asset branch, sha256 comparison or forbidden-host scan had been
 * weakened would produce the identical green line. Every mutation proof this
 * file performs was previously done by hand in a throwaway copy and discarded,
 * so nothing stopped the checker from decaying between sessions.
 *
 * Method. Each test copies the exact bytes the checker reads - the script, the
 * provenance manifest, public/fonts, src/fonts.css, src/index.css, index.html -
 * into a temporary tree, damages the copy, and runs the real CLI against it as
 * a subprocess. The command-line behaviour under test is therefore the shipped
 * one, byte for byte, with no extraction or refactor; `root` resolves from
 * import.meta.url, so the copied script reads the copied tree and never the
 * repository. The repository digests recorded in beforeAll are re-checked in
 * afterAll to prove no test touched a real asset.
 */

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = dirname(scriptsDir);
const CHECKER = "scripts/checkLocalFonts.mjs";

/** Everything the source contract reads, plus the checker itself. */
const FIXTURE_PATHS = [
  CHECKER,
  "font-provenance",
  "public/fonts",
  "src/fonts.css",
  "src/index.css",
  "index.html",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Digest of a file, or of a directory's full contents, in a stable order. */
function digestOf(root, relativePath) {
  const absolute = join(root, relativePath);
  const hash = createHash("sha256");
  const walk = (path, label) => {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      hash.update(`FILE ${label} ${sha256(readFileSync(path))}\n`);
      return;
    }
    // Sort by code unit, not by locale: `localeCompare` would make this digest
    // depend on the machine's collation.
    for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      walk(join(path, entry.name), `${label}/${entry.name}`);
    }
  };
  walk(absolute, relativePath);
  return hash.digest("hex");
}

let repositoryDigests;
let temporaryRoot;

beforeAll(() => {
  repositoryDigests = FIXTURE_PATHS.map((path) => [path, digestOf(frontendRoot, path)]);
  temporaryRoot = mkdtempSync(join(tmpdir(), "azalens-fonts-"));
});

afterAll(() => {
  // The tests are only honest if none of them reached out of its sandbox.
  const now = FIXTURE_PATHS.map((path) => [path, digestOf(frontendRoot, path)]);
  expect(now).toEqual(repositoryDigests);
  rmSync(temporaryRoot, { recursive: true, force: true });
});

let fixtureSerial = 0;

/** A private copy of the read set, damaged freely by the caller. */
function fixture() {
  const root = join(temporaryRoot, `fx-${(fixtureSerial += 1)}`);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });
  cpSync(join(frontendRoot, CHECKER), join(root, CHECKER));
  cpSync(join(frontendRoot, "font-provenance"), join(root, "font-provenance"), { recursive: true });
  cpSync(join(frontendRoot, "public/fonts"), join(root, "public/fonts"), { recursive: true });
  cpSync(join(frontendRoot, "src/fonts.css"), join(root, "src/fonts.css"));
  cpSync(join(frontendRoot, "src/index.css"), join(root, "src/index.css"));
  cpSync(join(frontendRoot, "index.html"), join(root, "index.html"));
  return root;
}

const read = (root, path) => readFileSync(join(root, path), "utf8");
const write = (root, path, text) => writeFileSync(join(root, path), text);
const edit = (root, path, from, to) => {
  const before = read(root, path);
  const after = before.replace(from, to);
  // A mutation that silently stopped matching would make the test below assert
  // nothing at all, and pass.
  expect(after, `mutation of ${path} matched nothing`).not.toBe(before);
  write(root, path, after);
};

function run(root, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [join(root, CHECKER), ...args], {
    cwd: root,
    encoding: "utf8",
    // A fixed, minimal environment: the checker must not depend on anything a
    // developer happens to have exported, and must never see a credential.
    env: {
      PATH: process.env.PATH,
      HOME: root,
      LC_ALL: "C",
      TZ: "UTC",
      ...extraEnv,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("local font contract: the intact tree is accepted", () => {
  it("passes on the committed assets and says exactly what it verified", () => {
    const result = run(fixture());

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("6 WOFF2 files and 3 OFL licences verified by sha256");
    expect(result.stdout).toContain("20 discrete @font-face blocks checked");
    expect(result.stdout).toContain("3 authored 650/750 rules intact");
    expect(result.stdout).toContain("no external font host");
  });

  it("is deterministic: the same tree yields byte-identical output twice", () => {
    const root = fixture();
    const first = run(root);
    const second = run(root);

    expect(second.stdout).toBe(first.stdout);
    expect(second.stderr).toBe(first.stderr);
    expect(second.status).toBe(first.status);
  });

  it("uses no network at all", () => {
    const root = fixture();
    /*
     * `node:net`, `node:dns` and the http clients are one singleton per
     * process, shared between CommonJS and ESM, so poisoning them from a
     * --require preload is binding on the ESM checker too. If the checker ever
     * grew a fetch of a font or a licence, this exits non-zero.
     */
    const preload = join(root, "no-network.cjs");
    writeFileSync(
      preload,
      [
        "const refuse = (what) => { throw new Error(`network use: ${what}`); };",
        "const net = require('node:net');",
        "net.Socket.prototype.connect = () => refuse('net.Socket#connect');",
        "net.connect = net.createConnection = () => refuse('net.connect');",
        "const tls = require('node:tls');",
        "tls.connect = () => refuse('tls.connect');",
        "const dns = require('node:dns');",
        "dns.lookup = () => refuse('dns.lookup');",
        "dns.resolve = () => refuse('dns.resolve');",
        "dns.promises.lookup = () => refuse('dns.promises.lookup');",
        "for (const name of ['node:http', 'node:https']) {",
        "  const mod = require(name);",
        "  mod.request = () => refuse(`${name}.request`);",
        "  mod.get = () => refuse(`${name}.get`);",
        "}",
        "globalThis.fetch = () => refuse('fetch');",
        "",
      ].join("\n"),
    );

    const result = spawnSync(
      process.execPath,
      ["--require", preload, join(root, CHECKER)],
      { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, HOME: root, LC_ALL: "C" } },
    );

    expect(result.stderr ?? "").not.toMatch(/network use/);
    expect(result.status).toBe(0);
  });
});

describe("local font contract: a missing or altered asset is rejected", () => {
  it("rejects a declared font file that does not exist", () => {
    const root = fixture();
    rmSync(join(root, "public/fonts/inter-v20-latin.woff2"));

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Local font check failed:");
    expect(result.output).toContain(
      "font frontend/public/fonts/inter-v20-latin.woff2 is declared in font-provenance/PROVENANCE.json but does not exist.",
    );
  });

  it("rejects a declared licence file that does not exist", () => {
    const root = fixture();
    rmSync(join(root, "public/fonts/licenses/Inter-OFL-1.1.txt"));

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("licence frontend/public/fonts/licenses/Inter-OFL-1.1.txt");
    expect(result.output).toContain("does not exist");
  });

  it("rejects a font file whose bytes no longer match the manifest digest", () => {
    const root = fixture();
    const target = join(root, "public/fonts/space-grotesk-v22-latin.woff2");
    const bytes = readFileSync(target);
    // One flipped bit, same length: only the digest can catch this.
    bytes[bytes.length - 1] ^= 0x01;
    writeFileSync(target, bytes);

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("font frontend/public/fonts/space-grotesk-v22-latin.woff2 has sha256");
    expect(result.output).toContain("do not update");
  });

  it("rejects an undeclared file riding along in public/fonts", () => {
    const root = fixture();
    writeFileSync(join(root, "public/fonts/stowaway.woff2"), "not a font");

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("public/fonts/ contains undeclared font file(s): stowaway.woff2.");
  });
});

describe("local font contract: a remote font reference is rejected", () => {
  it("rejects an external src URL in src/fonts.css", () => {
    const root = fixture();
    edit(
      root,
      "src/fonts.css",
      'url("/fonts/inter-v20-latin.woff2")',
      'url("https://fonts.gstatic.com/s/inter/v20/inter-v20-latin.woff2")',
    );

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("contains an external or data: URL");
    expect(result.output).toContain("references fonts.gstatic.com");
  });

  it("rejects a Google Fonts stylesheet link reintroduced into index.html", () => {
    const root = fixture();
    edit(
      root,
      "index.html",
      "</head>",
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" />\n  </head>',
    );

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("index.html references fonts.googleapis.com; fonts are self-hosted.");
  });

  it("rejects the deferred-font loader attribute returning to index.html", () => {
    const root = fixture();
    edit(root, "index.html", "</head>", '  <link data-deferred-font href="/x" />\n  </head>');

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("still carries a data-deferred-font link");
  });

  it("rejects a second @font-face entrypoint in src/index.css", () => {
    const root = fixture();
    write(root, "src/index.css", `${read(root, "src/index.css")}\n@font-face { font-family: Sneak; }\n`);

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("declares an @font-face of its own");
  });
});

describe("local font contract: stylesheet and source must still agree", () => {
  it("rejects a manifest that no longer records the CSS response the faces were cut from", () => {
    const root = fixture();
    const manifest = JSON.parse(read(root, "font-provenance/PROVENANCE.json"));
    manifest.sourceCss.sha256 = "0".repeat(64);
    write(root, "font-provenance/PROVENANCE.json", `${JSON.stringify(manifest, null, 2)}\n`);

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("records sourceCss.sha256 " + "0".repeat(64));
    expect(result.output).toContain("only meaningful relative to that exact CSS response");
  });

  it("rejects a stylesheet that points at a face the manifest does not declare", () => {
    const root = fixture();
    edit(root, "src/fonts.css", "/fonts/inter-v20-latin.woff2", "/fonts/inter-v21-latin.woff2");

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("which font-provenance/PROVENANCE.json does not declare");
  });

  it("rejects a dropped @font-face block, so the matrix cannot shrink silently", () => {
    const root = fixture();
    const css = read(root, "src/fonts.css");
    const start = css.indexOf("@font-face");
    const end = css.indexOf("}", start) + 1;
    write(root, "src/fonts.css", css.slice(0, start) + css.slice(end));

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("declares 19 @font-face blocks; expected exactly 20");
  });

  it("rejects an authored 650/750 weight that quietly changed", () => {
    const root = fixture();
    edit(root, "src/index.css", /(\.az-eyebrow\s*\{[^}]*font-weight:\s*)750/, "$1700");

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain(".az-eyebrow declares font-weight \"700\"; expected exactly \"750\"");
  });

  it("rejects an unreviewed 650 request added somewhere else in src/index.css", () => {
    const root = fixture();
    write(root, "src/index.css", `${read(root, "src/index.css")}\n.az-smuggled { font-weight: 650; }\n`);

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("which the 650/750 contract does not cover");
  });
});

describe("local font contract: diagnostics are complete and deterministic", () => {
  it("reports every independent failure in one run, not just the first", () => {
    const root = fixture();
    rmSync(join(root, "public/fonts/inter-v20-latin-ext.woff2"));
    edit(root, "index.html", "</head>", '  <link href="https://fonts.googleapis.com/x" />\n  </head>');

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.output).toContain("inter-v20-latin-ext.woff2");
    expect(result.output).toContain("fonts.googleapis.com");
    // Bullets, one per failure, so a reader can act on all of them at once.
    expect((result.stderr.match(/^ {2}- /gm) ?? []).length).toBeGreaterThan(1);
  });

  it("emits byte-identical diagnostics for the same damage twice", () => {
    const damage = () => {
      const root = fixture();
      rmSync(join(root, "public/fonts/jetbrains-mono-v24-latin.woff2"));
      writeFileSync(join(root, "public/fonts/stowaway.woff2"), "x");
      return run(root);
    };

    const first = damage();
    const second = damage();

    // Path names differ per fixture only inside the temporary root, which never
    // appears in a diagnostic: every message is repository-relative.
    expect(second.stderr).toBe(first.stderr);
    expect(second.status).toBe(first.status);
  });
});

describe("local font contract: the command line cannot silently downgrade", () => {
  it("refuses an unrecognised argument instead of falling back to source mode", () => {
    const result = run(fixture(), ["--dsit"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('unrecognised argument(s) ["--dsit"]');
    expect(result.output).toContain("usage: node scripts/checkLocalFonts.mjs [--dist]");
    expect(result.output).not.toContain("WOFF2 files and");
  });

  it("refuses --dist plus anything else", () => {
    const result = run(fixture(), ["--dist", "--force"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("unrecognised argument(s)");
  });

  it("refuses --dist when there is no build, rather than passing vacuously", () => {
    const result = run(fixture(), ["--dist"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("dist/ does not exist");
    expect(result.output).toContain("never falls back to a source-only pass");
  });
});

describe("local font contract: build output mode scans real bytes", () => {
  /** The smallest tree that satisfies the deployable-output contract. */
  const withDist = () => {
    const root = fixture();
    mkdirSync(join(root, "dist"), { recursive: true });
    cpSync(join(root, "public/fonts"), join(root, "dist/fonts"), { recursive: true });
    writeFileSync(join(root, "dist/index.html"), "<!doctype html><title>a</title>\n");
    return root;
  };

  it("accepts a build carrying exactly the declared assets", () => {
    const result = run(withDist(), ["--dist"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[fonts:dist]");
    expect(result.stdout).toContain("9 declared assets (6 WOFF2, 3 OFL licences)");
  });

  it("rejects a Google font host anywhere in the built bytes", () => {
    const root = withDist();
    writeFileSync(
      join(root, "dist/assets.js"),
      'const u="https://fonts.gstatic.com/s/inter/v20/x.woff2";\n',
    );

    const result = run(root, ["--dist"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('contains the forbidden string "fonts.gstatic.com" at byte offset');
  });

  it("rejects the deferred-font marker in the built bytes", () => {
    const root = withDist();
    writeFileSync(join(root, "dist/index.html"), '<link data-deferred-font href="/x">\n');

    const result = run(root, ["--dist"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain('contains the forbidden string "data-deferred-font"');
  });

  it("rejects a build that shipped the provenance manifest", () => {
    const root = withDist();
    mkdirSync(join(root, "dist/font-provenance"), { recursive: true });
    cpSync(
      join(root, "font-provenance/PROVENANCE.json"),
      join(root, "dist/font-provenance/PROVENANCE.json"),
    );

    const result = run(root, ["--dist"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("ships the provenance manifest");
  });

  it("rejects a re-encoded font in the build even when its name is right", () => {
    const root = withDist();
    const target = join(root, "dist/fonts/inter-v20-latin.woff2");
    const bytes = readFileSync(target);
    bytes[0] ^= 0x01;
    writeFileSync(target, bytes);

    const result = run(root, ["--dist"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("dist/fonts/inter-v20-latin.woff2 has sha256");
    expect(result.output).toContain("not a re-encoded or substituted copy");
  });

  it("rejects an empty build directory rather than scanning nothing", () => {
    const root = fixture();
    mkdirSync(join(root, "dist"), { recursive: true });

    const result = run(root, ["--dist"]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("contains no files, so the scan below would pass vacuously");
  });
});
