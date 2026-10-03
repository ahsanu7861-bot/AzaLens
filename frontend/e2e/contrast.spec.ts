import { expect, test } from "@playwright/test";

import { contrastRatio, flattenBackground, layeredContrast, parseCssColor } from "./contrast";

/**
 * Pure checks of the contrast helper; no page is opened. Every expected value was calculated independently
 * of this module, in a separate Python script, using Ottosson's OKLab-to-sRGB matrices, source-over alpha
 * blending on gamma-encoded sRGB channels and the WCAG 2 ratio. The previous helper read only the first
 * three numbers of a colour string and stopped at the nearest background that was not fully transparent, so
 * it returned the "previously" value noted beside each translucent case.
 */
const WHITE = "rgb(255, 255, 255)";
const BLACK = "rgb(0, 0, 0)";

const rounded = (values: number[]) => values.map((value) => Number(value.toFixed(3)));

test.describe("contrast helper", () => {
  test("opaque control: the historical brand-Button ratios are unchanged", () => {
    // The five directly browser-measured night controls: white on rgb(6, 182, 212).
    expect(layeredContrast(WHITE, ["rgb(6, 182, 212)"]).ratio.toFixed(3)).toBe("2.428");
    expect(layeredContrast(WHITE, ["rgb(14, 116, 144)"]).ratio.toFixed(3)).toBe("5.358");
    // An opaque innermost layer hides everything beneath it.
    expect(layeredContrast(WHITE, ["rgb(6, 182, 212)", BLACK]).ratio.toFixed(3)).toBe("2.428");
    expect(contrastRatio([255, 255, 255], [6, 182, 212]).toFixed(3)).toBe("2.428");
  });

  test("single translucent layer is composited over its backing colour", () => {
    const result = layeredContrast(WHITE, ["rgba(0, 0, 0, 0.5)", WHITE]);
    expect(rounded(result.background)).toEqual([127.5, 127.5, 127.5]);
    expect(result.ratio.toFixed(3)).toBe("3.977"); // previously 21.000
  });

  test("nested translucent layers are composited in paint order", () => {
    // Red at 50% painted on blue at 50%, painted on white. Order matters: the reverse gives (127.5, 63.75, 191.25).
    const result = layeredContrast(BLACK, ["rgba(255, 0, 0, 0.5)", "rgba(0, 0, 255, 0.5)", WHITE]);
    expect(rounded(result.background)).toEqual([191.25, 63.75, 127.5]);
    expect(result.ratio.toFixed(3)).toBe("4.259"); // previously 5.252
  });

  test("translucent text is composited over the flattened background", () => {
    const result = layeredContrast("rgba(255, 255, 255, 0.5)", [BLACK]);
    expect(rounded(result.foreground)).toEqual([127.5, 127.5, 127.5]);
    expect(result.ratio.toFixed(3)).toBe("5.281"); // previously 21.000
  });

  // The exact computed strings Chromium returned for the "Owner authenticated" badge on /settings and its
  // ancestors: badge `bg-positive/10`, card, then the opaque `bg-canvas` app shell.
  test("browser oklab chain for the day badge", () => {
    const result = layeredContrast("rgb(4, 120, 87)", [
      "oklab(0.508117 -0.101622 0.0260825 / 0.1)",
      "oklab(0.519723 -0.0682645 -0.0639399 / 0.055)",
      "rgb(248, 250, 252)",
    ]);
    expect(rounded(result.background)).toEqual([212.033, 230.366, 230.152]);
    expect(result.ratio.toFixed(3)).toBe("4.258"); // previously 3.825
  });

  test("browser oklab chain for the night badge", () => {
    const result = layeredContrast("rgb(16, 185, 129)", [
      "oklab(0.695856 -0.14213 0.0449026 / 0.1)",
      "oklab(0.71481 -0.102692 -0.0724838 / 0.055)",
      "rgb(10, 14, 26)",
    ]);
    expect(rounded(result.background)).toEqual([10.438, 39.414, 45.503]);
    expect(result.ratio.toFixed(3)).toBe("6.142"); // previously 8.266
  });

  test("parses the colour syntaxes a computed style can return", () => {
    expect(parseCssColor("rgba(16, 185, 129, 0.15)")).toEqual({ r: 16, g: 185, b: 129, alpha: 0.15 });
    expect(parseCssColor("rgb(16 185 129 / 15%)")).toEqual({ r: 16, g: 185, b: 129, alpha: 0.15 });
    expect(parseCssColor("transparent").alpha).toBe(0);
    expect(parseCssColor("rgba(0, 0, 0, 0)").alpha).toBe(0);
    expect(parseCssColor("color(srgb 1 0 0.5 / 0.25)")).toEqual({ r: 255, g: 0, b: 127.5, alpha: 0.25 });
    expect(rounded(Object.values(parseCssColor("oklab(0.71481 -0.102692 -0.0724838)")))).toEqual([
      6.287, 181.988, 211.97, 1,
    ]);
    const polar = parseCssColor("oklch(0.7 0.1 180 / 0.5)");
    const cartesian = parseCssColor("oklab(0.7 -0.1 0 / 0.5)");
    expect(rounded(Object.values(polar))).toEqual(rounded(Object.values(cartesian)));
  });

  test("refuses inputs it cannot composite honestly", () => {
    expect(() => parseCssColor("color-mix(in oklab, red 10%, transparent)")).toThrow(/Unsupported/);
    expect(() => parseCssColor("lab(50 10 10)")).toThrow(/Unsupported/);
    expect(() => parseCssColor("color(display-p3 1 0 0)")).toThrow(/Unsupported/);
    expect(() => parseCssColor("oklab(none 0 0)")).toThrow(/Unparsable/);
    expect(() => flattenBackground(["rgba(0, 0, 0, 0.5)", "transparent"])).toThrow(/No opaque backing/);
  });
});
