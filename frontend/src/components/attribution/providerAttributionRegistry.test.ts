import { describe, expect, it } from "vitest";

import registrySource from "./providerAttributionRegistry.ts?raw";
import componentSource from "./ProviderAttribution.tsx?raw";
import {
  ATTRIBUTION_BLOCKED_PROVIDER_IDS,
  ATTRIBUTION_PROVIDER_IDS,
  PROVIDER_ATTRIBUTION,
  normalizeAttributionProvider,
  resolveProviderAttribution,
  type AttributionProviderId,
} from "./providerAttributionRegistry";

/*
 * B7a is unmounted, so these tests are the only consumer of this module. The
 * source is read through Vite's ?raw import rather than node:fs because jsdom
 * tests in src/ have no Node types by design (tsconfig.app.json exposes only
 * vite/client) - the same constraint recorded in LandingPage.test.tsx.
 */

const APPROVED_TEXT = "Data provided by Twelve Data";
const APPROVED_HREF = "https://twelvedata.com";

describe("provider identity", () => {
  it("declares exactly one renderable provider", () => {
    expect([...ATTRIBUTION_PROVIDER_IDS]).toEqual(["twelve_data"]);
  });

  it("accepts the exact backend label and nothing else", () => {
    expect(normalizeAttributionProvider("TwelveData")).toBe("twelve_data");
  });

  /*
   * The lookalikes. backend/providers/marketDataProvider.js emits "TwelveData"
   * and "Finnhub" only, so every value below is a string no verified contract
   * produces. Accepting one would claim Twelve Data as the origin of data whose
   * label nothing stamped.
   */
  it("rejects every lookalike of the approved label", () => {
    for (const lookalike of [
      "twelvedata",
      "Twelve Data",
      "twelve_data",
      "TWELVEDATA",
      "twelveData",
      "Twelvedata",
      " TwelveData",
      "TwelveData ",
      " TwelveData ",
      "TwelveData\n",
    ]) {
      expect(
        normalizeAttributionProvider(lookalike),
        `${JSON.stringify(lookalike)} must not normalize`,
      ).toBeNull();
    }
  });

  it("rejects other providers and arbitrary vendors", () => {
    for (const other of ["Finnhub", "finnhub", "Halal Terminal", "SomeVendor"]) {
      expect(normalizeAttributionProvider(other)).toBeNull();
    }
  });

  it("rejects null, undefined, blank and whitespace", () => {
    for (const empty of [null, undefined, "", "   ", "\t", "\n"]) {
      expect(normalizeAttributionProvider(empty)).toBeNull();
    }
  });

  it("rejects non-string values rather than coercing them", () => {
    for (const malformed of [42, true, {}, [], Number.NaN, Symbol("x")]) {
      expect(normalizeAttributionProvider(malformed)).toBeNull();
    }
  });

  /*
   * A provenance string arrives from the network. Object-property indexing
   * would resolve inherited names; the Map lookup has no prototype chain.
   */
  it("rejects unsafe object-property names", () => {
    for (const unsafe of [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "hasOwnProperty",
      "valueOf",
    ]) {
      expect(
        normalizeAttributionProvider(unsafe),
        `${unsafe} must not resolve through the prototype chain`,
      ).toBeNull();
    }
  });
});

describe("attribution registry", () => {
  it("holds exactly one provider key", () => {
    expect(Object.keys(PROVIDER_ATTRIBUTION)).toEqual(["twelve_data"]);
  });

  it("stores the exact approved phrase and href", () => {
    const definition = PROVIDER_ATTRIBUTION.twelve_data;

    expect(definition.providerId).toBe("twelve_data");
    expect(definition.text).toBe(APPROVED_TEXT);
    expect(definition.href).toBe(APPROVED_HREF);
  });

  it("cites the guideline the wording came from", () => {
    expect(PROVIDER_ATTRIBUTION.twelve_data.evidence).toContain(
      "support.twelvedata.com",
    );
  });

  /*
   * One phrase, no variant mechanism (Ahsan, 2026-08-25). A compact form is
   * approved by the guidelines but no identified surface needs it, and B7a
   * mounts nothing, so a variant branch would be an abstraction with no caller.
   */
  it("exposes no variant or alternative-phrase mechanism", () => {
    const definition = PROVIDER_ATTRIBUTION.twelve_data;

    expect(Object.keys(definition).sort()).toEqual([
      "evidence",
      "href",
      "providerId",
      "text",
    ]);

    for (const forbidden of [
      "compactText",
      "shortText",
      "variant",
      "variants",
      "alternativeText",
    ]) {
      expect(forbidden in definition).toBe(false);
    }
  });

  it("exposes no logo, image or asset field", () => {
    const definition = PROVIDER_ATTRIBUTION.twelve_data;

    for (const forbidden of ["logo", "logoUrl", "icon", "image", "mark", "svg"]) {
      expect(forbidden in definition).toBe(false);
    }
  });

  it("stores none of the brand-page-only phrases", () => {
    const serialized = JSON.stringify(PROVIDER_ATTRIBUTION);

    for (const unapproved of [
      "Data from Twelve Data",
      "Powered by Twelve Data",
      "Source: Twelve Data",
    ]) {
      expect(serialized).not.toContain(unapproved);
    }
  });

  /*
   * `readonly` vanishes at runtime. Freezing has to be real, and it has to
   * reach the nested definition: freezing only the outer record would leave
   * every field writable.
   */
  it("is frozen at runtime, outer record and nested definition", () => {
    expect(Object.isFrozen(PROVIDER_ATTRIBUTION)).toBe(true);
    expect(Object.isFrozen(PROVIDER_ATTRIBUTION.twelve_data)).toBe(true);
  });

  it("resists mutation of the stored wording and href", () => {
    const mutable = PROVIDER_ATTRIBUTION as unknown as Record<
      string,
      Record<string, string>
    >;

    expect(() => {
      mutable.twelve_data.text = "Data from Somewhere Else";
    }).toThrow(TypeError);

    expect(() => {
      mutable.twelve_data.href = "https://example.invalid";
    }).toThrow(TypeError);

    expect(() => {
      mutable.finnhub = { text: "x", href: "y" };
    }).toThrow(TypeError);

    expect(PROVIDER_ATTRIBUTION.twelve_data.text).toBe(APPROVED_TEXT);
    expect(PROVIDER_ATTRIBUTION.twelve_data.href).toBe(APPROVED_HREF);
  });
});

describe("Halal Terminal has no renderable definition", () => {
  it("is declared blocked, in a list that shares no type with the renderable union", () => {
    expect([...ATTRIBUTION_BLOCKED_PROVIDER_IDS]).toEqual(["halal_terminal"]);

    const renderable: readonly string[] = ATTRIBUTION_PROVIDER_IDS;
    for (const blocked of ATTRIBUTION_BLOCKED_PROVIDER_IDS) {
      expect(renderable).not.toContain(blocked);
    }
  });

  it("has no registry key", () => {
    expect("halal_terminal" in PROVIDER_ATTRIBUTION).toBe(false);
    expect(
      (PROVIDER_ATTRIBUTION as Record<string, unknown>).halal_terminal,
    ).toBeUndefined();
  });

  it("cannot resolve from any Halal Terminal-like label", () => {
    for (const label of [
      "Halal Terminal",
      "HalalTerminal",
      "halal_terminal",
      "halalterminal",
      "HALAL TERMINAL",
    ]) {
      const resolution = resolveProviderAttribution(label);

      expect(resolution.status).toBe("unrecognized");
      expect(normalizeAttributionProvider(label)).toBeNull();
    }
  });

  /*
   * The control that actually catches a shipped placeholder: no Halal Terminal
   * wording, and no generic substitute, may exist anywhere in these sources.
   */
  it("contributes no wording or placeholder to either source file", () => {
    for (const source of [registrySource, componentSource]) {
      for (const forbidden of [
        "Screening by",
        "Screening data",
        "Compliance data",
        "Data provider",
        "provided by Halal",
        "Powered by Halal",
        "TODO",
        "PLACEHOLDER",
        "FIXME",
      ]) {
        expect(
          source.includes(forbidden),
          `attribution sources must not contain ${forbidden}`,
        ).toBe(false);
      }
    }
  });
});

describe("resolution states", () => {
  it("is absent for null, undefined, blank and whitespace", () => {
    for (const empty of [null, undefined, "", "   ", "\t\n"]) {
      expect(resolveProviderAttribution(empty)).toEqual({ status: "absent" });
    }
  });

  it("is resolved only for the exact approved label", () => {
    const resolution = resolveProviderAttribution("TwelveData");

    expect(resolution.status).toBe("resolved");

    if (resolution.status === "resolved") {
      expect(resolution.definition.text).toBe(APPROVED_TEXT);
      expect(resolution.definition.href).toBe(APPROVED_HREF);
    }
  });

  it("is unrecognized for every other supplied value, carrying the raw string", () => {
    for (const other of ["twelvedata", "Twelve Data", "Finnhub", "Nobody"]) {
      const resolution = resolveProviderAttribution(other);

      expect(resolution.status).toBe("unrecognized");

      if (resolution.status === "unrecognized") {
        expect(resolution.rawProvider).toBe(other);
      }
    }
  });

  it("never falls back to a default provider", () => {
    for (const other of ["", "Finnhub", "unknown", null]) {
      const resolution = resolveProviderAttribution(other);
      expect(resolution.status).not.toBe("resolved");
    }
  });

  it("returns frozen results so a caller cannot rewrite a resolution", () => {
    const resolved = resolveProviderAttribution("TwelveData");
    const absent = resolveProviderAttribution(null);
    const unknown = resolveProviderAttribution("Nobody");

    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(absent)).toBe(true);
    expect(Object.isFrozen(unknown)).toBe(true);
  });
});

describe("purity and inference controls", () => {
  /*
   * No metric, no console, no I/O in B7a. Emitting from a resolver that a
   * component calls during render would be a side effect in render, firing
   * twice under StrictMode and again on every rerender - into a sink the
   * frontend does not currently have.
   */
  it("performs no logging or side effect", () => {
    for (const source of [registrySource, componentSource]) {
      for (const forbidden of [
        "console.",
        "fetch(",
        "localStorage",
        "sessionStorage",
        "navigator.sendBeacon",
        "useEffect",
      ]) {
        expect(
          source.includes(forbidden),
          `B7a must not use ${forbidden}`,
        ).toBe(false);
      }
    }
  });

  it("infers nothing from configuration, defaults or the endpoint", () => {
    for (const source of [registrySource, componentSource]) {
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

      for (const forbidden of [
        "HISTORY_PROVIDER",
        "DEFAULTS",
        "import.meta.env",
        "process.env",
        "/history/",
        "Finnhub",
      ]) {
        expect(
          code.includes(forbidden),
          `B7a code must not reference ${forbidden}`,
        ).toBe(false);
      }
    }
  });

  it("keeps the union closed so a raw string cannot become a registry key", () => {
    const ids: readonly AttributionProviderId[] = ATTRIBUTION_PROVIDER_IDS;

    for (const id of ids) {
      expect(PROVIDER_ATTRIBUTION[id]).toBeDefined();
    }

    expect(Object.keys(PROVIDER_ATTRIBUTION)).toHaveLength(ids.length);
  });
});


/*
 * ==========================================================================
 * Isolation
 * ==========================================================================
 *
 * B7a's whole safety claim is that nothing imports it. That is asserted here
 * rather than assumed: the scan reads every source file under src/ through
 * Vite's eager raw glob - no Node APIs, per this project's jsdom constraint -
 * and fails if any file outside this folder references the attribution module.
 *
 * When B7b mounts the component it will delete this describe block. That is the
 * intended way for the guarantee to end: visibly, in the diff that ends it.
 */
const SOURCE_FILES = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("B7a is imported by nothing", () => {
  it("reads a meaningful sample of the frontend source", () => {
    expect(Object.keys(SOURCE_FILES).length).toBeGreaterThan(30);
  });

  it("is referenced by no file outside the attribution folder", () => {
    const offenders: string[] = [];

    for (const [path, source] of Object.entries(SOURCE_FILES)) {
      /*
       * Vite normalizes keys relative to this file, so files in this same
       * folder arrive as "./Name.tsx" rather than with an /attribution/
       * segment. Both forms are skipped: B7a referencing itself is the point.
       */
      if (path.includes("/attribution/") || !path.startsWith("../")) {
        continue;
      }

      if (
        /from\s+["'][^"']*[Pp]roviderAttribution(Registry)?/.test(source) ||
        /import\(["'][^"']*[Pp]roviderAttribution(Registry)?/.test(source) ||
        source.includes("components/attribution")
      ) {
        offenders.push(path);
      }
    }

    expect(
      offenders,
      `B7a must be mounted by nothing; found importer(s): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("leaves StockChart free of any attribution import", () => {
    const stockChart = Object.entries(SOURCE_FILES).find(([path]) =>
      path.endsWith("StockChart.tsx"),
    );

    expect(stockChart).toBeDefined();
    expect(stockChart?.[1]).not.toContain("ProviderAttribution");
    expect(stockChart?.[1]).not.toContain("providerAttributionRegistry");
    expect(stockChart?.[1]).not.toContain("attribution/");
    expect(stockChart?.[1]).not.toContain("Data provided by");
  });

  it("puts the approved phrase in exactly one source file", () => {
    const carriers = Object.entries(SOURCE_FILES)
      .filter(([, source]) => source.includes("Data provided by Twelve Data"))
      .map(([path]) => path)
      .filter((path) => !path.includes(".test."));

    expect(carriers).toHaveLength(1);
    expect(carriers[0]?.toLowerCase()).toContain(
      "providerattributionregistry.ts",
    );
  });
});
