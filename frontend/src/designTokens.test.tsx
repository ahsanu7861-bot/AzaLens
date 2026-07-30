import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AIVerdictCard from "./components/analysis/AIVerdictCard";
import IslamicCompliance from "./components/analysis/IslamicCompliance";

/*
  Regression coverage for Phase 0 item 1.10: --az-shariah existed in both
  themes but was never registered as --color-shariah in the @theme inline
  block, so text-shariah/bg-shariah/border-shariah generated no Tailwind
  utility. That token-registration + exact night/day hex value regression
  lives in scripts/checkDesignTokens.mjs (run via `npm run test:design-tokens`)
  since jsdom does not apply the built stylesheet, so a component test here
  cannot observe real generated CSS — only the markup this component emits.
*/

describe("Islamic Compliance eyebrow color (Phase 0 item 1.10)", () => {
  it("overrides the generic brand color with an explicit Shariah color", () => {
    render(<IslamicCompliance data={{ summary: { status: "COMPLIANT" } }} />);

    const eyebrow = screen.getByText("Islamic Compliance");

    // .az-eyebrow forces color: var(--az-brand) and — being declared after
    // Tailwind's generated utilities in index.css — wins the cascade over
    // any same-specificity utility class like text-shariah. An inline
    // style wins over any author stylesheet rule without needing
    // !important, so this is the deterministic, local fix.
    expect(eyebrow.style.color).toBe("var(--az-shariah)");
    expect(eyebrow.className).toContain("az-eyebrow");
    expect(eyebrow.className).not.toContain("text-shariah");
  });

  it("keeps the Shariah background and border utility classes on the AAOIFI badge and status panel", () => {
    render(<IslamicCompliance data={{ summary: { status: "COMPLIANT" } }} />);

    const badge = screen.getByText("AAOIFI");
    expect(badge.className).toContain("border-shariah/20");
    expect(badge.className).toContain("bg-shariah/15");

    const statusEyebrow = screen.getByText("AAOIFI Status");
    const statusPanel = statusEyebrow.closest("div");
    expect(statusPanel?.className).toContain("border-shariah/20");
    expect(statusPanel?.className).toContain("bg-shariah/10");
  });

  it("leaves the AAOIFI Status eyebrow (not a Shariah-color instance) unchanged", () => {
    render(<IslamicCompliance data={{ summary: { status: "COMPLIANT" } }} />);

    const statusEyebrow = screen.getByText("AAOIFI Status");
    expect(statusEyebrow.className).toBe("az-eyebrow");
    expect(statusEyebrow.style.color).toBe("");
  });
});

describe("Other eyebrows remain on the generic brand/intelligence color", () => {
  it("does not recolor AIVerdictCard's 'AI Verdict' eyebrow", () => {
    render(
      <AIVerdictCard direction="Bullish" trend="Bullish" confidence={50} />,
    );

    const eyebrow = screen.getByText("AI Verdict");
    expect(eyebrow.className).toBe("az-eyebrow text-intelligence");
    expect(eyebrow.style.color).toBe("");
  });
});
