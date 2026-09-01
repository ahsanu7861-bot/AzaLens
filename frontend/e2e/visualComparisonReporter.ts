import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

declare const process: { env: Record<string, string | undefined> };

export const VISUAL_COMPARISON_CONTRACT_ENV = "AZALENS_EXPECT_VISUAL_COMPARISONS";
export const VISUAL_COMPARISON_CONTRACT_VALUE = "1";

const projects = ["desktop-chromium", "mobile-chromium"] as const;
const themes = ["night", "day"] as const;

export const EXPECTED_VISUAL_COMPARISONS = new Set(
  projects.flatMap((project) => [
    ...themes.flatMap((theme) => [
      `${project}/landing-page-${theme}.png`,
      `${project}/methodology-page-${theme}.png`,
      `${project}/analysis-overview-${theme}.png`,
      `${project}/analysis-technical-${theme}.png`,
      `${project}/analysis-guidance-${theme}.png`,
    ]),
    `${project}/landing-verdict.png`,
    `${project}/analysis-purification.png`,
  ]),
);

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

export type ComparisonContractResult = {
  missing: string[];
  unexpected: string[];
};

export function evaluateVisualComparisonContract(
  observed: ReadonlySet<string>,
): ComparisonContractResult {
  return {
    missing: [...EXPECTED_VISUAL_COMPARISONS]
      .filter((comparison) => !observed.has(comparison))
      .sort(),
    unexpected: [...observed]
      .filter((comparison) => !EXPECTED_VISUAL_COMPARISONS.has(comparison))
      .sort(),
  };
}

export function formatVisualComparisonFailure({
  missing,
  unexpected,
}: ComparisonContractResult): string {
  const lines = [
    `Visual comparison contract failed: expected exactly ${EXPECTED_VISUAL_COMPARISONS.size} comparisons.`,
  ];
  if (missing.length) lines.push(`Missing (${missing.length}): ${missing.join(", ")}`);
  if (unexpected.length) {
    lines.push(`Unexpected (${unexpected.length}): ${unexpected.join(", ")}`);
  }
  return lines.join("\n");
}

export default class VisualComparisonReporter implements Reporter {
  private readonly enabled =
    process.env[VISUAL_COMPARISON_CONTRACT_ENV] === VISUAL_COMPARISON_CONTRACT_VALUE;
  private readonly observed = new Set<string>();

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep) {
    if (!this.enabled) return;
    this.observeStep(test.parent.project()?.name ?? "", step);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (!this.enabled) return;
    const projectName = test.parent.project()?.name ?? "";
    const visit = (steps: TestStep[]) => {
      for (const step of steps) {
        this.observeStep(projectName, step);
        visit(step.steps);
      }
    };
    visit(result.steps);
  }

  async onEnd(_result: FullResult) {
    if (!this.enabled) return;
    const contract = evaluateVisualComparisonContract(this.observed);
    if (contract.missing.length || contract.unexpected.length) {
      console.error(formatVisualComparisonFailure(contract));
      return { status: "failed" as const };
    }
    console.log(
      `VISUAL_COMPARISON_PROOF=exact-set:${this.observed.size}/${EXPECTED_VISUAL_COMPARISONS.size}`,
    );
  }

  private observeStep(projectName: string, step: TestStep) {
    const comparison = comparisonFromStep(projectName, step);
    if (comparison) {
      this.observed.add(comparison);
    } else if (step.category === "expect" && step.title.includes("Screenshot")) {
      this.observed.add(`${projectName}/<unparsed:${step.title}>`);
    }
  }
}
