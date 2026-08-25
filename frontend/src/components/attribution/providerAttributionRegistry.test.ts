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
 * Single-importer guard (B7b)
 * ==========================================================================
 *
 * B7a's guarantee was "nothing imports this". B7b deliberately ends that: the
 * component is now mounted, so the old `describe("B7a is imported by nothing")`
 * block was removed in the same change that made it false. Its comment said
 * that deletion was the intended way for the guarantee to end.
 *
 * Deleting a control without replacing it would leave the module with LESS
 * protection than before, at exactly the moment it gained a production caller.
 * So the guarantee is not dropped, it is narrowed: from "no importer" to
 * "exactly one named importer". A second mount - a second surface quietly
 * claiming Twelve Data as its source, or a copy of the phrase somewhere the
 * registry does not own - now fails here, by name.
 *
 * The scan reads source through Vite's eager raw glob rather than Node's fs,
 * per this project's jsdom constraint.
 */
const SOURCE_FILES = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/*
 * The one file authorized to import B7a. Vite normalizes glob keys relative to
 * this file, so a file outside this folder arrives as "../Name.tsx".
 */
const AUTHORIZED_IMPORTER = "../StockChart.tsx";

const IMPORT_PATTERNS = [
  /from\s+["'][^"']*[Pp]roviderAttribution(Registry)?/,
  /import\(["'][^"']*[Pp]roviderAttribution(Registry)?/,
  /components\/attribution/,
];

/*
 * Production source only: this folder's own files are excluded (B7a referencing
 * itself is the point) and so is every test file, which may import freely.
 */
function productionSources(): Array<[string, string]> {
  return Object.entries(SOURCE_FILES).filter(
    ([path]) =>
      path.startsWith("../") &&
      !path.includes("/attribution/") &&
      !path.includes(".test.") &&
      !path.includes("/test/"),
  );
}

function importersOfAttribution(): string[] {
  return productionSources()
    .filter(([, source]) =>
      IMPORT_PATTERNS.some((pattern) => pattern.test(source)),
    )
    .map(([path]) => path)
    .sort();
}

describe("B7a has exactly one authorized production importer", () => {
  /*
   * Non-vacuity. Every assertion below is a claim about a population, and a
   * population of zero would make all of them pass while proving nothing - the
   * exact failure mode a deleted guard is supposed to avoid. If the glob
   * pattern, the folder layout or the filters ever silently stop matching, this
   * fails first and the rest of the block is known to be meaningless.
   */
  it("scans a non-zero, meaningful production-source population", () => {
    const sources = productionSources();

    expect(sources.length).toBeGreaterThan(30);

    const authorized = sources.find(([path]) =>
      path.endsWith("StockChart.tsx"),
    );

    expect(
      authorized,
      "the scan must be able to see the authorized importer at all",
    ).toBeDefined();
    expect(
      authorized?.[1].length ?? 0,
      "the authorized importer's source came back empty",
    ).toBeGreaterThan(1000);

    /*
     * Total volume, not per-file: src/components/search/index.ts is a
     * deliberately empty barrel, so "every file is non-empty" would be false for
     * a reason that has nothing to do with this guard. What matters is that the
     * glob returned real content rather than a map of empty strings, which is
     * the shape a silently broken `?raw` query would produce.
     */
    const totalChars = sources.reduce(
      (total, [, source]) => total + source.length,
      0,
    );

    expect(totalChars).toBeGreaterThan(100_000);
  });

  it("is imported by exactly one production file", () => {
    const importers = importersOfAttribution();

    expect(
      importers,
      `expected exactly one importer; found: ${importers.join(", ") || "none"}`,
    ).toHaveLength(1);
  });

  it("names StockChart.tsx as that importer", () => {
    expect(importersOfAttribution()).toEqual([AUTHORIZED_IMPORTER]);
  });

  it("finds no other production importer of either module", () => {
    const others = importersOfAttribution().filter(
      (path) => path !== AUTHORIZED_IMPORTER,
    );

    expect(
      others,
      `unauthorized attribution importer(s): ${others.join(", ")}`,
    ).toEqual([]);
  });

  /*
   * The mutation control, run in-process rather than by hand.
   *
   * A guard that only ever sees the passing case is not evidence. This proves
   * the detector actually fires: a synthetic second importer, with the same
   * shape a real one would have, must be reported as an offender - and must be
   * reported IN ADDITION to StockChart, so the guard cannot be passing merely
   * because it counts one thing.
   *
   * The probe is a string held in this test, not a file written to the
   * repository: no probe file is created, so none can be left behind.
   */
  it("fails when a second production importer exists", () => {
    const probePath = "../pages/UnauthorizedAttributionProbe.tsx";
    const probeSource =
      'import ProviderAttribution from "../components/attribution/ProviderAttribution";\n';

    const mutated: Array<[string, string]> = [
      ...productionSources(),
      [probePath, probeSource],
    ];

    const offenders = mutated
      .filter(([, source]) =>
        IMPORT_PATTERNS.some((pattern) => pattern.test(source)),
      )
      .map(([path]) => path)
      .sort();

    expect(offenders).toContain(probePath);
    expect(offenders).toContain(AUTHORIZED_IMPORTER);
    expect(offenders.length).toBeGreaterThan(1);
    expect(offenders).not.toEqual([AUTHORIZED_IMPORTER]);
  });

  it("fails when the authorized importer stops importing", () => {
    const withoutImporter = productionSources().filter(
      ([path]) => path !== AUTHORIZED_IMPORTER,
    );

    const offenders = withoutImporter
      .filter(([, source]) =>
        IMPORT_PATTERNS.some((pattern) => pattern.test(source)),
      )
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});

describe("the approved phrase and href stay owned by the registry", () => {
  /*
   * Ownership is two claims, and both are asserted: the phrase appears in no
   * production file outside this folder, AND it does appear - exactly once - in
   * the registry that owns it. Asserting only the first would pass if the
   * phrase had been deleted from the codebase entirely.
   */
  it("puts the approved phrase in exactly one non-test source file", () => {
    const outsiders = productionSources()
      .filter(([, source]) => source.includes("Data provided by Twelve Data"))
      .map(([path]) => path);

    expect(outsiders).toEqual([]);

    const owners = Object.entries(SOURCE_FILES)
      .filter(
        ([path]) =>
          !path.startsWith("../") &&
          !path.includes(".test.") &&
          SOURCE_FILES[path].includes("Data provided by Twelve Data"),
      )
      .map(([path]) => path);

    expect(owners).toHaveLength(1);
    expect(owners[0]?.toLowerCase()).toContain(
      "providerattributionregistry.ts",
    );
  });

  it("keeps the phrase out of StockChart, which only mounts the component", () => {
    const stockChart = productionSources().find(([path]) =>
      path.endsWith("StockChart.tsx"),
    );

    expect(stockChart).toBeDefined();
    expect(stockChart?.[1]).toContain("ProviderAttribution");
    expect(stockChart?.[1]).not.toContain("Data provided by");
    expect(stockChart?.[1]).not.toContain("twelvedata.com");
  });

  it("keeps the href out of every production file but the registry", () => {
    const carriers = productionSources()
      .filter(([, source]) => source.includes("https://twelvedata.com"))
      .map(([path]) => path);

    expect(carriers).toEqual([]);
  });
});
