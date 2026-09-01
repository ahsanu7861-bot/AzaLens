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

  3. The authored requests. The discrete declarations above only matter
     because src/index.css asks for weights that are not among them:
     .az-rail-tooltip and .az-workspace-tab request 650, and .az-eyebrow
     requests 750. Those three rules ARE the reason a ranged face would change
     rendering, so the whole argument in (2) evaporates silently if someone
     retunes them to 600/700 or deletes them. Point 2 pinned the answer; this
     pins the question. The contract is expressed as selector -> exact weight
     and checked structurally, not by counting the digits 650 and 750
     somewhere in the file.

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

  Read set, source mode: this check reads ONLY
  font-provenance/PROVENANCE.json, the nine files that manifest declares,
  src/fonts.css, src/index.css and index.html. Accepted Playwright baselines
  are never read and are never a source of truth for font identity — that is
  asserted below.

  Read set, build-output mode (--dist): the manifest, plus every file under
  dist/. That mode returns before the closed-read-set assertion for exactly
  that reason; the assertion describes source mode, which is the mode whose
  conclusions a baseline could otherwise contaminate.

  Run with: npm run test:fonts       source contract, no build required
            npm run test:fonts:dist  deployable output, build required
*/

const root = new URL("../", import.meta.url);
const rel = (p) => new URL(p, root);

const PROVENANCE_PATH = "font-provenance/PROVENANCE.json";
const FONTS_CSS_PATH = "src/fonts.css";
const INDEX_CSS_PATH = "src/index.css";
const INDEX_HTML_PATH = "index.html";

/*
  Two modes, one contract.

  Default (no arguments) is the SOURCE contract: everything below runs against
  committed source and public/ assets, needs no build, and is what CI runs
  before `npm run build`.

  `--dist` is the DEPLOYABLE-OUTPUT contract: it requires a completed build and
  asserts that dist/ carries the six vendored faces byte-for-byte, the three
  OFL licences, no provenance manifest, and not one byte naming a Google font
  host. It deliberately does NOT fall back to a source-only pass when dist/ is
  absent: "scan it if it happens to be there" is fail-open, and a skipped scan
  is indistinguishable in a green log from a clean one.

  An unrecognised argument is refused rather than ignored, so a typo in a
  workflow cannot silently downgrade the gate to source mode.
*/
const DIST_DIR = "dist";
const USAGE =
  "usage: node scripts/checkLocalFonts.mjs [--dist]\n" +
  "  (no argument)  verify the source font contract (no build required)\n" +
  "  --dist         verify the built output under frontend/dist (build required)";

function parseMode(argv) {
  if (argv.length === 0) return "source";
  if (argv.length === 1 && argv[0] === "--dist") return "dist";
  console.error(
    `Local font check: unrecognised argument(s) ${JSON.stringify(argv)}.\n${USAGE}`,
  );
  process.exit(1);
}

const MODE = parseMode(process.argv.slice(2));

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

/*
  Byte strings that must not survive into deployable output. The two hosts are
  the runtime dependency F1 removed. data-deferred-font is the attribute the
  deleted loader used to mark a stylesheet it would activate later; its return
  in dist/ would mean a deferred external font request shipped to browsers even
  if index.html in source looked clean.
*/
const FORBIDDEN_OUTPUT_MARKERS = [...FORBIDDEN_FONT_HOSTS, "data-deferred-font"];

const failures = [];
const fail = (message) => failures.push(message);

/*
  One exit path for both modes. A function rather than a trailing block because
  build-output mode reaches its verdict in the middle of this file, and because
  a pass should exit 0 deliberately rather than by falling off the end of a
  module.
*/
function finish(summary, header) {
  if (failures.length > 0) {
    console.error(`${header}\n`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }
  console.log(summary);
  process.exit(0);
}

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

class CssParseError extends Error {}

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

/*
  Build-output mode shares the manifest above and nothing else: the source
  contract below reasons about committed files, this one about the bytes Vite
  emitted into dist/. Branching here rather than at the end of the file is what
  keeps the closed-read-set proof at the bottom an honest description of source
  mode.
*/
if (MODE === "dist") {
  finish(
    await runDistContract(fontEntries, licenseEntries),
    "Built font output check failed:",
  );
}

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

/*
  The three authored rules that give the discrete-weight contract its point.

  Expressed as selector -> exact weight rather than as a count of occurrences,
  because "the file still contains 650 twice" is satisfied by two unrelated
  rules while .az-workspace-tab quietly drops to 600. Each entry is checked
  against the parsed rule whose selector list contains that exact selector:
  the rule must exist, must be unique, and must declare font-weight exactly
  once, with exactly this value.
*/
const PROTECTED_WEIGHT_RULES = [
  { selector: ".az-rail-tooltip", weight: "650" },
  { selector: ".az-workspace-tab", weight: "650" },
  { selector: ".az-eyebrow", weight: "750" },
];
const PROTECTED_WEIGHT_VALUES = new Set(
  PROTECTED_WEIGHT_RULES.map((rule) => rule.weight),
);

let indexCssRules = [];
try {
  indexCssRules = parseStyleRules(indexCss);
} catch (error) {
  if (error instanceof CssParseError) {
    fail(
      `${INDEX_CSS_PATH} did not parse: ${error.message}. The 650/750 rule ` +
        "contract cannot be verified against a file this check cannot read, so " +
        "it fails closed rather than assuming the rules survived.",
    );
  } else {
    throw error;
  }
}

// The rules that legitimately own a 650 or 750 request, by identity.
const protectedRules = new Set();

for (const { selector, weight } of PROTECTED_WEIGHT_RULES) {
  const matches = indexCssRules.filter((rule) => rule.selectors.includes(selector));

  if (matches.length === 0) {
    fail(
      `${INDEX_CSS_PATH} declares no rule for the selector ${selector}, which ` +
        `the font contract pins at font-weight ${weight}. Against the discrete ` +
        `faces in ${FONTS_CSS_PATH} that request resolves to the 700 face; ` +
        "removing the rule is a rendering change, and removing it silently is " +
        "how the discrete-weight argument stops being about anything.",
    );
    continue;
  }
  if (matches.length > 1) {
    fail(
      `${INDEX_CSS_PATH} declares ${matches.length} rules whose selector list ` +
        `contains ${selector}; exactly one is expected, so the intended ` +
        `font-weight ${weight} is ambiguous. Blocks found at offsets ` +
        `${matches.map((rule) => rule.offset).join(", ")}.`,
    );
    continue;
  }

  const rule = matches[0];
  protectedRules.add(rule);
  const values = rule.declarations.get("font-weight") ?? [];

  if (values.length === 0) {
    fail(
      `${INDEX_CSS_PATH} rule ${selector} no longer declares font-weight; ` +
        `expected exactly one "font-weight: ${weight}".`,
    );
  } else if (values.length > 1) {
    fail(
      `${INDEX_CSS_PATH} rule ${selector} declares font-weight ${values.length} ` +
        `times (${values.join(", ")}); exactly one declaration of ${weight} is ` +
        "expected, because a duplicate makes the effective weight depend on " +
        "declaration order rather than on this contract.",
    );
  } else if (values[0] !== weight) {
    fail(
      `${INDEX_CSS_PATH} rule ${selector} declares font-weight ` +
        `${JSON.stringify(values[0])}; expected exactly "${weight}". This is ` +
        "the authored request the discrete-face contract exists to serve; " +
        "changing it is a rendering change and must be a reviewed one.",
    );
  }
}

/*
  Completeness. A new 650 or 750 request somewhere else in the file is not
  wrong, but it is unreviewed: it renders against the discrete faces exactly as
  these three do, and it is not covered by the contract above. Fail, and say so,
  rather than let the covered set drift away from the actual set.
*/
for (const rule of indexCssRules) {
  for (const value of rule.declarations.get("font-weight") ?? []) {
    if (!PROTECTED_WEIGHT_VALUES.has(value)) continue;
    if (protectedRules.has(rule)) continue;
    fail(
      `${INDEX_CSS_PATH} declares font-weight: ${value} on ` +
        `${JSON.stringify(rule.prelude)} (block at offset ${rule.offset}), which ` +
        "the 650/750 contract does not cover. Against the discrete faces this " +
        "resolves to the 700 face; if that is intended, add the selector to " +
        "PROTECTED_WEIGHT_RULES so it is pinned rather than incidental.",
    );
  }
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

finish(
  `[fonts] ${fontEntries.length} WOFF2 files and ${licenseEntries.length} OFL ` +
    `licences verified by sha256; ${faces.length} discrete @font-face blocks ` +
    `checked; ${PROTECTED_WEIGHT_RULES.length} authored 650/750 rules intact; ` +
    "no external font host.",
  "Local font check failed:",
);

// ==================================================================
// Helpers declared below and used above. Function declarations hoist, so the
// order here is about reading order, not evaluation order: the two contracts
// stay at the top where the assertions are, and their machinery sits out of
// the way underneath.
// ==================================================================

/*
  A structural reader for src/index.css.

  It is not a CSS engine and does not need to be. It finds every brace-balanced
  block, descends into at-rule bodies that contain further blocks (@media,
  @keyframes, @theme), and returns the leaf blocks with their selector list and
  their declarations. That is enough to answer "does THIS selector declare THIS
  font-weight", which a regex over the whole file cannot answer without being
  fooled by an unrelated rule.

  It throws on unbalanced braces, and the caller fails closed on a throw: a
  file this cannot read is a file whose 650/750 rules cannot be verified.
*/

function parseDeclarations(body) {
  const declarations = new Map();
  for (const chunk of body.split(";")) {
    if (chunk.trim() === "") continue;
    const colon = chunk.indexOf(":");
    if (colon === -1) continue;
    const property = chunk.slice(0, colon).trim().toLowerCase();
    const value = squash(chunk.slice(colon + 1));
    if (!declarations.has(property)) declarations.set(property, []);
    declarations.get(property).push(value);
  }
  return declarations;
}

function parseStyleRules(rawCss) {
  const css = stripComments(rawCss);
  const rules = [];

  const walk = (text, base) => {
    let i = 0;
    let start = 0;
    while (i < text.length) {
      const character = text[i];
      if (character === "}") {
        throw new CssParseError(`unbalanced "}" at offset ${base + i}`);
      }
      if (character !== "{") {
        i += 1;
        continue;
      }

      const prelude = squash(text.slice(start, i));
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      if (depth !== 0) {
        throw new CssParseError(
          `unterminated block for ${JSON.stringify(prelude)} at offset ${base + i}`,
        );
      }

      const body = text.slice(i + 1, j - 1);
      if (body.includes("{")) {
        // An at-rule wrapper such as @media or @keyframes: the rules that
        // matter are inside it, not the wrapper itself.
        walk(body, base + i + 1);
      } else {
        rules.push({
          prelude,
          selectors: prelude
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part !== ""),
          declarations: parseDeclarations(body),
          offset: base + i,
        });
      }

      i = j;
      start = j;
    }
  };

  walk(css, 0);
  return rules;
}

/*
  The deployable-output contract.

  Four independent questions about dist/, each of which has to be answered
  positively rather than by the absence of an error:

    1. does a completed build exist at all;
    2. does any byte anywhere under it name a Google font host or the deleted
       deferred-font loader;
    3. does the provenance manifest, which records the gstatic URLs the faces
       were cut from, stay out of it;
    4. does dist/fonts hold exactly the six declared faces and three declared
       licences, byte-for-byte identical to the manifest's sha256 values.

  Every file is read as bytes and scanned as bytes. Nothing is skipped by
  extension: a forbidden host string is exactly as deployable inside a .map, a
  .webmanifest, or a file type this check has never heard of, and an
  extension allowlist is the kind of quiet exemption this gate exists to
  prevent.

  It reads only. It never writes, never deletes, and never touches the network.
*/
async function runDistContract(fontEntries, licenseEntries) {
  const distPath = `${DIST_DIR}/`;

  let info;
  try {
    info = await stat(rel(distPath));
  } catch {
    fail(
      `${DIST_DIR}/ does not exist. Build-output mode verifies the bytes a ` +
        "browser would actually receive, so it requires a completed build: run " +
        "`npm run build` first. This mode never falls back to a source-only " +
        "pass, because a scan that silently did not happen is indistinguishable " +
        "in a green log from a scan that found nothing.",
    );
    return "";
  }
  if (!info.isDirectory()) {
    fail(`${DIST_DIR} exists but is not a directory.`);
    return "";
  }

  // 1. Enumerate every regular file, depth first, in a stable order.
  const files = [];
  const walk = async (relativeDir) => {
    const entries = await readdir(rel(`${DIST_DIR}/${relativeDir}`), {
      withFileTypes: true,
    });
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        fail(
          `${DIST_DIR}/${relativePath} is neither a regular file nor a ` +
            "directory. Deployable output must contain only files and " +
            "directories; a symlink or device node cannot be scanned honestly.",
        );
      }
    }
  };
  await walk("");

  if (files.length === 0) {
    fail(
      `${DIST_DIR}/ exists but contains no files, so the scan below would ` +
        "pass vacuously. Build the frontend before running this mode.",
    );
    return "";
  }

  // 2. No forbidden byte string, anywhere.
  const markers = FORBIDDEN_OUTPUT_MARKERS.map((text) => ({
    text,
    bytes: Buffer.from(text, "latin1"),
  }));
  let scannedBytes = 0;
  for (const relativePath of files) {
    const bytes = await readFile(rel(`${DIST_DIR}/${relativePath}`));
    scannedBytes += bytes.length;
    for (const marker of markers) {
      const at = bytes.indexOf(marker.bytes);
      if (at !== -1) {
        fail(
          `${DIST_DIR}/${relativePath} contains the forbidden string ` +
            `"${marker.text}" at byte offset ${at}. Fonts are self-hosted; no ` +
            "Google font host and no deferred-font loader may reach deployable " +
            "output, whether as a runtime dependency or as inert metadata a " +
            "later audit of the build cannot tell apart from one.",
        );
      }
    }
  }

  // 3. The provenance manifest must not ship.
  for (const relativePath of files) {
    const segments = relativePath.split("/");
    if (segments[segments.length - 1] === "PROVENANCE.json" || segments.includes("font-provenance")) {
      fail(
        `${DIST_DIR}/${relativePath} ships the provenance manifest. It lives in ` +
          "font-provenance/ precisely so Vite never copies it into " +
          `${DIST_DIR}/: it records the gstatic URLs the faces were cut from, ` +
          "and a provenance URL shipped to browsers is indistinguishable, to any " +
          "later audit of the build output, from a runtime font dependency.",
      );
    }
  }

  // 4. dist/fonts holds exactly the declared inventory, byte-for-byte.
  if (fontEntries.length !== EXPECTED_FONT_FILE_COUNT) {
    fail(
      `${PROVENANCE_PATH} declares ${fontEntries.length} font files; expected ` +
        `${EXPECTED_FONT_FILE_COUNT}. The built inventory below is checked ` +
        "against that manifest, so an unexpected manifest invalidates it.",
    );
  }
  if (licenseEntries.length !== EXPECTED_LICENCE_COUNT) {
    fail(
      `${PROVENANCE_PATH} declares ${licenseEntries.length} licence files; ` +
        `expected ${EXPECTED_LICENCE_COUNT}, one per family.`,
    );
  }

  const distOf = (entry) => String(entry.path).replace(/^frontend\/public\//, "");

  const expectedFontPaths = fontEntries.map(distOf).sort();
  const expectedLicencePaths = licenseEntries.map(distOf).sort();
  const observedFontPaths = files
    .filter((path) => path.startsWith("fonts/") && !path.startsWith("fonts/licenses/"))
    .sort();
  const observedLicencePaths = files
    .filter((path) => path.startsWith("fonts/licenses/"))
    .sort();

  const compareInventory = (label, expected, observed) => {
    const extra = observed.filter((path) => !expected.includes(path));
    const missing = expected.filter((path) => !observed.includes(path));
    if (extra.length > 0) {
      fail(
        `${DIST_DIR}/ contains undeclared ${label} file(s): ` +
          `${extra.join(", ")}. Only the files ${PROVENANCE_PATH} declares may ` +
          "be served.",
      );
    }
    if (missing.length > 0) {
      fail(
        `${DIST_DIR}/ is missing declared ${label} file(s): ` +
          `${missing.join(", ")}. The build did not carry the vendored assets ` +
          "into deployable output.",
      );
    }
  };
  compareInventory("font", expectedFontPaths, observedFontPaths);
  compareInventory("licence", expectedLicencePaths, observedLicencePaths);

  let verifiedAssets = 0;
  for (const entry of [...fontEntries, ...licenseEntries]) {
    const relativePath = distOf(entry);
    if (!files.includes(relativePath)) continue;
    const bytes = await readFile(rel(`${DIST_DIR}/${relativePath}`));
    if (bytes.length !== entry.bytes) {
      fail(
        `${DIST_DIR}/${relativePath} is ${bytes.length} bytes; ` +
          `${PROVENANCE_PATH} declares ${entry.bytes}.`,
      );
      continue;
    }
    const digest = sha256(bytes);
    if (digest !== entry.sha256) {
      fail(
        `${DIST_DIR}/${relativePath} has sha256 ${digest}; ${PROVENANCE_PATH} ` +
          `declares ${entry.sha256}. The build must serve the committed bytes, ` +
          "not a re-encoded or substituted copy of them.",
      );
      continue;
    }
    verifiedAssets += 1;
  }

  return (
    `[fonts:dist] ${files.length} files (${scannedBytes} bytes) under ` +
    `${DIST_DIR}/ scanned byte-for-byte; 0 occurrences of ` +
    `${FORBIDDEN_OUTPUT_MARKERS.join(", ")}; no provenance manifest shipped; ` +
    `${verifiedAssets} declared assets (${expectedFontPaths.length} WOFF2, ` +
    `${expectedLicencePaths.length} OFL licences) match ${PROVENANCE_PATH} by ` +
    "sha256."
  );
}
