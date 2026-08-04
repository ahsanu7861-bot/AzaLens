import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
