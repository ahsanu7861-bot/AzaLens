import { expect, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = join(process.cwd(), "methodology-candidate-artifacts");
const expectedNames = [
  "candidate--analysis-purification-desktop.png",
  "candidate--analysis-purification-mobile.png",
  "candidate--methodology-page-day-desktop.png",
  "candidate--methodology-page-day-mobile.png",
  "candidate--methodology-page-night-desktop.png",
  "candidate--methodology-page-night-mobile.png",
];

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function pngSize(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function finishManifest() {
  const sidecars = readdirSync(outputDir)
    .filter((name) => /^candidate--.*\.json$/.test(name))
    .sort();
  if (sidecars.length !== expectedNames.length) return;

  const candidates = sidecars.map((name) =>
    JSON.parse(readFileSync(join(outputDir, name), "utf8")),
  );
  expect(candidates.map((candidate) => candidate.filename).sort()).toEqual(expectedNames);
  const source = candidates[0].source;
  for (const candidate of candidates) {
    expect(candidate.source).toEqual(source);
    expect(candidate.screenshotScale).toBe("css");
  }

  writeFileSync(
    join(outputDir, "candidate-manifest.json"),
    `${JSON.stringify({
      kind: "methodology-and-purification-visual-candidates",
      note: "Review evidence only. These are not accepted baselines.",
      generatedAt: new Date().toISOString(),
      source,
      expectedCandidateCount: expectedNames.length,
      candidateCount: candidates.length,
      candidates,
    }, null, 2)}\n`,
  );
}

export async function captureMethodologyCandidate({
  page,
  target,
  name,
  baseline,
  projectName,
  fullPage = false,
}: {
  page: Page;
  target: Page | Locator;
  name: string;
  baseline: string;
  projectName: string;
  fullPage?: boolean;
}) {
  const project = projectName.startsWith("mobile") ? "mobile" : "desktop";
  const filename = `candidate--${name}-${project}.png`;
  const expected = fullPage
    ? await page.evaluate(() => ({
        width: Math.round(document.documentElement.clientWidth),
        height: Math.round(document.documentElement.scrollHeight),
      }))
    : await (target as Locator).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });
  const bytes = await target.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
    ...(fullPage ? { fullPage: true } : {}),
  });
  const dimensions = pngSize(bytes);
  expect(Math.abs(dimensions.width - expected.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(dimensions.height - expected.height)).toBeLessThanOrEqual(1);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, filename), bytes);
  writeFileSync(
    join(outputDir, filename.replace(/\.png$/, ".json")),
    `${JSON.stringify({
      filename,
      candidateFor: `${baseline}-${projectName}-linux.png`,
      project,
      dimensions,
      expectedCssDimensions: expected,
      screenshotScale: "css",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source: {
        reviewHead: process.env.REVIEW_HEAD_SHA || null,
        checkoutCommit: git("rev-parse", "HEAD"),
        checkoutTree: git("rev-parse", "HEAD^{tree}"),
      },
    }, null, 2)}\n`,
  );
  finishManifest();
}
