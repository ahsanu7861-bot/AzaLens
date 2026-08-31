import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";

/*
  Static guard for the self-hosted font contract.

  AzaLens used to load Inter, JetBrains Mono and Space Grotesk from Google
  Fonts. The faces now ship in this repository, which means two things can
  silently rot and neither would fail a normal build:

  1. The bytes. A WOFF2 replaced by a different cut of the same family renders
     differently but still loads, so identity is pinned by sha256 in
     font-provenance/PROVENANCE.json and re-verified here against the files
     on disk. The gstatic URLs in that file are provenance only — nothing
     fetches them, and this check never touches the network.

     The manifest deliberately lives OUTSIDE public/. Vite copies everything
     under public/ into dist/ verbatim, so while it sat next to the faces it
     was the one and only string in the production build that named a Google
     host. It is inert static metadata, but a provenance URL shipped to
     browsers is indistinguishable, to any later audit of the build output,
     from a runtime font dependency. The licences stay under public/fonts
     because OFL 1.1 requires the licence to travel with the fonts.

  2. The declarations. Google serves these families as internally variable
     fonts but exposes them through repeated DISCRETE single-weight @font-face
     declarations, and that is what AzaLens renders against today. src/index.css
     asks for font-weight 650 twice and 750 once; against discrete declarations
     the browser resolves all three to the 700 face. Collapsing src/fonts.css
     into a ranged face (`font-weight: 100 900`) would instantiate true 650 and
     750 instances and change rendering on those three rules. That collapse is
     the specific regression this check exists to make impossible, so a ranged
     or multi-valued font-weight is rejected outright.

  Parsing note: src/fonts.css is parsed with a small total parser, not a
  permissive regex sweep. It walks the whole file and fails on ANY content it
  does not recognise, so a malformed or half-edited stylesheet cannot produce a
  plausible PASS by simply not matching a pattern. The assumptions it enforces
  are deliberately strict and are asserted, not assumed:
    - the file is a sequence of `@font-face { ... }` blocks and nothing else;
    - no block nests braces;
    - each declaration is `property: value`, one per `;`;
    - each block declares exactly the six expected properties, no duplicates.
  If a future face legitimately needs another descriptor, add it to
  EXPECTED_PROPERTIES rather than loosening the parser.

  Read set: this check reads ONLY font-provenance/PROVENANCE.json, the nine
  files that manifest declares, src/fonts.css, src/index.css and index.html.
  Accepted
  Playwright baselines are never read and are never a source of truth for font
  identity — that is asserted below.

  Run with: npm run test:fonts
*/

const root = new URL("../", import.meta.url);
const rel = (p) => new URL(p, root);

const PROVENANCE_PATH = "font-provenance/PROVENANCE.json";
const FONTS_CSS_PATH = "src/fonts.css";
const INDEX_CSS_PATH = "src/index.css";
const INDEX_HTML_PATH = "index.html";

// The exact CSS response the vendored faces were cut from.
const EXPECTED_SOURCE_CSS_SHA256 =
  "71705f749d7c925ce7ee46a2c71699f459a4cce597a9f0e16f412bce204a0665";

// Required family -> weights x subsets matrix.
const REQUIRED_MATRIX = {
  Inter: [400, 500, 600, 700],
  "JetBrains Mono": [400, 500, 600, 700],
  "Space Grotesk": [600, 700],
};
const REQUIRED_SUBSETS = ["latin", "latin-ext"];
// Blocks are weights x subsets summed across families (20); files are families
// x subsets (6), because one file backs every weight of its family/subset.
const EXPECTED_BLOCK_COUNT = Object.values(REQUIRED_MATRIX).reduce(
  (total, weights) => total + weights.length * REQUIRED_SUBSETS.length,
  0,
);
const EXPECTED_FONT_FILE_COUNT =
  Object.keys(REQUIRED_MATRIX).length * REQUIRED_SUBSETS.length;
const EXPECTED_LICENCE_COUNT = Object.keys(REQUIRED_MATRIX).length;

const EXPECTED_PROPERTIES = [
  "font-family",
  "font-style",
  "font-weight",
  "font-display",
  "src",
  "unicode-range",
];

const FORBIDDEN_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

const failures = [];
const fail = (message) => failures.push(message);

// Every path this check reads, recorded so the closed read set is provable.
const readPaths = [];
async function readText(path) {
  readPaths.push(path);
  return readFile(rel(path), "utf8");
}
async function readBytes(path) {
  readPaths.push(path);
  return readFile(rel(path));
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const squash = (value) => value.replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------
// A total parser for src/fonts.css.
// ------------------------------------------------------------------

class FontCssParseError extends Error {}

function stripComments(css) {
  // Replace each comment with a single space so offsets stay sane and two
  // tokens separated only by a comment do not fuse.
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function parseFontFaces(rawCss) {
  const css = stripComments(rawCss);
  const faces = [];
  let i = 0;

  const skipSpace = () => {
    while (i < css.length && /\s/.test(css[i])) i += 1;
  };

  skipSpace();
  while (i < css.length) {
    if (!css.startsWith("@font-face", i)) {
      throw new FontCssParseError(
        `expected an @font-face block at offset ${i}, found ` +
          `${JSON.stringify(css.slice(i, i + 60))}. This file may contain only ` +
          "@font-face blocks and comments.",
      );
    }
    i += "@font-face".length;
    skipSpace();
    if (css[i] !== "{") {
      throw new FontCssParseError(`expected "{" after @font-face at offset ${i}.`);
    }
    i += 1;
    const bodyStart = i;
    while (i < css.length && css[i] !== "}" && css[i] !== "{") i += 1;
    if (css[i] === "{") {
      throw new FontCssParseError(
        `nested "{" inside the @font-face block starting at offset ${bodyStart}.`,
      );
    }
    if (i >= css.length) {
      throw new FontCssParseError(
        `unterminated @font-face block starting at offset ${bodyStart}.`,
      );
    }
    const body = css.slice(bodyStart, i);
    i += 1;

    const declarations = new Map();
    for (const chunk of body.split(";")) {
      if (chunk.trim() === "") continue;
      const colon = chunk.indexOf(":");
      if (colon === -1) {
        throw new FontCssParseError(
          `declaration without ":" in the block at offset ${bodyStart}: ` +
            `${JSON.stringify(squash(chunk))}`,
        );
      }
      const property = chunk.slice(0, colon).trim().toLowerCase();
      const value = squash(chunk.slice(colon + 1));
      if (declarations.has(property)) {
        throw new FontCssParseError(
          `duplicate "${property}" in the block at offset ${bodyStart}.`,
        );
      }
      declarations.set(property, value);
    }

    faces.push({ offset: bodyStart, declarations, body });
    skipSpace();
  }

  return faces;
}

// ------------------------------------------------------------------
// 1. PROVENANCE.json parses and declares the expected inventory.
// ------------------------------------------------------------------

let provenance;
try {
  provenance = JSON.parse(await readText(PROVENANCE_PATH));
} catch (error) {
  console.error(`${PROVENANCE_PATH} is missing or is not valid JSON: ${error.message}`);
  process.exit(1);
}

const fontEntries = Array.isArray(provenance.fonts) ? provenance.fonts : [];
const licenseEntries = Array.isArray(provenance.licenses) ? provenance.licenses : [];

if (fontEntries.length !== EXPECTED_FONT_FILE_COUNT) {
  fail(
    `${PROVENANCE_PATH} declares ${fontEntries.length} font files; expected ` +
      `${EXPECTED_FONT_FILE_COUNT} (three families x two subsets).`,
  );
}

if (licenseEntries.length !== EXPECTED_LICENCE_COUNT) {
  fail(
    `${PROVENANCE_PATH} declares ${licenseEntries.length} licence files; ` +
      `expected ${EXPECTED_LICENCE_COUNT}, one per family.`,
  );
}

// 18. The manifest must record the CSS response the faces were cut from.
const sourceCssSha = provenance.sourceCss?.sha256;
if (sourceCssSha !== EXPECTED_SOURCE_CSS_SHA256) {
  fail(
    `${PROVENANCE_PATH} records sourceCss.sha256 ${sourceCssSha ?? "(absent)"}, ` +
      `expected ${EXPECTED_SOURCE_CSS_SHA256}. The unicode-range values and the ` +
      "discrete weight declarations below are only meaningful relative to that " +
      "exact CSS response.",
  );
}

// ------------------------------------------------------------------
// 2. Every declared file exists, is a regular file, and matches its identity.
// ------------------------------------------------------------------

async function verifyAsset(entry, kind, expectBytes) {
  const path = typeof entry.path === "string" ? entry.path : null;
  if (!path || !path.startsWith("frontend/")) {
    fail(`${kind} entry has an unusable repository path: ${JSON.stringify(path)}`);
    return false;
  }
  const local = path.replace(/^frontend\//, "");

  let info;
  try {
    info = await stat(rel(local));
  } catch {
    fail(`${kind} ${path} is declared in ${PROVENANCE_PATH} but does not exist.`);
    return false;
  }
  if (!info.isFile()) {
    fail(`${kind} ${path} is not a regular file.`);
    return false;
  }

  const bytes = await readBytes(local);
  if (expectBytes) {
    if (bytes.length !== entry.bytes) {
      fail(
        `${kind} ${path} is ${bytes.length} bytes; ${PROVENANCE_PATH} declares ` +
          `${entry.bytes}.`,
      );
    }
  }
  const digest = sha256(bytes);
  if (digest !== entry.sha256) {
    fail(
      `${kind} ${path} has sha256 ${digest}; ${PROVENANCE_PATH} declares ` +
        `${entry.sha256}. The committed bytes are the identity — do not update ` +
        "the manifest to match a changed file without re-verifying it upstream.",
    );
    return false;
  }
  return true;
}

for (const entry of fontEntries) {
  await verifyAsset(entry, "font", true);
}
for (const entry of licenseEntries) {
  await verifyAsset(entry, "licence", true);
  if (entry.license !== "SIL Open Font License 1.1") {
    fail(
      `licence ${entry.path} is recorded as ${JSON.stringify(entry.license)}; ` +
        "expected \"SIL Open Font License 1.1\".",
    );
  }
}

// 17. Every family ships its OFL file.
for (const family of Object.keys(REQUIRED_MATRIX)) {
  if (!licenseEntries.some((entry) => entry.family === family)) {
    fail(
      `no OFL licence file is shipped for ${family}. None of the served ` +
        "binaries embeds name ID 13 licence text, only a name ID 14 URL, so " +
        "the licence must ship alongside the fonts.",
    );
  }
}

// The directories must hold exactly the declared inventory and nothing else,
// so an unreferenced stray face cannot ride along unverified.
async function assertDirectoryContents(dir, expected, label) {
  let names;
  try {
    names = (await readdir(rel(dir))).filter((name) => !name.startsWith("."));
  } catch {
    fail(`${label} directory ${dir} is missing.`);
    return;
  }
  const extra = names.filter((name) => !expected.includes(name));
  const missing = expected.filter((name) => !names.includes(name));
  if (extra.length > 0) {
    fail(`${dir} contains undeclared ${label} file(s): ${extra.join(", ")}.`);
  }
  if (missing.length > 0) {
    fail(`${dir} is missing declared ${label} file(s): ${missing.join(", ")}.`);
  }
}

const fontBasenames = fontEntries.map((e) => String(e.path).split("/").pop());
const licenseBasenames = licenseEntries.map((e) => String(e.path).split("/").pop());
await assertDirectoryContents(
  "public/fonts/",
  // PROVENANCE.json is deliberately absent here: it lives in
  // font-provenance/ so Vite never copies it into dist/.
  [...fontBasenames, "licenses"],
  "font",
);
await assertDirectoryContents("public/fonts/licenses/", licenseBasenames, "licence");

// ------------------------------------------------------------------
// 3. src/fonts.css declares exactly the required matrix, discretely.
// ------------------------------------------------------------------

const fontsCss = await readText(FONTS_CSS_PATH);

let faces = [];
try {
  faces = parseFontFaces(fontsCss);
} catch (error) {
  if (error instanceof FontCssParseError) {
    fail(`${FONTS_CSS_PATH} did not parse: ${error.message}`);
  } else {
    throw error;
  }
}

if (faces.length !== EXPECTED_BLOCK_COUNT) {
  fail(
    `${FONTS_CSS_PATH} declares ${faces.length} @font-face blocks; expected ` +
      `exactly ${EXPECTED_BLOCK_COUNT} (Inter 4x2, JetBrains Mono 4x2, ` +
      "Space Grotesk 2x2).",
  );
}

const provenanceBySubsetKey = new Map(
  fontEntries.map((entry) => [`${entry.family}|${entry.subset}`, entry]),
);
const declared = new Set();

for (const face of faces) {
  const { declarations, offset, body } = face;
  const where = `${FONTS_CSS_PATH} block at offset ${offset}`;

  const properties = [...declarations.keys()].sort();
  const expectedProperties = [...EXPECTED_PROPERTIES].sort();
  if (properties.join(",") !== expectedProperties.join(",")) {
    fail(
      `${where} declares [${properties.join(", ")}]; expected exactly ` +
        `[${expectedProperties.join(", ")}]. font-optical-sizing and ` +
        "font-variation-settings in particular do not belong here.",
    );
    continue;
  }

  // 14. Nothing in a block may reach the network.
  if (/:\/\//.test(body) || /\bdata:/i.test(body)) {
    fail(`${where} contains an external or data: URL. Faces must be local files.`);
  }
  for (const host of FORBIDDEN_FONT_HOSTS) {
    if (body.includes(host)) {
      fail(`${where} references ${host}. Fonts are self-hosted.`);
    }
  }

  const family = declarations.get("font-family").replace(/^["']|["']$/g, "");
  const weightRaw = declarations.get("font-weight");
  const style = declarations.get("font-style");
  const display = declarations.get("font-display");
  const src = declarations.get("src");
  const unicodeRange = declarations.get("unicode-range");

  // 10 / 11. Style and display.
  if (style !== "normal") {
    fail(`${where} has font-style ${JSON.stringify(style)}; expected "normal".`);
  }
  if (display !== "swap") {
    fail(`${where} has font-display ${JSON.stringify(display)}; expected "swap".`);
  }

  // 15 / 16. font-weight must be a single numeric value, never a range.
  const numericTokens = weightRaw.match(/[0-9]+(?:\.[0-9]+)?/g) ?? [];
  if (!/^[0-9]{2,3}$/.test(weightRaw)) {
    fail(
      `${where} has font-weight ${JSON.stringify(weightRaw)}, which is not a ` +
        "single integer. Ranged and keyword weights are rejected: a ranged " +
        "face would activate true 650 and 750 instances for the three requests " +
        "in src/index.css that currently resolve to 700.",
    );
    continue;
  }
  if (numericTokens.length !== 1 || /\s/.test(weightRaw)) {
    fail(
      `${where} has a multi-valued font-weight ${JSON.stringify(weightRaw)}. ` +
        "Exactly one numeric value is allowed.",
    );
    continue;
  }
  const weight = Number(weightRaw);

  // 12. src must be one local /fonts/*.woff2 file in woff2 format.
  const srcMatch = /^url\(\s*"(\/fonts\/[A-Za-z0-9._-]+\.woff2)"\s*\)\s+format\(\s*"woff2"\s*\)$/.exec(src);
  if (!srcMatch) {
    fail(
      `${where} has src ${JSON.stringify(src)}; expected exactly ` +
        'url("/fonts/<file>.woff2") format("woff2").',
    );
    continue;
  }
  const href = srcMatch[1];

  const weights = REQUIRED_MATRIX[family];
  if (!weights) {
    fail(`${where} declares unexpected font-family ${JSON.stringify(family)}.`);
    continue;
  }
  if (!weights.includes(weight)) {
    fail(
      `${where} declares ${family} at weight ${weight}; the required weights ` +
        `are ${weights.join(", ")}.`,
    );
    continue;
  }

  // Resolve the subset from the manifest entry whose file this block points at.
  const entry = fontEntries.find(
    (candidate) => `/${String(candidate.path).replace(/^frontend\/public\//, "")}` === href,
  );
  if (!entry) {
    fail(`${where} points at ${href}, which ${PROVENANCE_PATH} does not declare.`);
    continue;
  }
  if (entry.family !== family) {
    fail(
      `${where} declares font-family ${JSON.stringify(family)} but ${href} is ` +
        `recorded as ${JSON.stringify(entry.family)}.`,
    );
    continue;
  }

  // 13. unicode-range must be the verbatim value from the verified CSS.
  const expectedRange = provenanceBySubsetKey.get(`${family}|${entry.subset}`)?.unicodeRange;
  if (squash(unicodeRange) !== squash(expectedRange ?? "")) {
    fail(
      `${where} has a unicode-range that does not match the ${entry.subset} ` +
        `range recorded for ${family} in ${PROVENANCE_PATH}.`,
    );
  }

  // The manifest must agree that this file is declared at this weight.
  if (!Array.isArray(entry.declaredWeights) || !entry.declaredWeights.includes(weight)) {
    fail(
      `${where} declares ${family} ${weight} against ${href}, but ` +
        `${PROVENANCE_PATH} records that file's weights as ` +
        `${JSON.stringify(entry.declaredWeights)}.`,
    );
  }

  declared.add(`${family}|${weight}|${entry.subset}`);
}

// 9. Exact coverage: every required cell present, nothing missing.
for (const [family, weights] of Object.entries(REQUIRED_MATRIX)) {
  for (const weight of weights) {
    for (const subset of REQUIRED_SUBSETS) {
      if (!declared.has(`${family}|${weight}|${subset}`)) {
        fail(`${FONTS_CSS_PATH} is missing ${family} ${weight} (${subset}).`);
      }
    }
  }
}

// ------------------------------------------------------------------
// 4. One canonical entrypoint, and no font host in the document.
// ------------------------------------------------------------------

const indexCss = await readText(INDEX_CSS_PATH);
const imports = [...indexCss.matchAll(/@import\s+["']\.\/fonts\.css["']\s*;/g)];
if (imports.length !== 1) {
  fail(
    `${INDEX_CSS_PATH} imports ./fonts.css ${imports.length} time(s); expected ` +
      "exactly once. src/fonts.css is the single canonical font entrypoint.",
  );
}

if (stripComments(indexCss).includes("@font-face")) {
  fail(
    `${INDEX_CSS_PATH} declares an @font-face of its own. Every face belongs in ` +
      `${FONTS_CSS_PATH}; a second entrypoint is how the discrete-weight ` +
      "contract gets bypassed.",
  );
}

const indexHtml = await readText(INDEX_HTML_PATH);
for (const host of FORBIDDEN_FONT_HOSTS) {
  if (indexHtml.includes(host)) {
    fail(`${INDEX_HTML_PATH} references ${host}; fonts are self-hosted.`);
  }
}
if (/\sdata-deferred-font\b/.test(indexHtml)) {
  fail(
    `${INDEX_HTML_PATH} still carries a data-deferred-font link, but the ` +
      "deferred Google Fonts loader no longer exists.",
  );
}

// ------------------------------------------------------------------
// 5. The read set is closed: no baseline informs font identity.
// ------------------------------------------------------------------

const baselineLike = readPaths.filter(
  (path) => /-snapshots\//.test(path) || /\.png$/i.test(path),
);
if (baselineLike.length > 0) {
  fail(
    "this check read a baseline or image file " +
      `(${baselineLike.join(", ")}). Font identity comes from ${PROVENANCE_PATH} ` +
      "and the font bytes alone; an accepted screenshot is never evidence of it.",
  );
}

// ------------------------------------------------------------------

if (failures.length > 0) {
  console.error("Local font check failed:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(
  `[fonts] ${fontEntries.length} WOFF2 files and ${licenseEntries.length} OFL ` +
    `licences verified by sha256; ${faces.length} discrete @font-face blocks ` +
    "checked; no external font host.",
);
