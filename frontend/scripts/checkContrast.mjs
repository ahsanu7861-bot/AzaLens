import { readFile } from "node:fs/promises";

const css = await readFile(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

const themeSections = {
  night: css.slice(
    css.indexOf(":root,\n[data-theme=\"night\"] {"),
    css.indexOf("[data-theme=\"day\"] {"),
  ),
  day: css.slice(
    css.indexOf("[data-theme=\"day\"] {"),
    css.indexOf("\n:root {", css.indexOf("[data-theme=\"day\"] {")),
  ),
};

const neutralTokens = ["text", "text-soft", "text-muted"];
const semanticTokens = [
  "brand",
  "positive",
  "caution",
  "critical",
  "intelligence",
  "shariah",
];
const neutralBackgrounds = ["canvas", "surface", "surface-soft"];
const semanticBackgrounds = ["canvas", "surface"];
const MINIMUM_CONTRAST = 4.5;

function readHexToken(section, token) {
  const match = section.match(
    new RegExp(`--az-${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`),
  );

  if (!match) {
    throw new Error(`Missing hexadecimal --az-${token} token.`);
  }

  return match[1];
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

const failures = [];
let checkedPairs = 0;

for (const [theme, section] of Object.entries(themeSections)) {
  if (!section) {
    throw new Error(`Unable to locate the ${theme} theme token block.`);
  }

  const pairs = [
    ...neutralBackgrounds.flatMap((background) =>
      neutralTokens.map((foreground) => ({
        background,
        foreground,
      })),
    ),
    ...semanticBackgrounds.flatMap((background) =>
      semanticTokens.map((foreground) => ({
        background,
        foreground,
      })),
    ),
  ];

  for (const { foreground, background } of pairs) {
    const ratio = contrastRatio(
      readHexToken(section, foreground),
      readHexToken(section, background),
    );
    checkedPairs += 1;

    if (ratio < MINIMUM_CONTRAST) {
      failures.push(
        `${theme}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("WCAG AA contrast budget failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `WCAG AA contrast budget passed: ${checkedPairs} semantic token pairs are at least 4.5:1.`,
  );
}
