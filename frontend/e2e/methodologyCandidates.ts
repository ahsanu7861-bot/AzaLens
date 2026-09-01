import { expect, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  CANDIDATE_RUN_ID_ENV,
  CANDIDATE_RUN_ID_PATTERN,
} from "./globalSetup";

const methodologyRoot = join(process.cwd(), "methodology-candidate-artifacts");
const expectedNames = [
  "candidate--analysis-purification-desktop.png",
  "candidate--analysis-purification-mobile.png",
  "candidate--methodology-page-day-desktop.png",
  "candidate--methodology-page-day-mobile.png",
  "candidate--methodology-page-night-desktop.png",
  "candidate--methodology-page-night-mobile.png",
];

/*
 * Candidate roots persist between runs and are gitignored, so a run that wrote
 * into the shared root left records behind that a *later* run's finisher would
 * then read as its own. Once a scan could see a full expected count made of
 * mixed commits, the cross-provenance assertion below failed on evidence that
 * did not belong to the current run. The fix is to give each Playwright
 * invocation its own child directory and to scan only that — the provenance
 * assertion itself is untouched and still load-bearing inside the run.
 *
 * The run ID is created once by the parent process (see ./globalSetup.ts) and
 * inherited by every worker and retry. It is re-validated here, at the reader,
 * because writer-side validation alone would leave any other caller of this
 * helper unguarded. An unsafe value is rejected outright, never sanitised into
 * a safe-looking one, and there is deliberately no fallback to the shared root:
 * falling back is exactly the contamination this function exists to prevent.
 */
export function resolveCandidateRunDir(root: string): string {
  const raw = process.env[CANDIDATE_RUN_ID_ENV];

  if (raw === undefined) {
    throw new Error(
      `${CANDIDATE_RUN_ID_ENV} is not set. Candidate capture requires the run ` +
        `ID created by Playwright global setup; without it a run would write ` +
        `into the shared persistent root and could read another run's ` +
        `candidates as its own. Refusing to write.`,
    );
  }

  if (raw === "") {
    throw new Error(
      `${CANDIDATE_RUN_ID_ENV} is set but empty. An empty run ID would resolve ` +
        `to the shared persistent root ${root}. Refusing to write.`,
    );
  }

  if (raw === "." || raw === "..") {
    throw new Error(
      `${CANDIDATE_RUN_ID_ENV}=${JSON.stringify(raw)} is a relative directory ` +
        `reference, not a run directory. Refusing to write.`,
    );
  }

  if (!CANDIDATE_RUN_ID_PATTERN.test(raw)) {
    throw new Error(
      `${CANDIDATE_RUN_ID_ENV}=${JSON.stringify(raw)} is not a single safe path ` +
        `component. Allowed characters are [A-Za-z0-9._-]; separators, ` +
        `whitespace, drive letters, UNC prefixes and shell metacharacters are ` +
        `rejected rather than sanitised. Refusing to write.`,
    );
  }

  /*
   * Lexical validation already excludes every separator, so this is a second,
   * independent containment check rather than the only one: resolve the path
   * and require that it is exactly one child of the intended root.
   */
  const runDir = resolve(root, raw);
  if (dirname(runDir) !== resolve(root) || basename(runDir) !== raw) {
    throw new Error(
      `${CANDIDATE_RUN_ID_ENV}=${JSON.stringify(raw)} does not resolve to a ` +
        `single directory directly beneath ${root} (resolved to ${runDir}). ` +
        `Refusing to write.`,
    );
  }

  return runDir;
}

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function pngSize(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function finishManifest(runDir: string) {
  /*
   * Scans the current run directory only. A sibling run directory is never
   * read, so stale evidence cannot contribute to the count or to provenance.
   */
  const sidecars = readdirSync(runDir)
    .filter((name) => /^candidate--.*\.json$/.test(name))
    .sort();

  /*
   * Too few is the ordinary mid-run state and must not finalise. Too many can
   * only mean the run directory holds records it did not write, which is the
   * failure this isolation exists to surface — so it is loud, not a silent
   * return as an equality check would have made it.
   */
  if (sidecars.length > expectedNames.length) {
    throw new Error(
      `Methodology run directory ${runDir} holds ${sidecars.length} candidate ` +
        `sidecars but exactly ${expectedNames.length} are expected: ` +
        `${sidecars.join(", ")}.`,
    );
  }
  if (sidecars.length < expectedNames.length) return;

  const candidates = sidecars.map((name) =>
    JSON.parse(readFileSync(join(runDir, name), "utf8")),
  );
  expect(candidates.map((candidate) => candidate.filename).sort()).toEqual(expectedNames);
  const source = candidates[0].source;
  for (const candidate of candidates) {
    expect(candidate.source).toEqual(source);
    expect(candidate.screenshotScale).toBe("css");
  }

  writeFileSync(
    join(runDir, "candidate-manifest.json"),
    `${JSON.stringify({
      kind: "methodology-and-purification-visual-candidates",
      note: "Review evidence only. These are not accepted baselines.",
      generatedAt: new Date().toISOString(),
      runId: basename(runDir),
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

  const runDir = resolveCandidateRunDir(methodologyRoot);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, filename), bytes);
  writeFileSync(
    join(runDir, filename.replace(/\.png$/, ".json")),
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
  finishManifest(runDir);
}
