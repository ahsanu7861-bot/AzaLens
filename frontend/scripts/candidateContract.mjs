/*
 * The candidate-scale contract.
 *
 * Landing review candidates exist to be compared, by eye, against what the
 * visual-regression spec will later assert. That only works if both are
 * captured on the same terms.
 *
 * Playwright's `toHaveScreenshot()` compares in **CSS pixels** (`scale: "css"`).
 * Plain `page.screenshot()` defaults to `scale: "device"`, which multiplies by
 * the device pixel ratio. On Desktop Chrome (DPR 1) the two are identical, so
 * the difference is invisible; on iPhone 13 (DPR 3) it silently produces
 * candidates three times too large in both axes.
 *
 * That failure mode is unusually dangerous because the bad candidates look
 * perfectly correct in any image viewer, and are byte-stable run to run. Their
 * stability was mistaken for correctness once already. The rule this module
 * enforces:
 *
 *   Agreement between two outputs of the same pipeline proves stability, not
 *   correctness. Validity requires comparison against the independent consumer
 *   contract — here, CSS-pixel geometry.
 *
 * These functions are pure so they can be unit-tested without launching a
 * browser; the capture script calls them on every run.
 */

/** Playwright rounds screenshot output to whole pixels. Nothing larger. */
export const ROUNDING_TOLERANCE_PX = 1;

export const EXPECTED_CANDIDATE_FILENAMES = [
  "candidate--landing-page-day-desktop.png",
  "candidate--landing-page-night-desktop.png",
  "candidate--landing-page-day-mobile.png",
  "candidate--landing-page-night-mobile.png",
  "candidate--landing-verdict-desktop.png",
  "candidate--landing-verdict-mobile.png",
];

/**
 * Assert one candidate's PNG geometry equals the CSS geometry measured from the
 * live page, and is not a device-pixel-ratio multiple of it.
 */
export function assertCssScaleGeometry({
  name,
  actual,
  expected,
  devicePixelRatio,
}) {
  const dw = Math.abs(actual.width - expected.width);
  const dh = Math.abs(actual.height - expected.height);

  const looksScaledByDpr =
    devicePixelRatio !== 1 &&
    (actual.width === expected.width * devicePixelRatio ||
      actual.height === expected.height * devicePixelRatio);

  if (looksScaledByDpr) {
    throw new Error(
      `${name}: candidate is ${actual.width}x${actual.height}, exactly the ` +
        `device pixel ratio (${devicePixelRatio}) times the measured CSS geometry ` +
        `${expected.width}x${expected.height}. The screenshot was taken at ` +
        `scale "device"; visual regression compares in CSS pixels.`,
    );
  }

  if (dw > ROUNDING_TOLERANCE_PX || dh > ROUNDING_TOLERANCE_PX) {
    throw new Error(
      `${name}: candidate is ${actual.width}x${actual.height} but measured CSS ` +
        `geometry is ${expected.width}x${expected.height} ` +
        `(device pixel ratio ${devicePixelRatio}). Capture geometry does not ` +
        `match the CSS screenshot contract.`,
    );
  }
}

/**
 * Assert the finished manifest describes exactly the six expected candidates,
 * all captured on the CSS-scale contract, none of them a baseline path.
 */
export function assertManifestContract(manifest) {
  const problems = [];

  if (manifest.screenshotScale !== "css") {
    problems.push(
      `manifest records screenshotScale "${manifest.screenshotScale}"; must be "css"`,
    );
  }

  const names = manifest.candidates.map((c) => c.filename);
  if (names.length !== EXPECTED_CANDIDATE_FILENAMES.length) {
    problems.push(
      `expected ${EXPECTED_CANDIDATE_FILENAMES.length} candidates, found ${names.length}`,
    );
  }
  for (const expected of EXPECTED_CANDIDATE_FILENAMES) {
    if (!names.includes(expected)) problems.push(`missing candidate ${expected}`);
  }
  for (const name of names) {
    if (!EXPECTED_CANDIDATE_FILENAMES.includes(name)) {
      problems.push(`unexpected candidate ${name}`);
    }
    // A candidate must never be written under a baseline name.
    if (/-chromium-(linux|darwin)\.png$/.test(name)) {
      problems.push(`candidate ${name} uses an accepted-baseline filename`);
    }
  }

  for (const candidate of manifest.candidates) {
    if (candidate.screenshotScale !== "css") {
      problems.push(
        `${candidate.filename} recorded scale "${candidate.screenshotScale}"`,
      );
    }
    if (candidate.dimensions !== candidate.expectedCssDimensions) {
      problems.push(
        `${candidate.filename} is ${candidate.dimensions} but expected CSS ` +
          `geometry is ${candidate.expectedCssDimensions}`,
      );
    }
    if (candidate.blockedRequests?.length) {
      problems.push(
        `${candidate.filename} recorded blocked requests: ` +
          candidate.blockedRequests.join(", "),
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Candidate contract violated:\n  - ${problems.join("\n  - ")}`);
  }
}
