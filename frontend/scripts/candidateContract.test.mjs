import { spawnSync } from "node:child_process";
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

/** One capture of the shape the manifest records, and the six-candidate set. */
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
  ],
});

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
    // single pinned scale covers all six candidates. If the call is ever split,
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
  it("accepts exactly the six expected candidates on the CSS contract", () => {
    expect(() => assertManifestContract(validManifest())).not.toThrow();
    expect(EXPECTED_CANDIDATE_FILENAMES).toHaveLength(6);
  });

  it("rejects a seventh candidate or a missing one", () => {
    const extra = validManifest();
    extra.candidates.push(candidate("candidate--landing-extra.png", "10x10"));
    expect(() => assertManifestContract(extra)).toThrow(/expected 6 candidates, found 7/);

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


describe("the expected candidate set is exact", () => {
  it("names six distinct candidates, every one of them prefixed candidate--", () => {
    expect(new Set(EXPECTED_CANDIDATE_FILENAMES).size).toBe(
      EXPECTED_CANDIDATE_FILENAMES.length,
    );
    for (const name of EXPECTED_CANDIDATE_FILENAMES) {
      // The prefix is what keeps a candidate from ever being mistaken for, or
      // written over, an accepted baseline.
      expect(name).toMatch(/^candidate--/);
      expect(name).toMatch(/\.png$/);
      expect(name).not.toMatch(/-chromium-(linux|darwin)\.png$/);
    }
  });

  it("counts a duplicate as a duplicate rather than collapsing it", () => {
    /*
     * The dangerous shape: six entries, so a length check passes, but one
     * candidate captured twice and another never captured at all. A Set-based
     * comparison of names against the expected list would accept this, and the
     * missing view would silently never be reviewed.
     */
    const m = validManifest();
    m.candidates[1] = candidate("candidate--landing-page-day-desktop.png", "1280x4734");

    expect(() => assertManifestContract(m)).toThrow(
      /missing candidate candidate--landing-page-night-desktop\.png/,
    );
  });

  it("rejects a duplicate that arrives as a seventh entry", () => {
    const m = validManifest();
    m.candidates.push(candidate("candidate--landing-verdict-mobile.png", "300x3129", 3));

    expect(() => assertManifestContract(m)).toThrow(/expected 6 candidates, found 7/);
  });
});

describe("candidate diagnostics are deterministic and complete", () => {
  const messageFor = (build) => {
    try {
      assertManifestContract(build());
    } catch (error) {
      return error.message;
    }
    throw new Error("expected the contract to be violated");
  };

  it("produces byte-identical text for the same violation twice", () => {
    const damage = () => {
      const m = validManifest();
      m.candidates[2].dimensions = "1170x28770";
      return m;
    };

    expect(messageFor(damage)).toBe(messageFor(damage));
  });

  it("reports every problem in one throw, in a stable order", () => {
    const message = messageFor(() => {
      const m = validManifest();
      m.screenshotScale = "device";
      m.candidates[0].filename = "candidate--landing-extra.png";
      m.candidates[3].blockedRequests = ["https://finnhub.io/api/v1/quote"];
      return m;
    });

    const problems = message
      .split("\n")
      .filter((line) => line.startsWith("  - "))
      .map((line) => line.slice(4));

    expect(problems).toEqual([
      'manifest records screenshotScale "device"; must be "css"',
      "missing candidate candidate--landing-page-day-desktop.png",
      "unexpected candidate candidate--landing-extra.png",
      "candidate--landing-page-night-mobile.png recorded blocked requests: https://finnhub.io/api/v1/quote",
    ]);
  });
});

describe("a malformed manifest fails closed", () => {
  it("refuses a manifest with no candidates array rather than passing vacuously", () => {
    expect(() => assertManifestContract({ screenshotScale: "css" })).toThrow();
    expect(() => assertManifestContract({ screenshotScale: "css", candidates: {} })).toThrow();
  });

  it("refuses an empty capture run", () => {
    expect(() => assertManifestContract({ screenshotScale: "css", candidates: [] })).toThrow(
      /expected 6 candidates, found 0/,
    );
  });

  it("refuses a candidate that does not record the scale it was captured on", () => {
    const m = validManifest();
    delete m.candidates[4].screenshotScale;

    expect(() => assertManifestContract(m)).toThrow(
      /candidate--landing-verdict-desktop\.png recorded scale "undefined"/,
    );
  });
});

describe("no candidate or evidence artifact is ever committed", () => {
  const repoRoot = dirname(scriptsDir);

  const git = (...args) =>
    spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });

  it("tracks no candidate image, manifest, or output directory", () => {
    const tracked = git("ls-files", "--", ".").stdout.split("\n").filter(Boolean);

    expect(tracked.length).toBeGreaterThan(0);
    const artifacts = tracked.filter(
      (file) =>
        /(^|\/)candidate--/.test(file) ||
        /(^|\/)candidate-manifest\.json$/.test(file) ||
        /(^|\/)(candidate-artifacts|technical-candidate-artifacts|methodology-candidate-artifacts)\//.test(
          file,
        ),
    );

    expect(artifacts).toEqual([]);
  });

  it("keeps all three candidate output directories ignored", () => {
    for (const dir of [
      "candidate-artifacts",
      "technical-candidate-artifacts",
      "methodology-candidate-artifacts",
    ]) {
      const check = git("check-ignore", "--quiet", `${dir}/candidate--probe.png`);
      expect(check.status, `${dir} is not git-ignored`).toBe(0);
    }
  });
});
