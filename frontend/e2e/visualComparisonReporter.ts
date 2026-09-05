import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

declare const process: { env: Record<string, string | undefined> };

/*
 * ============================================================================
 * Visual comparison contract reporter.
 *
 * Two properties, both of which used to be missing:
 *
 * 1. OCCURRENCE COUNTING, NOT SET MEMBERSHIP. The observed comparisons were
 *    accumulated into a Set, so repeated identities collapsed. A run in which
 *    one expected identity was compared twice and another never compared at all
 *    still produced a plausible-looking set, and a duplicate with nothing
 *    missing was entirely invisible. Every occurrence is now counted, and the
 *    contract requires each expected identity exactly once.
 *
 * 2. FAIL-CLOSED DEFAULT. The proof used to be enabled only by
 *    AZALENS_EXPECT_VISUAL_COMPARISONS=1; every other state - absent, empty,
 *    misspelled - silently disabled it. A plain `npx playwright test`, which
 *    runs the @visual specs and performs all 24 real comparisons, therefore
 *    asserted nothing. Absence now REQUIRES the proof, and only the exact
 *    documented opt-out can disable it.
 * ============================================================================
 */

export const VISUAL_COMPARISON_CONTRACT_ENV = "AZALENS_EXPECT_VISUAL_COMPARISONS";

/** Exact value that explicitly REQUIRES the proof. Absence requires it too. */
export const VISUAL_COMPARISON_CONTRACT_VALUE = "1";

/** The one exact value that intentionally disables the proof. */
export const VISUAL_COMPARISON_OPT_OUT_VALUE = "0";

/** Machine-readable marker emitted when the full contract is satisfied. */
export const VISUAL_COMPARISON_PROOF_PREFIX = "VISUAL_COMPARISON_PROOF=exact-set:";

/** Machine-readable marker emitted when the proof was intentionally disabled. */
export const VISUAL_COMPARISON_DISABLED_MARKER =
  "VISUAL_COMPARISON_PROOF=intentionally-disabled";

const projects = ["desktop-chromium", "mobile-chromium"] as const;
const themes = ["night", "day"] as const;

/*
 * The comparison identity is `<project>/<snapshot name>`. Those are the two
 * authoritative dimensions: together they are exactly what Playwright uses to
 * resolve a baseline file (`<name>-<project>-<platform>.png`), so the 24
 * identities below are in one-to-one correspondence with the 24 committed Linux
 * baselines. Nothing else about a step contributes to identity, so a comparison
 * cannot change identity by moving between specs or files.
 */
export const EXPECTED_VISUAL_COMPARISONS: readonly string[] = projects.flatMap(
  (project) => [
    ...themes.flatMap((theme) => [
      `${project}/landing-page-${theme}.png`,
      `${project}/methodology-page-${theme}.png`,
      `${project}/analysis-overview-${theme}.png`,
      `${project}/analysis-technical-${theme}.png`,
      `${project}/analysis-guidance-${theme}.png`,
    ]),
    `${project}/landing-verdict.png`,
    `${project}/analysis-purification.png`,
  ],
);

/** Expected multiplicity: every identity exactly once. */
export const EXPECTED_VISUAL_COMPARISON_COUNT = EXPECTED_VISUAL_COMPARISONS.length;

const EXPECTED_SET: ReadonlySet<string> = new Set(EXPECTED_VISUAL_COMPARISONS);

const SCREENSHOT_STEPS = [
  /^Expect "(?:soft )?toHaveScreenshot\((.+)\)"$/,
  /^(?:expect(?:\.soft)?\.)?(?:soft )?toHaveScreenshot\((.+)\)$/,
];

export function comparisonFromStep(projectName: string, step: {
  category: string;
  title: string;
}): string | undefined {
  if (step.category !== "expect") return undefined;
  const match = SCREENSHOT_STEPS
    .map((pattern) => pattern.exec(step.title))
    .find((candidate) => candidate !== null);
  if (!match) return undefined;
  return `${projectName}/${match[1]}`;
}

/* -------------------------------------------------------------------------- */
/* Correction 2: strict environment normalisation, fail-closed by default.     */
/* -------------------------------------------------------------------------- */

/**
 * Accepted values, compared byte-exactly. No trimming, no case folding, no
 * truthiness coercion — a value is either one of these two strings, or absent,
 * or invalid. This is deliberately shell-independent: nothing here depends on
 * how a shell would interpret the value.
 *
 *   unset      -> REQUIRED (default). The fail-closed state.
 *   "1"        -> REQUIRED, stated explicitly.
 *   "0"        -> DISABLED, the one documented intentional opt-out.
 *   anything   -> INVALID. The run fails; it is never silently disabled.
 *   else       (this includes the empty string, " 1", "true", "yes", "on")
 */
export type VisualComparisonMode =
  | { readonly kind: "required"; readonly source: "default" | "explicit" }
  | { readonly kind: "disabled" }
  | { readonly kind: "invalid"; readonly error: string };

export function invalidContractValueError(raw: string): string {
  return (
    `Visual comparison contract: ${VISUAL_COMPARISON_CONTRACT_ENV} is set to ` +
    `${JSON.stringify(raw)}, which is neither ` +
    `"${VISUAL_COMPARISON_CONTRACT_VALUE}" (require the proof) nor ` +
    `"${VISUAL_COMPARISON_OPT_OUT_VALUE}" (intentionally disable it). Values are ` +
    `compared exactly: no trimming, case folding or truthiness. A malformed or ` +
    `ambiguous value must never disable the proof, so the run fails closed. ` +
    `Unset the variable to require the proof by default.`
  );
}

export function evaluateVisualComparisonMode(
  raw: string | undefined,
): VisualComparisonMode {
  if (raw === undefined) return { kind: "required", source: "default" };
  if (raw === VISUAL_COMPARISON_CONTRACT_VALUE) {
    return { kind: "required", source: "explicit" };
  }
  if (raw === VISUAL_COMPARISON_OPT_OUT_VALUE) return { kind: "disabled" };
  return { kind: "invalid", error: invalidContractValueError(raw) };
}

export function formatIntentionalDisable(): string {
  return (
    `${VISUAL_COMPARISON_DISABLED_MARKER}\n` +
    `Visual comparison proof is intentionally disabled for this run: ` +
    `${VISUAL_COMPARISON_CONTRACT_ENV}=${VISUAL_COMPARISON_OPT_OUT_VALUE} was set ` +
    `explicitly. This run is NOT authoritative for visual regression and must ` +
    `never be accepted in place of the visual phase.`
  );
}

export function formatDisabledButObservedFailure(count: number): string {
  return (
    `Visual comparison contract failed: ${VISUAL_COMPARISON_CONTRACT_ENV}=` +
    `${VISUAL_COMPARISON_OPT_OUT_VALUE} declared this run non-visual, but ` +
    `${count} screenshot comparison(s) were observed. A run that compares ` +
    `screenshots may not opt out of proving what it compared.`
  );
}

/* -------------------------------------------------------------------------- */
/* Correction 1: occurrence counting with explicit multiplicity.               */
/* -------------------------------------------------------------------------- */

export type DuplicateComparison = {
  readonly comparison: string;
  readonly count: number;
};

export type ComparisonContractResult = {
  readonly missing: string[];
  readonly unexpected: string[];
  readonly duplicated: DuplicateComparison[];
  readonly total: number;
  readonly satisfied: boolean;
};

/**
 * Evaluate observed OCCURRENCES (not a set) against the expected identities.
 *
 * The parameter is a `readonly string[]` and deliberately not an iterable: a
 * `Set` argument would reintroduce exactly the collapsing this replaces, and
 * making that a type error is the point.
 */
export function evaluateVisualComparisonContract(
  observed: readonly string[],
): ComparisonContractResult {
  const counts = new Map<string, number>();
  for (const comparison of observed) {
    counts.set(comparison, (counts.get(comparison) ?? 0) + 1);
  }

  const missing = EXPECTED_VISUAL_COMPARISONS
    .filter((comparison) => (counts.get(comparison) ?? 0) === 0)
    .slice()
    .sort();

  const unexpected = [...counts.keys()]
    .filter((comparison) => !EXPECTED_SET.has(comparison))
    .sort();

  const duplicated = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([comparison, count]) => ({ comparison, count }))
    .sort((a, b) => (a.comparison < b.comparison ? -1 : a.comparison > b.comparison ? 1 : 0));

  return {
    missing,
    unexpected,
    duplicated,
    total: observed.length,
    satisfied:
      missing.length === 0 && unexpected.length === 0 && duplicated.length === 0,
  };
}

export function formatVisualComparisonFailure(
  result: ComparisonContractResult,
): string {
  const lines = [
    `Visual comparison contract failed: expected exactly ` +
      `${EXPECTED_VISUAL_COMPARISON_COUNT} comparisons, each identity exactly once; ` +
      `observed ${result.total} occurrence(s).`,
  ];
  if (result.missing.length) {
    lines.push(`Missing (${result.missing.length}): ${result.missing.join(", ")}`);
  }
  if (result.unexpected.length) {
    lines.push(
      `Unexpected (${result.unexpected.length}): ${result.unexpected.join(", ")}`,
    );
  }
  if (result.duplicated.length) {
    lines.push(
      `Duplicated (${result.duplicated.length}): ` +
        result.duplicated
          .map(({ comparison, count }) => `${comparison} x${count}`)
          .join(", "),
    );
  }
  return lines.join("\n");
}

export function formatVisualComparisonProof(total: number): string {
  return `${VISUAL_COMPARISON_PROOF_PREFIX}${total}/${EXPECTED_VISUAL_COMPARISON_COUNT}`;
}

/* -------------------------------------------------------------------------- */

export default class VisualComparisonReporter implements Reporter {
  private readonly mode: VisualComparisonMode;

  /*
   * Every physical step this reporter has already accounted for. onStepEnd and
   * the onTestEnd walk of result.steps deliver the SAME TestStep object
   * (playwright 1.62 lib/runner/index.js: _onStepEnd reads result._stepMap,
   * which holds the object _onStepBegin pushed into result.steps), so
   * de-duplicating by object identity removes the double observation while
   * still counting two genuinely distinct steps that share a comparison
   * identity as two occurrences. That distinction is the whole of correction 1.
   */
  private readonly countedSteps = new Set<TestStep>();

  /** Occurrences of the attempt currently being observed, keyed by test id. */
  private readonly pending = new Map<string, string[]>();

  /**
   * Committed occurrences per test. onTestEnd fires once per attempt and
   * replaces the entry, so a retried test contributes only its final attempt
   * and an ordinary flake cannot masquerade as a duplicate comparison.
   */
  private readonly committed = new Map<string, string[]>();

  constructor(
    _options?: unknown,
    env: Record<string, string | undefined> = process.env,
  ) {
    this.mode = evaluateVisualComparisonMode(env[VISUAL_COMPARISON_CONTRACT_ENV]);
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    if (this.mode.kind === "invalid") return;
    this.record(test, result, test.parent.project()?.name ?? "", step);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (this.mode.kind === "invalid") return;
    const projectName = test.parent.project()?.name ?? "";
    const visit = (steps: TestStep[]) => {
      for (const step of steps) {
        this.record(test, result, projectName, step);
        visit(step.steps);
      }
    };
    visit(result.steps);
    this.committed.set(test.id, this.pending.get(test.id) ?? []);
    this.pending.delete(test.id);
  }

  async onEnd(_result: FullResult) {
    if (this.mode.kind === "invalid") {
      console.error(this.mode.error);
      return { status: "failed" as const };
    }

    const observed = this.observedOccurrences();

    if (this.mode.kind === "disabled") {
      if (observed.length > 0) {
        console.error(formatDisabledButObservedFailure(observed.length));
        return { status: "failed" as const };
      }
      console.log(formatIntentionalDisable());
      return;
    }

    const contract = evaluateVisualComparisonContract(observed);
    if (!contract.satisfied) {
      console.error(formatVisualComparisonFailure(contract));
      return { status: "failed" as const };
    }
    console.log(formatVisualComparisonProof(contract.total));
  }

  /** Flattened occurrences across every test, order-independent by construction. */
  private observedOccurrences(): string[] {
    const all: string[] = [];
    for (const occurrences of this.committed.values()) all.push(...occurrences);
    // A test whose onTestEnd never fired still contributes what was observed.
    for (const occurrences of this.pending.values()) all.push(...occurrences);
    return all;
  }

  private record(
    test: TestCase,
    _result: TestResult,
    projectName: string,
    step: TestStep,
  ) {
    if (this.countedSteps.has(step)) return;
    const comparison = comparisonFromStep(projectName, step);
    let identity: string | undefined;
    if (comparison) {
      identity = comparison;
    } else if (step.category === "expect" && step.title.includes("Screenshot")) {
      // Unparsed screenshot matcher: recorded as an unexpected identity rather
      // than dropped, so a title format change fails closed instead of silently
      // shrinking the observed set.
      identity = `${projectName}/<unparsed:${step.title}>`;
    }
    if (!identity) return;
    this.countedSteps.add(step);
    const occurrences = this.pending.get(test.id) ?? [];
    occurrences.push(identity);
    this.pending.set(test.id, occurrences);
  }
}
