import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MODEL_DRIVEN_CLAIM_PATTERNS } from "./modelClaimPatterns.mjs";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(frontendRoot, "public");
const failures = [];

function publicAsset(path) {
  return join(publicRoot, path.replace(/^\//, ""));
}

function readPublicAsset(path, encoding) {
  try {
    return readFileSync(publicAsset(path), encoding);
  } catch {
    failures.push(`Missing public asset: ${path}`);
    return null;
  }
}

function pngDimensions(path) {
  const png = readPublicAsset(path);
  if (!png) return null;

  if (png.subarray(1, 4).toString("ascii") !== "PNG") {
    failures.push(`${path} is not a valid PNG file.`);
    return null;
  }

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

const canonicalAssets = [
  "brand/azalens-horizontal-on-dark.svg",
  "brand/azalens-horizontal-on-light.svg",
  "brand/azalens-symbol-gradient.svg",
  "brand/azalens-loading-mark-animated.svg",
];

for (const asset of canonicalAssets) {
  const svg = readPublicAsset(asset, "utf8");
  if (!svg) continue;

  for (const requiredValue of [
    "#18D96E",
    "#9AF52E",
    '<title id="title">AzaLens</title>',
  ]) {
    if (!svg.includes(requiredValue)) {
      failures.push(`${asset} is missing canonical value: ${requiredValue}`);
    }
  }
}

const manifestSource = readPublicAsset("manifest.webmanifest", "utf8");
if (manifestSource) {
  const manifest = JSON.parse(manifestSource);
  const expectedIcons = [
    {
      src: "/icons/pwa-icon-192x192.png",
      sizes: "192x192",
      purpose: "any",
    },
    {
      src: "/icons/pwa-icon-512x512.png",
      sizes: "512x512",
      purpose: "any",
    },
    {
      src: "/icons/pwa-maskable-512x512.png",
      sizes: "512x512",
      purpose: "maskable",
    },
  ];

  if (manifest.name !== "AzaLens") {
    failures.push("manifest.webmanifest must name the app AzaLens.");
  }

  for (const expected of expectedIcons) {
    const icon = manifest.icons?.find(({ src }) => src === expected.src);
    if (
      !icon ||
      icon.sizes !== expected.sizes ||
      icon.purpose !== expected.purpose
    ) {
      failures.push(
        `Manifest icon contract is invalid for ${expected.src}.`,
      );
      continue;
    }

    const [width, height] = expected.sizes.split("x").map(Number);
    const actual = pngDimensions(expected.src);
    if (actual && (actual.width !== width || actual.height !== height)) {
      failures.push(
        `${expected.src} is ${actual.width}x${actual.height}; expected ${expected.sizes}.`,
      );
    }
  }
}

const html = readFileSync(join(frontendRoot, "index.html"), "utf8");
for (const reference of [
  "/favicon.svg",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/azalens-social-preview.png",
]) {
  if (!html.includes(reference)) {
    failures.push(`index.html does not reference ${reference}.`);
  }
  readPublicAsset(reference);
}

/*
 * Social card integrity pin.
 *
 * The card this replaced carried "AI-powered stock intelligence" in rendered
 * pixels, where no text search in this repository could see it, while og:image
 * and twitter:image published it on every shared link.
 *
 * A checksum cannot read pixels, and this check does not claim to. What it
 * guarantees is narrower and still worth having: the reviewed asset is the
 * shipped asset. The old card cannot return silently, and any replacement is a
 * deliberate, visible diff that forces a human to look at the image before it
 * ships. Changing the artwork means changing this hash in the same commit.
 *
 * Deliberately not OCR-in-CI: a false negative there would be worse than no
 * check, because it would manufacture confidence in exactly the place that has
 * already failed once. Reading the pixels stays a manual review step.
 */
const SOCIAL_PREVIEW = {
  path: "/azalens-social-preview.png",
  width: 1200,
  height: 630,
  sha256: "c84b6e9ec436290381b720fe883facd4507be5b7d1bdbdeab0da5d23e9e65e6b",
};

const socialPreview = readPublicAsset(SOCIAL_PREVIEW.path);
if (socialPreview) {
  const actualHash = createHash("sha256").update(socialPreview).digest("hex");
  if (actualHash !== SOCIAL_PREVIEW.sha256) {
    failures.push(
      `${SOCIAL_PREVIEW.path} is not the reviewed asset (sha256 ${actualHash}). ` +
        "If this change is intentional, review the rendered image and update the pin.",
    );
  }

  const size = pngDimensions(SOCIAL_PREVIEW.path);
  if (
    size &&
    (size.width !== SOCIAL_PREVIEW.width || size.height !== SOCIAL_PREVIEW.height)
  ) {
    failures.push(
      `${SOCIAL_PREVIEW.path} is ${size.width}x${size.height}; social cards ` +
        `require ${SOCIAL_PREVIEW.width}x${SOCIAL_PREVIEW.height}.`,
    );
  }
}

for (const attribute of ['property="og:image:alt"']) {
  if (!html.includes(attribute)) {
    failures.push(`index.html does not declare ${attribute}.`);
  }
}

/*
 * Public model-driven-claim check (roadmap item 2.17).
 *
 * AzaLens v1 contains no model, no SDK and no model key: the analysis is
 * deterministic arithmetic and string templates (docs/LLM_DECISION_V1.md §8
 * item 4). The rendered DOM is guarded by src/pages/LandingPage.test.tsx; this
 * guards the other half a visitor receives — the parsed metadata and the web-app
 * manifest — which no component test can see.
 *
 * Scoped to *published* values, never to repository source. The repository must
 * stay free to document the defect it removed, to state explicit negations, and
 * to keep unmounted code that still carries the old wording. The scope control
 * at the end of this block fails if that freedom is ever traded away for a
 * repo-wide grep.
 *
 * The patterns live in scripts/modelClaimPatterns.mjs so the rendered-DOM test,
 * this metadata check and the visual spec cannot drift apart again. They are
 * case-insensitive: word boundaries, not letter case, are what keep them out of
 * ordinary words like "Explained".
 */

function metaContent(source, key) {
  const pattern = new RegExp(
    `<meta[^>]*\\b(?:name|property)=["']${key}["'][^>]*>`,
    "is",
  );
  const tag = source.match(pattern)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/is)?.[1] ?? null;
}

const publishedText = {
  "<title>": html.match(/<title>(.*?)<\/title>/is)?.[1] ?? null,
  "meta description": metaContent(html, "description"),
  "og:title": metaContent(html, "og:title"),
  "og:description": metaContent(html, "og:description"),
  "og:site_name": metaContent(html, "og:site_name"),
  "og:image:alt": metaContent(html, "og:image:alt"),
  "application-name": metaContent(html, "application-name"),
  "apple-mobile-web-app-title": metaContent(html, "apple-mobile-web-app-title"),
  "twitter:card": metaContent(html, "twitter:card"),
  "twitter:image": metaContent(html, "twitter:image"),
};

if (manifestSource) {
  const manifest = JSON.parse(manifestSource);
  publishedText["manifest name"] = manifest.name ?? null;
  publishedText["manifest short_name"] = manifest.short_name ?? null;
  publishedText["manifest description"] = manifest.description ?? null;
}

for (const [label, value] of Object.entries(publishedText)) {
  if (typeof value !== "string") continue;
  for (const pattern of MODEL_DRIVEN_CLAIM_PATTERNS) {
    if (pattern.test(value)) {
      failures.push(
        `${label} publishes a model-driven claim matching ${pattern}: "${value}".`,
      );
    }
  }
}

const APPROVED_TITLE = "AzaLens — Explainable Stock Analysis";
for (const [label, expected] of [
  ["<title>", APPROVED_TITLE],
  ["og:title", APPROVED_TITLE],
]) {
  if (publishedText[label] !== expected) {
    failures.push(
      `${label} must be "${expected}" so mounted copy and metadata state the ` +
        `same positioning; found "${publishedText[label]}".`,
    );
  }
}

if (!publishedText["og:image:alt"]) {
  failures.push("index.html does not declare og:image:alt for the social card.");
}

/*
 * Scope, stated as a boundary rather than enforced as a dependency.
 *
 * `MODEL_DRIVEN_CLAIM_PATTERNS` describes wording this product must not publish.
 * It says nothing about where that wording may exist in the repository. The
 * scope is decided entirely by which values a caller passes in — above, the
 * parsed page metadata and manifest branding; in LandingPage.test.tsx, the
 * rendered DOM. Nothing here reads repository source, and nothing should.
 *
 * So historical documentation, explicit negations and unmounted dead code are
 * simply outside the input domain. They are not exceptions that need granting,
 * and their continued existence — or their wording — is **not required**. An
 * earlier revision of this file asserted that docs/LLM_DECISION_V1.md,
 * WHAT_TO_DO_NEXT.md and TradePlan.tsx must still *contain* a model-driven
 * claim, and that TradePlan must stay exported from the analysis barrel. That
 * inverted the contract: it turned "permitted" into "required" and made the
 * brand check fail the moment the planned dead-code cleanup deleted TradePlan
 * or dropped its export, converting temporary debt into a test-enforced
 * dependency. Those assertions are removed.
 *
 * The boundary is proved by controlled mutation instead: injecting a claim into
 * mounted copy or published metadata must fail these guards, while injecting one
 * into documentation or unmounted code must not. That evidence belongs in a test
 * run, not in a permanent requirement that the debt survive.
 */

for (const sourcePath of [
  "src/components/landing/Navbar.tsx",
  "src/components/layout/AppShell.tsx",
]) {
  const source = readFileSync(join(frontendRoot, sourcePath), "utf8");
  if (/>\s*A\s*</.test(source) || source.includes("az-brand-mark")) {
    failures.push(`${sourcePath} still contains the fabricated plain-A logo.`);
  }
  if (!source.includes("<AzaLensLogo")) {
    failures.push(`${sourcePath} does not render the approved AzaLens logo.`);
  }
}

if (failures.length > 0) {
  console.error("AzaLens brand asset check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "AzaLens brand asset check passed: canonical logos, metadata, and PWA icons are valid.",
  );
}
