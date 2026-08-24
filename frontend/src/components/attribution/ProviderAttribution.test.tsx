import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProviderAttribution from "./ProviderAttribution";

/*
 * Isolated render tests. Rendering the component inside a unit test is not
 * production mounting: no page or component imports it, which the isolation
 * scan in providerAttributionRegistry.test.ts proves separately.
 *
 * The specifier above is bare and unambiguous because the logic module is named
 * providerAttributionRegistry.ts. Were it named providerAttribution.ts, this
 * import would resolve to the logic module on a default macOS APFS volume -
 * case-insensitive, with .ts ahead of .tsx in extension order - and fail with
 * "Element type is invalid", while resolving correctly on case-sensitive Linux
 * CI. See the naming rule in ProviderAttribution.tsx.
 */

const APPROVED_TEXT = "Data provided by Twelve Data";
const APPROVED_HREF = "https://twelvedata.com";

describe("ProviderAttribution with resolved provenance", () => {
  it("renders a real anchor element", () => {
    render(<ProviderAttribution provider="TwelveData" />);

    const link = screen.getByRole("link");

    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link.tagName).toBe("A");
  });

  it("renders the exact approved wording", () => {
    render(<ProviderAttribution provider="TwelveData" />);

    expect(screen.getByRole("link")).toHaveTextContent(
      new RegExp(`^${APPROVED_TEXT}$`),
    );
  });

  it("links to the exact required target", () => {
    render(<ProviderAttribution provider="TwelveData" />);

    expect(screen.getByRole("link")).toHaveAttribute("href", APPROVED_HREF);
  });

  it("names the provider in its accessible name", () => {
    render(<ProviderAttribution provider="TwelveData" />);

    expect(
      screen.getByRole("link", { name: APPROVED_TEXT }),
    ).toBeInTheDocument();
  });

  /*
   * The visible text already carries the provider name. An aria-label override
   * is how a visible and an accessible name drift apart.
   */
  it("adds no aria-label that could diverge from the visible wording", () => {
    const { container } = render(<ProviderAttribution provider="TwelveData" />);
    const link = container.querySelector("a");

    expect(link?.getAttribute("aria-label")).toBeNull();
    expect(link?.getAttribute("aria-labelledby")).toBeNull();
  });

  /*
   * "Dofollow" is the absence of these tokens, not an attribute to add.
   * rel="noreferrer" is a referrer and window-isolation hint, not a crawl
   * directive, so it satisfies the requirement.
   */
  it("carries no crawl-blocking rel token", () => {
    const { container } = render(<ProviderAttribution provider="TwelveData" />);
    const rel = container.querySelector("a")?.getAttribute("rel") ?? "";
    const tokens = rel.split(/\s+/).filter(Boolean);

    for (const forbidden of ["nofollow", "ugc", "sponsored"]) {
      expect(tokens).not.toContain(forbidden);
    }

    expect(tokens).toContain("noreferrer");
  });

  it("renders text only - no image, svg, picture or background image", () => {
    const { container } = render(<ProviderAttribution provider="TwelveData" />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("picture")).toBeNull();
    expect(container.innerHTML).not.toContain("background-image");
    expect(container.innerHTML).not.toContain("data:image");
  });

  it("renders exactly one provider statement and combines no providers", () => {
    const { container } = render(<ProviderAttribution provider="TwelveData" />);

    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.textContent).toBe(APPROVED_TEXT);
    expect(container.textContent).not.toContain("Halal");
    expect(container.textContent).not.toContain("Finnhub");
    expect(container.textContent).not.toContain(" and ");
  });

  it("adds no styling or placement wrapper", () => {
    const { container } = render(<ProviderAttribution provider="TwelveData" />);
    const link = container.querySelector("a");

    expect(container.firstElementChild).toBe(link);
    expect(link?.getAttribute("class")).toBeNull();
    expect(link?.getAttribute("style")).toBeNull();
  });
});

describe("ProviderAttribution with non-resolved provenance", () => {
  it("renders no DOM when provenance is absent", () => {
    for (const absent of [null, undefined, "", "   "]) {
      const { container } = render(<ProviderAttribution provider={absent} />);
      expect(container.innerHTML).toBe("");
    }
  });

  it("renders no DOM for an unrecognized provider", () => {
    for (const unknown of [
      "twelvedata",
      "Twelve Data",
      "twelve_data",
      "Finnhub",
      "Halal Terminal",
      "SomeVendor",
      "__proto__",
    ]) {
      const { container } = render(<ProviderAttribution provider={unknown} />);
      expect(
        container.innerHTML,
        `${unknown} must render nothing`,
      ).toBe("");
    }
  });

  it("never falls back to Twelve Data for an unknown label", () => {
    const { container } = render(<ProviderAttribution provider="Nobody" />);

    expect(container.textContent).toBe("");
    expect(container.textContent).not.toContain("Twelve Data");
  });
});

/*
 * Compile-time ownership controls. Provider-required wording belongs to the
 * component, not to the caller, and the props type is what enforces it: each
 * line below fails to compile, which is the assertion.
 */
describe("callers cannot supply attribution content", () => {
  it("rejects text, href, children, definition and variant props", () => {
    // @ts-expect-error text is not a prop - the registry owns the wording
    const withText = <ProviderAttribution provider="TwelveData" text="Custom" />;
    // @ts-expect-error href is not a prop - the registry owns the target
    const withHref = <ProviderAttribution provider="TwelveData" href="https://evil.invalid" />;
    // @ts-expect-error children are not accepted
    const withChildren = <ProviderAttribution provider="TwelveData">x</ProviderAttribution>;
    // @ts-expect-error a caller may not inject a definition
    const withDefinition = <ProviderAttribution provider="TwelveData" definition={{ text: "x", href: "y" }} />;
    // @ts-expect-error no variant mechanism exists
    const withVariant = <ProviderAttribution provider="TwelveData" variant="compact" />;

    expect(
      [withText, withHref, withChildren, withDefinition, withVariant],
    ).toHaveLength(5);
  });

  it("rejects a non-string provider value", () => {
    // @ts-expect-error provider is string | null | undefined
    const numeric = <ProviderAttribution provider={42} />;

    expect(numeric).toBeDefined();
  });
});
