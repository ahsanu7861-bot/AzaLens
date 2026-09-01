import { describe, expect, it } from "vitest";

import {
  EXPECTED_VISUAL_COMPARISONS,
  comparisonFromStep,
  evaluateVisualComparisonContract,
  formatVisualComparisonFailure,
} from "../../e2e/visualComparisonReporter";

describe("visual comparison expected-set reporter", () => {
  it("owns the exact 24-comparison contract", () => {
    expect(EXPECTED_VISUAL_COMPARISONS.size).toBe(24);
    expect([...EXPECTED_VISUAL_COMPARISONS].filter((name) => name.includes("/analysis-"))).toHaveLength(14);
    expect([...EXPECTED_VISUAL_COMPARISONS].filter((name) => name.includes("/landing-"))).toHaveLength(6);
    expect([...EXPECTED_VISUAL_COMPARISONS].filter((name) => name.includes("/methodology-"))).toHaveLength(4);
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

  it("accepts the exact set and is retry-idempotent", () => {
    const observed = new Set(EXPECTED_VISUAL_COMPARISONS);
    observed.add("desktop-chromium/landing-page-day.png");
    expect(evaluateVisualComparisonContract(observed)).toEqual({ missing: [], unexpected: [] });
  });

  it("fails closed on a missing comparison", () => {
    const observed = new Set(EXPECTED_VISUAL_COMPARISONS);
    observed.delete("mobile-chromium/analysis-purification.png");
    const result = evaluateVisualComparisonContract(observed);
    expect(result.missing).toEqual(["mobile-chromium/analysis-purification.png"]);
    expect(formatVisualComparisonFailure(result)).toContain("Missing (1)");
  });

  it("fails closed on an unexpected name or project", () => {
    const observed = new Set(EXPECTED_VISUAL_COMPARISONS);
    observed.add("tablet-chromium/landing-page-day.png");
    const result = evaluateVisualComparisonContract(observed);
    expect(result.unexpected).toEqual(["tablet-chromium/landing-page-day.png"]);
    expect(formatVisualComparisonFailure(result)).toContain("Unexpected (1)");
  });
});
