import { describe, expect, it } from "vitest";

import VisualComparisonReporter, {
  EXPECTED_VISUAL_COMPARISONS,
  EXPECTED_VISUAL_COMPARISON_COUNT,
  VISUAL_COMPARISON_CONTRACT_ENV,
  VISUAL_COMPARISON_DISABLED_MARKER,
  comparisonFromStep,
  evaluateVisualComparisonContract,
  evaluateVisualComparisonMode,
  formatDisabledButObservedFailure,
  formatIntentionalDisable,
  formatVisualComparisonFailure,
  formatVisualComparisonProof,
} from "../../e2e/visualComparisonReporter";

/** The 24 expected identities, each exactly once — a satisfying run. */
const exactOccurrences = (): string[] => [...EXPECTED_VISUAL_COMPARISONS];

describe("visual comparison expected-set contract", () => {
  it("owns the exact 24-comparison contract", () => {
    expect(EXPECTED_VISUAL_COMPARISON_COUNT).toBe(24);
    expect(EXPECTED_VISUAL_COMPARISONS).toHaveLength(24);
    expect(new Set(EXPECTED_VISUAL_COMPARISONS).size).toBe(24);
    expect(EXPECTED_VISUAL_COMPARISONS.filter((n) => n.includes("/analysis-"))).toHaveLength(14);
    expect(EXPECTED_VISUAL_COMPARISONS.filter((n) => n.includes("/landing-"))).toHaveLength(6);
    expect(EXPECTED_VISUAL_COMPARISONS.filter((n) => n.includes("/methodology-"))).toHaveLength(4);
  });

  it.each([
    ["Expect \"toHaveScreenshot(methodology-page-night.png)\"", "desktop-chromium/methodology-page-night.png"],
    ["expect.toHaveScreenshot(landing-page-day.png)", "desktop-chromium/landing-page-day.png"],
    ["expect.soft.toHaveScreenshot(analysis-guidance-night.png)", "desktop-chromium/analysis-guidance-night.png"],
  ])("extracts a completed screenshot matcher from %s", (title, expected) => {
    expect(comparisonFromStep("desktop-chromium", { category: "expect", title })).toBe(expected);
  });

  it("ignores non-screenshot and non-expect steps", () => {
    expect(comparisonFromStep("desktop-chromium", { category: "expect", title: "toBeVisible" })).toBeUndefined();
    expect(comparisonFromStep("desktop-chromium", { category: "pw:api", title: "toHaveScreenshot(fake.png)" })).toBeUndefined();
  });
});

/* ========================================================================== */
/* Correction 1 — duplicate detection                                         */
/* ========================================================================== */

describe("visual comparison occurrence multiplicity", () => {
  it("passes on exactly 24 unique expected observations", () => {
    const result = evaluateVisualComparisonContract(exactOccurrences());
    expect(result).toMatchObject({
      missing: [],
      unexpected: [],
      duplicated: [],
      total: 24,
      satisfied: true,
    });
    expect(formatVisualComparisonProof(result.total)).toBe(
      "VISUAL_COMPARISON_PROOF=exact-set:24/24",
    );
  });

  /*
   * The defect this correction exists for. The total is still 24, and a Set
   * would still contain 23 distinct names with exactly one missing — the shape
   * that used to be reported as a single benign "missing". Both faults must be
   * reported, separately.
   */
  it("fails when one identity is duplicated and another missing while the total stays 24", () => {
    const occurrences = exactOccurrences().filter(
      (name) => name !== "mobile-chromium/analysis-purification.png",
    );
    occurrences.push("desktop-chromium/landing-page-day.png");
    expect(occurrences).toHaveLength(24);

    const result = evaluateVisualComparisonContract(occurrences);
    expect(result.total).toBe(24);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(["mobile-chromium/analysis-purification.png"]);
    expect(result.duplicated).toEqual([
      { comparison: "desktop-chromium/landing-page-day.png", count: 2 },
    ]);
    expect(result.unexpected).toEqual([]);

    const message = formatVisualComparisonFailure(result);
    expect(message).toContain("Missing (1)");
    expect(message).toContain("Duplicated (1)");
    expect(message).toContain("desktop-chromium/landing-page-day.png x2");
  });

  it("fails on a duplicate even when nothing is missing", () => {
    const occurrences = [...exactOccurrences(), "desktop-chromium/landing-verdict.png"];
    const result = evaluateVisualComparisonContract(occurrences);
    expect(result.total).toBe(25);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
    expect(result.duplicated).toEqual([
      { comparison: "desktop-chromium/landing-verdict.png", count: 2 },
    ]);
    expect(formatVisualComparisonFailure(result)).toContain("Duplicated (1)");
  });

  it("fails on an unexpected identity", () => {
    const result = evaluateVisualComparisonContract([
      ...exactOccurrences(),
      "tablet-chromium/landing-page-day.png",
    ]);
    expect(result.satisfied).toBe(false);
    expect(result.unexpected).toEqual(["tablet-chromium/landing-page-day.png"]);
    expect(formatVisualComparisonFailure(result)).toContain("Unexpected (1)");
  });

  it("fails on a missing identity", () => {
    const result = evaluateVisualComparisonContract(
      exactOccurrences().filter((n) => n !== "mobile-chromium/analysis-purification.png"),
    );
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(["mobile-chromium/analysis-purification.png"]);
    expect(formatVisualComparisonFailure(result)).toContain("Missing (1)");
  });

  it("orders every diagnostic list deterministically regardless of arrival order", () => {
    const occurrences = exactOccurrences().filter(
      (n) =>
        n !== "desktop-chromium/analysis-guidance-day.png" &&
        n !== "mobile-chromium/landing-verdict.png",
    );
    // Duplicates and unexpected names pushed in deliberately reversed order.
    occurrences.push(
      "zz-project/zz-last.png",
      "aa-project/aa-first.png",
      "mobile-chromium/methodology-page-night.png",
      "desktop-chromium/analysis-overview-day.png",
    );

    const first = evaluateVisualComparisonContract(occurrences);
    const second = evaluateVisualComparisonContract([...occurrences].reverse());

    expect(first.missing).toEqual([
      "desktop-chromium/analysis-guidance-day.png",
      "mobile-chromium/landing-verdict.png",
    ]);
    expect(first.unexpected).toEqual([
      "aa-project/aa-first.png",
      "zz-project/zz-last.png",
    ]);
    expect(first.duplicated.map((d) => d.comparison)).toEqual([
      "desktop-chromium/analysis-overview-day.png",
      "mobile-chromium/methodology-page-night.png",
    ]);
    expect(second.missing).toEqual(first.missing);
    expect(second.unexpected).toEqual(first.unexpected);
    expect(second.duplicated).toEqual(first.duplicated);
    expect(formatVisualComparisonFailure(second)).toBe(
      formatVisualComparisonFailure(first),
    );
  });

  it("counts three occurrences of one identity as a single triple-duplicate", () => {
    const occurrences = [
      ...exactOccurrences(),
      "desktop-chromium/landing-verdict.png",
      "desktop-chromium/landing-verdict.png",
    ];
    const result = evaluateVisualComparisonContract(occurrences);
    expect(result.duplicated).toEqual([
      { comparison: "desktop-chromium/landing-verdict.png", count: 3 },
    ]);
    expect(formatVisualComparisonFailure(result)).toContain("x3");
  });
});

/* ========================================================================== */
/* Correction 2 — fail-closed default                                          */
/* ========================================================================== */

describe("visual comparison environment contract", () => {
  it("requires proof by default when the variable is absent (full/default execution)", () => {
    expect(evaluateVisualComparisonMode(undefined)).toEqual({
      kind: "required",
      source: "default",
    });
  });

  it("requires proof when explicitly set to 1", () => {
    expect(evaluateVisualComparisonMode("1")).toEqual({
      kind: "required",
      source: "explicit",
    });
  });

  it("allows the explicit documented non-visual opt-out and names its marker", () => {
    expect(evaluateVisualComparisonMode("0")).toEqual({ kind: "disabled" });
    const marker = formatIntentionalDisable();
    expect(marker.split("\n")[0]).toBe(VISUAL_COMPARISON_DISABLED_MARKER);
    expect(marker).toContain(`${VISUAL_COMPARISON_CONTRACT_ENV}=0`);
    expect(marker).toContain("NOT authoritative");
  });

  it.each([
    ["", "empty string"],
    [" ", "whitespace"],
    [" 1", "leading space"],
    ["1 ", "trailing space"],
    ["01", "numeric lookalike"],
    ["true", "boolean word"],
    ["false", "boolean word"],
    ["yes", "affirmative word"],
    ["no", "negative word"],
    ["on", "shell-style word"],
    ["off", "shell-style word"],
    ["2", "out-of-range number"],
    ["-1", "negative number"],
    ["TRUE", "upper case"],
  ])("fails closed on the malformed value %j (%s)", (raw) => {
    const mode = evaluateVisualComparisonMode(raw);
    expect(mode.kind).toBe("invalid");
    if (mode.kind !== "invalid") throw new Error("unreachable");
    expect(mode.error).toContain(VISUAL_COMPARISON_CONTRACT_ENV);
    expect(mode.error).toContain(JSON.stringify(raw));
    expect(mode.error).toContain("fails closed");
  });

  it("never treats a malformed value as a silent disable", () => {
    for (const raw of ["", "true", "0 ", "no"]) {
      expect(evaluateVisualComparisonMode(raw).kind).not.toBe("disabled");
    }
  });

  it("explains that a run which compared screenshots may not opt out", () => {
    expect(formatDisabledButObservedFailure(3)).toContain("3 screenshot comparison(s)");
    expect(formatDisabledButObservedFailure(3)).toContain("may not opt out");
  });
});

/* ========================================================================== */
/* Reporter behaviour end-to-end (no browser, no Playwright worker)            */
/* ========================================================================== */

type FakeStep = {
  category: string;
  title: string;
  steps: FakeStep[];
};

const screenshotStep = (name: string): FakeStep => ({
  category: "expect",
  title: `Expect "toHaveScreenshot(${name})"`,
  steps: [],
});

/** Minimal stand-ins for the Playwright reporter types this class actually reads. */
function fakeTest(id: string, projectName: string) {
  return { id, parent: { project: () => ({ name: projectName }) } };
}

function runReporter(
  env: Record<string, string | undefined>,
  tests: { id: string; project: string; snapshots: string[] }[],
  options: { alsoEmitStepEnd?: boolean } = { alsoEmitStepEnd: true },
) {
  const logged: string[] = [];
  const errored: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reporter = new (VisualComparisonReporter as any)(undefined, env);
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (m: string) => logged.push(String(m));
  console.error = (m: string) => errored.push(String(m));
  let status: unknown;
  try {
    for (const spec of tests) {
      const test = fakeTest(spec.id, spec.project);
      const steps = spec.snapshots.map(screenshotStep);
      const result = { retry: 0, steps };
      if (options.alsoEmitStepEnd) {
        // Playwright delivers the SAME step object through both callbacks.
        for (const step of steps) reporter.onStepEnd(test, result, step);
      }
      reporter.onTestEnd(test, result);
    }
    status = reporter.onEnd({ status: "passed" });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { logged, errored, status };
}

const fullRun = () =>
  EXPECTED_VISUAL_COMPARISONS.map((identity, index) => {
    const [project, snapshot] = identity.split("/");
    return { id: `t${index}`, project, snapshots: [snapshot] };
  });

describe("VisualComparisonReporter", () => {
  it("does not double-count a step delivered through both onStepEnd and onTestEnd", async () => {
    const { logged, errored, status } = runReporter({}, fullRun());
    expect(await status).toBeUndefined();
    expect(errored).toEqual([]);
    expect(logged).toContain("VISUAL_COMPARISON_PROOF=exact-set:24/24");
  });

  it("requires proof with the variable absent, and fails a run that compared nothing", async () => {
    const { errored, status } = runReporter({}, []);
    expect(await status).toEqual({ status: "failed" });
    expect(errored.join("\n")).toContain("Missing (24)");
  });

  it("detects a genuine duplicate produced by two distinct steps in one test", async () => {
    const run = fullRun();
    run[0].snapshots = [run[0].snapshots[0], run[0].snapshots[0]];
    const { errored, status } = runReporter({}, run);
    expect(await status).toEqual({ status: "failed" });
    expect(errored.join("\n")).toContain("Duplicated (1)");
  });

  it("emits the intentional-disable marker for an explicit non-visual run", async () => {
    const { logged, errored, status } = runReporter(
      { [VISUAL_COMPARISON_CONTRACT_ENV]: "0" },
      [],
    );
    expect(await status).toBeUndefined();
    expect(errored).toEqual([]);
    expect(logged.join("\n")).toContain(VISUAL_COMPARISON_DISABLED_MARKER);
    expect(logged.join("\n")).not.toContain("exact-set:");
  });

  it("fails when a comparison is observed while the proof is disabled", async () => {
    const { errored, status } = runReporter(
      { [VISUAL_COMPARISON_CONTRACT_ENV]: "0" },
      [{ id: "t0", project: "desktop-chromium", snapshots: ["landing-verdict.png"] }],
    );
    expect(await status).toEqual({ status: "failed" });
    expect(errored.join("\n")).toContain("may not opt out");
  });

  it("fails on a malformed value without observing anything", async () => {
    const { errored, status } = runReporter(
      { [VISUAL_COMPARISON_CONTRACT_ENV]: "true" },
      fullRun(),
    );
    expect(await status).toEqual({ status: "failed" });
    expect(errored.join("\n")).toContain("fails closed");
  });

  it("counts only the final attempt of a retried test", async () => {
    const logged: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reporter = new (VisualComparisonReporter as any)(undefined, {});
    const originalLog = console.log;
    console.log = (m: string) => logged.push(String(m));
    try {
      for (const [index, identity] of EXPECTED_VISUAL_COMPARISONS.entries()) {
        const [project, snapshot] = identity.split("/");
        const test = fakeTest(`t${index}`, project);
        if (index === 0) {
          // First attempt fails; a fresh attempt re-runs the same comparison.
          const firstAttempt = { retry: 0, steps: [screenshotStep(snapshot)] };
          reporter.onTestEnd(test, firstAttempt);
        }
        const finalAttempt = {
          retry: index === 0 ? 1 : 0,
          steps: [screenshotStep(snapshot)],
        };
        reporter.onTestEnd(test, finalAttempt);
      }
      await reporter.onEnd({ status: "passed" });
    } finally {
      console.log = originalLog;
    }
    expect(logged).toContain("VISUAL_COMPARISON_PROOF=exact-set:24/24");
  });
});

/* ========================================================================== */
/* Snapshot-write and Darwin-baseline rejection remain intact                  */
/* ========================================================================== */

describe("visual proof does not weaken the snapshot guard", () => {
  it("rejects every snapshot-update mode without the acceptance opt-in", async () => {
    const { evaluateSnapshotPolicy } = await import("../../e2e/snapshotPolicy");
    for (const mode of ["all", "changed", "missing"]) {
      const decision = evaluateSnapshotPolicy({
        updateSnapshots: mode,
        acceptBaselines: undefined,
        platform: "linux",
      });
      expect(decision.allowed).toBe(false);
    }
  });

  it("rejects Darwin baseline creation even with the acceptance opt-in", async () => {
    const { evaluateSnapshotPolicy } = await import("../../e2e/snapshotPolicy");
    const decision = evaluateSnapshotPolicy({
      updateSnapshots: "changed",
      acceptBaselines: "1",
      platform: "darwin",
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("unreachable");
    expect(decision.error).toContain("linux");
  });

  it("allows ordinary non-writing verification on Darwin", async () => {
    const { evaluateSnapshotPolicy } = await import("../../e2e/snapshotPolicy");
    const decision = evaluateSnapshotPolicy({
      updateSnapshots: "none",
      acceptBaselines: undefined,
      platform: "darwin",
    });
    expect(decision.allowed).toBe(true);
  });
});
