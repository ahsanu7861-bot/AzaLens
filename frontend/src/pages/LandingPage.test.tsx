import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import LandingPage from "./LandingPage";
import { MODEL_DRIVEN_CLAIM_PATTERNS } from "../../scripts/modelClaimPatterns.mjs";

// A "standalone" verdict command is an element whose entire text is just
// the word BUY, SELL or HOLD — the shape of the old mockup's `<p>BUY</p>`.
// This intentionally does not flag prose such as the footer's
// "solicitation to buy or sell any security" disclaimer, since that
// sentence is not the full text of any single element.
const STANDALONE_VERDICT_COMMAND = /^(buy|sell|hold)$/i;

// The product publishes no confidence percentage. What must never appear is an
// unsupported claim that it predicts outcomes (accuracy / win rate / success
// rate / probability of profit).
const UNSUPPORTED_PERFORMANCE_CLAIMS = [
  /%\s*accurate/i,
  /accura(te|cy)/i,
  /win[\s-]?rate/i,
  /%\s*success/i,
  /success[\s-]?rate/i,
  /probability of profit/i,
];

/*
 * Roadmap item 2.17. AzaLens v1 contains no model, no SDK and no model key: the
 * analysis is deterministic arithmetic and string templates
 * (docs/LLM_DECISION_V1.md §8 item 4). Claiming otherwise in public copy is a
 * truthfulness defect, not a style preference.
 *
 * The patterns are owned by scripts/modelClaimPatterns.mjs, shared with the
 * published-metadata check and the visual spec. They are case-insensitive:
 * `\b` word boundaries, not letter case, are what keep them out of ordinary
 * words such as "Explained" and "Explainable".
 */
const MODEL_DRIVEN_CLAIMS = MODEL_DRIVEN_CLAIM_PATTERNS;

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage honesty regression (audit V8 / Phase 0 item 1.1)", () => {
  it("never renders a standalone BUY, SELL or HOLD verdict command", () => {
    renderLanding();

    expect(
      screen.queryByText(STANDALONE_VERDICT_COMMAND),
    ).not.toBeInTheDocument();
  });

  it("never renders an accuracy, win-rate, success-rate or profit-probability claim", () => {
    const { container } = renderLanding();

    for (const pattern of UNSUPPORTED_PERFORMANCE_CLAIMS) {
      expect(container.textContent).not.toMatch(pattern);
    }
  });

  it("never renders the fabricated confidence figure from the old mockup", () => {
    renderLanding();

    expect(screen.queryByText("92%")).not.toBeInTheDocument();
  });

  it("shows the real withheld-verdict copy instead of a trade-plan mockup, with no verdict alongside it", () => {
    renderLanding();

    const withheldCopy = screen.getByText(
      "Compliance comes before the verdict",
    );

    expect(withheldCopy).toBeInTheDocument();
    expect(screen.getByTestId("landing-demo-withheld")).toContainElement(
      withheldCopy,
    );
    expect(
      within(screen.getByTestId("landing-demo-withheld")).queryByText(
        "AzaLens Verdict",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the family-count Evidence Agreement with clear representative labelling", () => {
    renderLanding();

    const confirmedCard = screen.getByTestId("landing-demo-confirmed");

    expect(
      within(confirmedCard).getByText("3 of 4 evidence families support a bullish lean."),
    ).toBeInTheDocument();
    expect(
      within(confirmedCard).getByText("4 of 4 evidence families usable."),
    ).toBeInTheDocument();

    // The retired percentage and 9-of-9 indicator claim must not return.
    // Scoped to the Evidence Agreement region: the Shariah screening panel in the
    // same card legitimately reports ratios as percentages.
    const agreementRegion = within(confirmedCard).getByRole("region", {
      name: "Evidence Agreement",
    });
    expect(agreementRegion.textContent ?? "").not.toMatch(/%/);
    expect(confirmedCard.textContent ?? "").not.toMatch(/67%/);
    expect(confirmedCard.textContent ?? "").not.toMatch(/9 of 9/);

    expect(screen.getAllByText(/demonstration/i).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("carries footer disclaimers: research not advice, no execution, no brokerage", () => {
    renderLanding();

    expect(
      screen.getByText(/nothing on this site is investment advice/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not execute trades/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/broker-dealer/i),
    ).toBeInTheDocument();
  });

  it("does not carry the stale 'AzaLens AI' workspace label", () => {
    renderLanding();

    expect(screen.queryByText(/AzaLens AI/)).not.toBeInTheDocument();
    expect(screen.getByText("AzaLens · Analysis Workspace")).toBeInTheDocument();
  });
});

/*
 * Item 2.17. These assert *behaviour* — what a visitor's browser receives —
 * rather than repository source text, which is why they can be strict without
 * flagging the repository's own honest record of the defect (see the scope test
 * at the end of this block).
 */
describe("LandingPage carries no model-driven claim", () => {
  it("renders no AI, ML, LLM or model-driven claim anywhere in the mounted DOM", () => {
    const { container } = renderLanding();
    const rendered = container.textContent ?? "";

    for (const pattern of MODEL_DRIVEN_CLAIMS) {
      expect(rendered).not.toMatch(pattern);
    }
  });

  /*
   * Independent review found this gap: the guards matched `\bAI\b`
   * case-sensitively, so a public *lowercase* claim escaped them entirely. The
   * rationale recorded alongside them — that case sensitivity was needed to
   * avoid matching the "ai" inside "Explained" — was wrong. Word boundaries
   * already do that job.
   *
   * These controls pin both halves: standalone lowercase tokens must be caught,
   * and ordinary words containing the same letters must not be.
   */
  it("catches a standalone lowercase ai, ml or llm claim", () => {
    for (const claim of [
      "ai analysis",
      "built with ml",
      "powered by an llm",
      "Ai Stock Intelligence",
      "our AIs decide",
      "an llms-based engine",
      "gpt powered",
      "ai-driven insight",
    ]) {
      expect(
        MODEL_DRIVEN_CLAIMS.some((pattern) => pattern.test(claim)),
        `"${claim}" must be caught as a public model-driven claim`,
      ).toBe(true);
    }
  });

  it("does not fire on ordinary words that merely contain those letters", () => {
    for (const permitted of [
      "Listed Stocks. Clearly Explained.",
      "Explainable Stock Analysis",
      "EXPLAINABLE STOCK ANALYSIS",
      "Analysis of listed-company shares worldwide",
      "AAOIFI-based Shariah screening",
      "detail",
      "email",
      "html",
      "Compliance comes before the verdict",
    ]) {
      expect(
        MODEL_DRIVEN_CLAIMS.filter((pattern) => pattern.test(permitted)).map(String),
        `"${permitted}" must remain permitted`,
      ).toEqual([]);
    }
  });

  it("renders the approved positioning copy", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", { name: /Listed Stocks\.\s*Clearly Explained\./ }),
    ).toBeInTheDocument();
    expect(screen.getByText("EXPLAINABLE STOCK ANALYSIS")).toBeInTheDocument();
    expect(screen.getByText("Explainable Stock Analysis")).toBeInTheDocument();
    expect(screen.getByText("HOW THE VERDICT IS REACHED")).toBeInTheDocument();
    expect(
      screen.getByText(/Analysis of listed-company shares worldwide/),
    ).toBeInTheDocument();
  });

  /*
   * File-level assertions — page metadata, manifest branding, the social-card
   * pin, and the scope control proving historical docs and unmounted code stay
   * permitted — live in scripts/checkBrandAssets.mjs, which runs in `npm test`.
   * jsdom tests in src/ have no Node types by design (tsconfig.app.json exposes
   * only vite/client), and the repository already keeps file-level checks in
   * scripts/ for exactly this reason — see the note in designTokens.test.tsx.
   */
});

/*
 * Dead public controls (report §12). These are behavioural: any future anchor
 * without a mounted target, or any header button without an action, fails
 * automatically without naming today's offenders.
 */
describe("LandingPage exposes no dead navigation or call to action", () => {
  it("resolves every in-page anchor to a mounted target", () => {
    const { container } = renderLanding();

    const anchors = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'),
    );

    expect(anchors.length).toBeGreaterThan(0);

    for (const anchor of anchors) {
      const id = anchor.getAttribute("href")?.slice(1) ?? "";
      expect(id).not.toBe("");
      expect(
        container.querySelector(`#${CSS.escape(id)}`),
        `#${id} has no mounted target`,
      ).not.toBeNull();
    }
  });

  it("keeps the Product anchor and drops the three that pointed at nothing", () => {
    const { container } = renderLanding();

    expect(container.querySelector('a[href="#product"]')).not.toBeNull();
    expect(container.querySelector("#product")).not.toBeNull();

    for (const dead of ["#features", "#pricing", "#about"]) {
      expect(container.querySelector(`a[href="${dead}"]`)).toBeNull();
    }
  });

  it("exposes no signup call to action while the product is gated", () => {
    renderLanding();

    expect(screen.queryByRole("button", { name: /start free/i })).toBeNull();
    expect(screen.queryByText(/start free/i)).toBeNull();
  });

  it("leaves no focusable header control that does nothing", () => {
    const { container } = renderLanding();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();

    for (const button of Array.from(
      header?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    )) {
      const actionable =
        button.disabled ||
        button.getAttribute("type") === "submit" ||
        button.closest("form") !== null ||
        button.closest("a") !== null;

      expect(
        actionable,
        `header button "${button.textContent?.trim()}" is focusable but has no action`,
      ).toBe(true);
    }
  });

  it("keeps the navigation collapsed below the md breakpoint so no menu is implied", () => {
    const { container } = renderLanding();

    const nav = container.querySelector("header nav");

    expect(nav).not.toBeNull();
    expect(nav?.className).toContain("hidden");
    expect(nav?.className).toContain("md:flex");
  });
});
