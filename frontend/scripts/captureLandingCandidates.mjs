/*
 * Landing-page candidate capture (roadmap item 1.11).
 *
 * This is NOT the visual regression suite and it produces NOTHING that may be
 * committed. It renders the same ten views the visual specs compare, on the same
 * CSS-pixel contract, so a human can look at what a baseline would contain
 * before anyone commits to it.
 *
 * That serves three moments in a baseline's life: initial acceptance, a later
 * intentional replacement, and verifying afterwards which artifact a committed
 * baseline came from. It never creates or updates an accepted baseline — that
 * remains a separately reviewed and explicitly authorised step.
 *
 * Deliberate properties:
 *
 *   - It never calls `toHaveScreenshot`, so it cannot write a baseline by any
 *     code path, whatever `updateSnapshots` is set to.
 *   - It writes only into `frontend/candidate-artifacts/`, which is gitignored
 *     and is not a Playwright snapshot directory.
 *   - Every file it writes is prefixed `candidate--`, so a candidate can never
 *     be mistaken for an accepted baseline in a file listing or a diff.
 *   - It emits a manifest recording the source commit and tree, so a reviewer
 *     can prove which revision they reviewed and a later acceptance step can
 *     prove it is accepting the bytes that were reviewed.
 *
 * Candidates are review evidence. Accepted baselines are produced separately,
 * on Linux, under explicit authorisation.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, devices } from "playwright";

import {
  assertCssScaleGeometry,
  assertManifestContract,
} from "./candidateContract.mjs";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(frontendRoot, "candidate-artifacts");
const HOST = "127.0.0.1";
const PORT = Number(process.env.CANDIDATE_PORT ?? 5177);
const BASE_URL = `http://${HOST}:${PORT}`;

/*
 * The ten captures, and the baseline each one is a candidate *for*. The mapping
 * is recorded rather than implied so the acceptance step never has to guess.
 */
const CAPTURES = [
  { name: "landing-page-day-desktop", route: "/", theme: "day", project: "desktop", scope: "page" },
  { name: "landing-page-night-desktop", route: "/", theme: "night", project: "desktop", scope: "page" },
  { name: "landing-page-day-mobile", route: "/", theme: "day", project: "mobile", scope: "page" },
  { name: "landing-page-night-mobile", route: "/", theme: "night", project: "mobile", scope: "page" },
  { name: "landing-verdict-desktop", route: "/", theme: "night", project: "desktop", scope: "verdict" },
  { name: "landing-verdict-mobile", route: "/", theme: "night", project: "mobile", scope: "verdict" },
  { name: "methodology-page-day-desktop", route: "/methodology", theme: "day", project: "desktop", scope: "page" },
  { name: "methodology-page-night-desktop", route: "/methodology", theme: "night", project: "desktop", scope: "page" },
  { name: "methodology-page-day-mobile", route: "/methodology", theme: "day", project: "mobile", scope: "page" },
  { name: "methodology-page-night-mobile", route: "/methodology", theme: "night", project: "mobile", scope: "page" },
];

const FONT_HOSTS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];
const PROVIDER_PATTERNS = [/\/api\//i, /finnhub/i, /twelvedata/i, /alphavantage/i, /yahoo/i, /yfinance/i];

const PROJECTS = {
  desktop: devices["Desktop Chrome"],
  mobile: devices["iPhone 13"],
};

function baselineFor({ name, scope, project }) {
  // Mirrors Playwright's `<name>-<project>-<platform>.png` on Linux CI.
  const stem = scope === "verdict" ? "landing-verdict" : name.replace(`-${project}`, "");
  return `${stem}-${project}-chromium-linux.png`;
}

function git(...args) {
  return execFileSync("git", args, { cwd: frontendRoot, encoding: "utf8" }).trim();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function pngSize(buffer) {
  if (buffer.subarray(1, 4).toString("ascii") !== "PNG") {
    throw new Error("candidate is not a valid PNG");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Dev server did not become ready at ${BASE_URL}`);
}

async function capture(browser, spec) {
  const context = await browser.newContext({
    ...PROJECTS[spec.project],
    baseURL: BASE_URL,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript((theme) => {
    window.localStorage.setItem("azalens-theme", theme);
  }, spec.theme);

  const page = await context.newPage();

  /*
   * Fonts are the one intended third party: index.html loads the Google Fonts
   * stylesheet, and blocking it would render candidates in fallback type, so
   * they would not represent what a visitor sees. Anything that looks like an
   * analysis endpoint or a market-data provider is recorded and aborted — a
   * candidate capture must never spend provider budget.
   */
  const providerRequests = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();

    if (PROVIDER_PATTERNS.some((pattern) => pattern.test(url))) {
      providerRequests.push(url);
      await route.abort();
      return;
    }

    const allowed =
      url.startsWith(`http://${HOST}:`) ||
      url.startsWith("http://localhost:") ||
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      FONT_HOSTS.some((host) => url.startsWith(host));

    if (!allowed) {
      providerRequests.push(url);
      await route.abort();
      return;
    }

    await route.continue();
  });

  await page.goto(spec.route, { waitUntil: "load" });
  if (spec.route === "/") {
    await page.locator("#product").waitFor({ state: "visible" });
    await page.getByTestId("landing-demo-confirmed").waitFor({ state: "visible" });
  } else {
    await page
      .getByRole("heading", { level: 1, name: "Methodology & limitations" })
      .waitFor({ state: "visible" });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const file = join(outputDir, `candidate--${spec.name}.png`);
  const target =
    spec.scope === "verdict"
      ? page.getByTestId("landing-demo-confirmed")
      : page;

  /*
   * Scoped captures only: hide the sticky header while the shutter is open.
   *
   * The card is taller than the viewport, so Playwright stitches it — and a
   * `position: sticky` header stays pinned to the viewport throughout, painting
   * itself into the middle of the image as a dark band across the card.
   * `visibility: hidden` (not `display: none`) removes it from paint while
   * preserving layout, because unlike fixed chrome a sticky header is in flow.
   *
   * The fixed skip link is hidden for the same reason: it sits at the same
   * viewport position in every stitch slice, and at mobile — where the card
   * spans nearly the full width — it printed into the middle of the card.
   *
   * The four full-page captures deliberately keep the real navbar: it renders at
   * the top of the document, which is exactly where the page reserves space for
   * it, and it is part of what a reviewer needs to see.
   */
  const stickyChromeStyle =
    spec.scope === "verdict"
      ? await page.addStyleTag({
          content:
            "header.sticky, .az-skip-link { visibility: hidden !important; }",
        })
      : null;

  /*
   * Measure the CSS-pixel geometry the screenshot is contracted to produce,
   * while the same chrome is hidden that the shutter will see.
   *
   * Full page  -> viewport width x document scrollHeight, in CSS pixels.
   * Scoped     -> the element's own CSS-pixel bounding box.
   *
   * Playwright rounds screenshot output to whole pixels, so a 1px tolerance is
   * allowed on each axis and nothing more. This is what ties the assertion to
   * measured geometry rather than to today's numbers.
   */
  const expected =
    spec.scope === "page"
      ? await page.evaluate(() => ({
          width: Math.round(document.documentElement.clientWidth),
          height: Math.round(document.documentElement.scrollHeight),
        }))
      : await target.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { width: Math.round(r.width), height: Math.round(r.height) };
        });

  const dpr = await page.evaluate(() => window.devicePixelRatio);

  try {
    /*
     * `scale: "css"` is explicit and must stay explicit.
     *
     * Playwright visual regression compares with `toHaveScreenshot()`, whose
     * default is `scale: "css"` — CSS pixels, device pixel ratio ignored. Plain
     * `page.screenshot()` defaults to `scale: "device"` instead, which silently
     * multiplies by the DPR. On Desktop Chrome (DPR 1) the two agree, so the
     * difference is invisible; on iPhone 13 (DPR 3) it produced candidates 3x
     * too large in both axes.
     *
     * Those candidates looked perfectly correct in any image viewer, and were
     * even byte-stable across runs — but they could never match what the visual
     * spec receives. Candidate evidence must be captured on the same contract as
     * the consumer that will compare it, so the scale is pinned here rather than
     * inherited from a default.
     */
    await target.screenshot({
      path: file,
      animations: "disabled",
      caret: "hide",
      scale: "css",
      ...(spec.scope === "page" ? { fullPage: true } : {}),
    });
  } finally {
    await stickyChromeStyle?.evaluate((node) => node.parentNode?.removeChild(node));
  }

  await context.close();

  const bytes = readFileSync(file);
  const { width, height } = pngSize(bytes);
  const viewport = PROJECTS[spec.project].viewport;

  /*
   * Dimension contract. A candidate that is not the size the visual spec will
   * receive is not evidence, however good it looks, so this fails the capture
   * rather than emitting a plausible but incompatible PNG.
   */
  assertCssScaleGeometry({
    name: spec.name,
    actual: { width, height },
    expected,
    devicePixelRatio: dpr,
  });

  return {
    filename: `candidate--${spec.name}.png`,
    candidateFor: baselineFor(spec),
    scope: spec.scope,
    theme: spec.theme,
    project: spec.project,
    viewport: `${viewport.width}x${viewport.height}`,
    dimensions: `${width}x${height}`,
    expectedCssDimensions: `${expected.width}x${expected.height}`,
    devicePixelRatio: dpr,
    screenshotScale: "css",
    bytes: bytes.length,
    sha256: sha256(bytes),
    blockedRequests: providerRequests,
  };
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const server = spawn(
  "npm",
  ["run", "dev", "--", "--host", HOST, "--port", String(PORT), "--strictPort"],
  { cwd: frontendRoot, stdio: "inherit" },
);

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();

  const captures = [];
  for (const spec of CAPTURES) {
    captures.push(await capture(browser, spec));
  }

  const socialPath = join(frontendRoot, "public/azalens-social-preview.png");
  const socialBytes = readFileSync(socialPath);
  const socialSize = pngSize(socialBytes);

  const manifest = {
    kind: "landing-visual-candidates",
    note:
      "Review evidence only. These are NOT accepted baselines and must not be " +
      "copied into any snapshot directory. Baseline acceptance is a separate, " +
      "explicitly authorised step performed on Linux CI output.",
    generatedAt: new Date().toISOString(),
    source: {
      commit: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}"),
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    },
    platform: `${process.platform}-${process.arch}`,
    /*
     * Recorded so a later verification can prove the candidates were captured on
     * the same contract the visual spec compares with, without re-running them.
     */
    screenshotScale: "css",
    scaleContract:
      "Captured with scale:'css' to match toHaveScreenshot(), which compares in " +
      "CSS pixels. Each candidate records expectedCssDimensions and the device " +
      "pixel ratio it was captured under; actual PNG dimensions must equal the " +
      "expected CSS dimensions within 1px of integer rounding.",
    expectedCandidateCount: CAPTURES.length,
    candidateCount: captures.length,
    candidates: captures,
    socialPreview: {
      path: "frontend/public/azalens-social-preview.png",
      dimensions: `${socialSize.width}x${socialSize.height}`,
      bytes: socialBytes.length,
      sha256: sha256(socialBytes),
    },
  };

  assertManifestContract(manifest);

  writeFileSync(
    join(outputDir, "candidate-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const blocked = captures.flatMap((entry) => entry.blockedRequests);
  if (blocked.length > 0) {
    throw new Error(
      `Provider or unexpected third-party requests during capture: ${blocked.join(", ")}`,
    );
  }
  if (captures.length !== CAPTURES.length) {
    throw new Error(
      `Expected ${CAPTURES.length} candidates, produced ${captures.length}.`,
    );
  }

  console.log(`\n${captures.length} public-page candidates written to candidate-artifacts/`);
  for (const entry of captures) {
    console.log(
      `  ${entry.filename}  ${entry.dimensions}  ${entry.bytes} bytes  ${entry.sha256}`,
    );
    console.log(`      candidate for: ${entry.candidateFor}`);
  }
  console.log(
    `\nsocial preview: ${manifest.socialPreview.dimensions} ` +
      `${manifest.socialPreview.bytes} bytes ${manifest.socialPreview.sha256}`,
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
