import { readFile } from "node:fs/promises";

/*
  Regression guard for Phase 0 item 1.10: --az-shariah existed in both
  themes but was never registered as --color-shariah in the @theme inline
  block, so text-shariah/bg-shariah/border-shariah generated no Tailwind
  utility and were inert. This mirrors checkContrast.mjs's approach of
  reading index.css as text — the source of truth for the tokens — rather
  than trusting a jsdom-rendered guess.
*/
const css = await readFile(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

const failures = [];

const themeInlineBlock = css.slice(
  css.indexOf("@theme inline {"),
  css.indexOf("\n}", css.indexOf("@theme inline {")),
);

if (!/--color-shariah:\s*var\(--az-shariah\);/.test(themeInlineBlock)) {
  failures.push(
    "@theme inline is missing '--color-shariah: var(--az-shariah);' — " +
      "text-shariah/bg-shariah/border-shariah utilities will be inert.",
  );
}

const themeSections = {
  night: css.slice(
    css.indexOf(':root,\n[data-theme="night"] {'),
    css.indexOf('[data-theme="day"] {'),
  ),
  day: css.slice(
    css.indexOf('[data-theme="day"] {'),
    css.indexOf("\n:root {", css.indexOf('[data-theme="day"] {')),
  ),
};

// Pinned to the values verified accessible by checkContrast.mjs. Phase 0
// item 1.10 requires stopping and explaining before changing either value.
const expectedShariahHex = {
  night: "#a78bfa",
  day: "#6d28d9",
};

for (const [theme, section] of Object.entries(themeSections)) {
  if (!section) {
    throw new Error(`Unable to locate the ${theme} theme token block.`);
  }

  const match = section.match(/--az-shariah:\s*(#[0-9a-fA-F]{6})\s*;/);

  if (!match) {
    failures.push(`${theme}: --az-shariah token is missing.`);
    continue;
  }

  if (match[1].toLowerCase() !== expectedShariahHex[theme]) {
    failures.push(
      `${theme}: --az-shariah changed from ${expectedShariahHex[theme]} to ` +
        `${match[1]} without the required stop-and-explain step (item 1.10).`,
    );
  }
}

if (failures.length > 0) {
  console.error("Design token registration check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    "Design token registration check passed: --color-shariah is registered " +
      "in @theme inline, and night/day --az-shariah values are unchanged.",
  );
}
