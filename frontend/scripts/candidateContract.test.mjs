import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EXPECTED_CANDIDATE_FILENAMES,
  assertCssScaleGeometry,
  assertManifestContract,
} from "./candidateContract.mjs";

/*
 * Roadmap item 1.11, defect 5.
 *
 * Every landing candidate artifact produced before this contract existed was
 * captured with `page.screenshot()`, whose default is `scale: "device"`. The
 * visual spec compares with `toHaveScreenshot()`, whose default is
 * `scale: "css"`. Desktop Chrome is DPR 1 so the two agreed; iPhone 13 is DPR 3,
 * so every mobile candidate was exactly 3x oversized and could never match.
 *
 * The bad candidates looked right in an image viewer and were byte-stable
 * across runs, and that stability was mistaken for correctness. These tests
 * hold the contract that would have caught it.
 */

const scriptsDir = dirname(fileURLToPath(import.meta.url));

function captureSource() {
  return readFileSync(join(scriptsDir, "captureLandingCandidates.mjs"), "utf8");
}

/*
 * Assert against code, not prose. The capture script explains the device-scale
 * defect at length in its comments, and a naive regex over the whole file
 * matches that explanation rather than the call it describes.
 */
function captureCode() {
  return captureSource()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** iPhone 13. The value that made the defect invisible on desktop. */
const MOBILE_DPR = 3;

describe("candidate capture pins the screenshot scale", () => {
  it("passes scale: \"css\" explicitly rather than relying on the default", () => {
    const code = captureCode();

    expect(code).toMatch(/scale:\s*"css"/);
    // The device-scale default is what produced the invalid candidates.
    expect(code).not.toMatch(/scale:\s*"device"/);
  });

  it("applies that scale on the single shared screenshot call for every capture", () => {
    const code = captureCode();

    // One screenshot call serves desktop and mobile, full-page and scoped, so a
    // single pinned scale covers all ten candidates. If the call is ever split,
    // this count changes and the assertion below forces the scale to be
    // re-pinned on each path.
    const screenshotCalls = code.match(/\.screenshot\(\{/g) ?? [];
    const pinnedScales = code.match(/scale:\s*"css"/g) ?? [];

    expect(screenshotCalls.length).toBeGreaterThan(0);
    expect(pinnedScales.length).toBe(screenshotCalls.length);
  });

  it("records the scale contract in the manifest", () => {
    const code = captureCode();

    expect(code).toMatch(/screenshotScale:\s*"css"/);
    expect(code).toMatch(/expectedCssDimensions/);
    expect(code).toMatch(/devicePixelRatio/);
  });
});

describe("CSS-scale geometry assertion", () => {
  it("accepts a candidate whose pixels equal the measured CSS geometry", () => {
    expect(() =>
      assertCssScaleGeometry({
        name: "landing-page-day-mobile",
        actual: { width: 390, height: 9590 },
        expected: { width: 390, height: 9590 },
        devicePixelRatio: MOBILE_DPR,
      }),
    ).not.toThrow();
  });

  it("rejects a mobile full-page candidate multiplied by the device pixel ratio", () => {
    // The exact shape of the defect: 1170x28770 instead of 390x9590.
    expect(() =>
      assertCssScaleGeometry({
        name: "landing-page-day-mobile",
        actual: { width: 390 * MOBILE_DPR, height: 9590 * MOBILE_DPR },
        expected: { width: 390, height: 9590 },
        devicePixelRatio: MOBILE_DPR,
      }),
    ).toThrow(/device pixel ratio \(3\).*scale "device"/s);
  });

  it("rejects a scoped verdict candidate multiplied by the device pixel ratio", () => {
    // 900x9387 instead of 300x3129.
    expect(() =>
      assertCssScaleGeometry({
        name: "landing-verdict-mobile",
        actual: { width: 300 * MOBILE_DPR, height: 3129 * MOBILE_DPR },
        expected: { width: 300, height: 3129 },
        devicePixelRatio: MOBILE_DPR,
      }),
    ).toThrow(/scale "device"/);
  });

  it("tolerates one pixel of integer rounding, and no more", () => {
    const base = {
      name: "landing-page-day-desktop",
      expected: { width: 1280, height: 4734 },
      devicePixelRatio: 1,
    };

    expect(() =>
      assertCssScaleGeometry({ ...base, actual: { width: 1280, height: 4735 } }),
    ).not.toThrow();
    expect(() =>
      assertCssScaleGeometry({ ...base, actual: { width: 1280, height: 4736 } }),
    ).toThrow(/does not match the CSS screenshot contract/);
  });

  it("still catches a desktop mismatch, where the ratio is 1 and cannot explain it", () => {
    expect(() =>
      assertCssScaleGeometry({
        name: "landing-verdict-desktop",
        actual: { width: 1142, height: 1385 },
        expected: { width: 1142, height: 1200 },
        devicePixelRatio: 1,
      }),
    ).toThrow(/does not match the CSS screenshot contract/);
  });
});

describe("candidate manifest contract", () => {
  const candidate = (filename, dims, dpr = 1) => ({
    filename,
    dimensions: dims,
    expectedCssDimensions: dims,
    devicePixelRatio: dpr,
    screenshotScale: "css",
    blockedRequests: [],
  });

  const validManifest = () => ({
    screenshotScale: "css",
    candidates: [
      candidate("candidate--landing-page-day-desktop.png", "1280x4734"),
      candidate("candidate--landing-page-night-desktop.png", "1280x4734"),
      candidate("candidate--landing-page-day-mobile.png", "390x9590", 3),
      candidate("candidate--landing-page-night-mobile.png", "390x9590", 3),
      candidate("candidate--landing-verdict-desktop.png", "1142x1385"),
      candidate("candidate--landing-verdict-mobile.png", "300x3129", 3),
      candidate("candidate--methodology-page-day-desktop.png", "1280x1800"),
      candidate("candidate--methodology-page-night-desktop.png", "1280x1800"),
      candidate("candidate--methodology-page-day-mobile.png", "390x3200", 3),
      candidate("candidate--methodology-page-night-mobile.png", "390x3200", 3),
    ],
  });

  it("accepts exactly the ten expected candidates on the CSS contract", () => {
    expect(() => assertManifestContract(validManifest())).not.toThrow();
    expect(EXPECTED_CANDIDATE_FILENAMES).toHaveLength(10);
  });

  it("rejects an eleventh candidate or a missing one", () => {
    const extra = validManifest();
    extra.candidates.push(candidate("candidate--landing-extra.png", "10x10"));
    expect(() => assertManifestContract(extra)).toThrow(/expected 10 candidates, found 11/);

    const short = validManifest();
    short.candidates.pop();
    expect(() => assertManifestContract(short)).toThrow(/missing candidate/);
  });

  it("rejects a candidate written under an accepted-baseline filename", () => {
    const m = validManifest();
    m.candidates[0].filename = "landing-page-day-desktop-chromium-linux.png";
    expect(() => assertManifestContract(m)).toThrow(/accepted-baseline filename/);
  });

  it("rejects dimensions that disagree with the measured CSS geometry", () => {
    const m = validManifest();
    m.candidates[2].dimensions = "1170x28770";
    expect(() => assertManifestContract(m)).toThrow(/is 1170x28770 but expected CSS/);
  });

  it("rejects a manifest not captured on the CSS contract", () => {
    const m = validManifest();
    m.screenshotScale = "device";
    expect(() => assertManifestContract(m)).toThrow(/must be "css"/);
  });

  it("rejects a capture that reached a blocked or provider endpoint", () => {
    const m = validManifest();
    m.candidates[0].blockedRequests = ["https://finnhub.io/api/v1/quote"];
    expect(() => assertManifestContract(m)).toThrow(/blocked requests/);
  });
});
