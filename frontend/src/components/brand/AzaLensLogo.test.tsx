import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";

import {
  ThemeContext,
  type ResolvedTheme,
} from "../../app/providers/theme";
import AzaLensLogo from "./AzaLensLogo";

function renderLogo(
  resolvedTheme: ResolvedTheme,
  props: ComponentProps<typeof AzaLensLogo> = {},
) {
  return render(
    <ThemeContext.Provider
      value={{
        preference: resolvedTheme,
        resolvedTheme,
        setPreference: () => undefined,
      }}
    >
      <AzaLensLogo {...props} />
    </ThemeContext.Provider>,
  );
}

describe("AzaLensLogo", () => {
  it("selects the approved light wordmark for the night theme", () => {
    renderLogo("night");

    expect(screen.getByRole("img", { name: "AzaLens" })).toHaveAttribute(
      "src",
      "/brand/azalens-horizontal-on-dark.svg",
    );
  });

  it("selects the approved dark wordmark for the day theme", () => {
    renderLogo("day");

    expect(screen.getByRole("img", { name: "AzaLens" })).toHaveAttribute(
      "src",
      "/brand/azalens-horizontal-on-light.svg",
    );
  });

  it("uses the canonical standalone symbol in constrained contexts", () => {
    const { container } = renderLogo("night", {
      variant: "symbol",
      decorative: true,
    });

    const logo = container.querySelector("img");
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("src", "/brand/azalens-symbol-gradient.svg");
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).toHaveAttribute("alt", "");
  });

  it("uses the reduced-motion-safe approved loading mark", () => {
    renderLogo("night", { variant: "loading" });

    expect(screen.getByRole("img", { name: "AzaLens" })).toHaveAttribute(
      "src",
      "/brand/azalens-loading-mark-animated.svg",
    );
  });
});
