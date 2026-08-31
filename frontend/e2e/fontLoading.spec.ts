import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
  assertRequestPolicy,
  installRequestPolicy,
  LOCAL_FONT_PATH,
  reportRequestAudit,
} from "./requestPolicy";

/*
 * Positive proof that the vendored faces are the ones the browser fetches and
 * renders.
 *
 * This is NOT a screenshot spec. It never calls `toHaveScreenshot`, is not
 * tagged `@visual`, and therefore cannot compare against, write or influence an
 * accepted baseline by any code path. It is the companion evidence to the
 * visual suite: the visual suite proves the rendering did not change, this
 * proves *why* — the local files were requested, served, loaded, matched and
 * applied.
 *
 * Observing "no external request happened" is not proof of that. A page that
 * failed to load, a policy that never installed, and a page rendering entirely
 * in fallback type all produce an empty external-request list. Every assertion
 * below is therefore positive: a request that occurred, a response that
 * succeeded, bytes that matched, a family that resolved, a weight that computed.
 *
 * What a browser cannot tell us, stated plainly: no web API exposes which
 * physical font file was used to raster a given glyph. `document.fonts.check()`
 * reports that a matching face is loaded and available, not that it was chosen
 * for a particular element, and `getComputedStyle().fontFamily` reports the
 * requested stack, not the resolved face. So this spec does not claim to
 * observe the selected face directly. It combines independent evidence that is
 * jointly sufficient:
 *
 *   1. the exact six local WOFF2 files were requested from this origin;
 *   2. each returned HTTP 200 with a WOFF2 media type;
 *   3. each response body hashes to the sha256 recorded in
 *      font-provenance/PROVENANCE.json — the same digest the static check
 *      pins, so a renamed, truncated, substituted or 404-HTML-bodied file
 *      fails here;
 *   4. `document.fonts.load()` resolved a FontFace for every required
 *      family/weight, which it cannot do if the file behind the face failed;
 *   5. `document.fonts.check()` then reports each of those faces available;
 *   6. real rendered application elements compute to the intended family;
 *   7. `font-synthesis` is off, so a missing weight would render at the wrong
 *      weight rather than being faked into looking correct;
 *   8. no face declares a ranged or non-canonical weight, so F1's discrete
 *      matrix — not a variable instance — is what the 650/750 rules resolve
 *      against.
 *
 * Any one of those is weak. Together they fail if the local font files are
 * renamed, unavailable, served with the wrong type, replaced by different
 * bytes, not applied, or silently substituted by a fallback.
 */

type ProvenanceEntry = {
  path: string;
  family: string;
  subset: string;
  bytes: number;
  sha256: string;
  declaredWeights: number[];
};

const provenance = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../font-provenance/PROVENANCE.json", import.meta.url)),
    "utf8",
  ),
) as { fonts: ProvenanceEntry[] };

/*
 * The manifest is the single owner of what "the local fonts" means. Deriving
 * the expected inventory from it rather than retyping six filenames is what
 * makes assertion 3 above meaningful: this spec and
 * scripts/checkLocalFonts.mjs cannot drift apart into disagreeing about which
 * bytes are the real ones.
 */
const EXPECTED_FONTS = provenance.fonts.map((entry) => ({
  ...entry,
  url: `/${entry.path.replace(/^frontend\/public\//, "")}`,
}));

const EXPECTED_FONT_URLS = EXPECTED_FONTS.map((entry) => entry.url).sort();

/** Media types a WOFF2 file may legitimately be served as. */
const WOFF2_MEDIA_TYPE = /^(font\/woff2|application\/font-woff2)\b/;

/*
 * Representative required faces. Weights are the ones F1 declares discretely;
 * both subsets are exercised, latin through ordinary Latin text and latin-ext
 * through a character that falls in the U+0100-02BA range only that subset
 * covers.
 */
const REQUIRED_FACES = [
  { family: "Inter", weights: [400, 500, 600, 700] },
  { family: "JetBrains Mono", weights: [400, 500, 600, 700] },
  { family: "Space Grotesk", weights: [600, 700] },
];
const LATIN_PROBE = "BESbswy";
const LATIN_EXT_PROBE = "Āāİ";

test.describe("local font loading", () => {
  test("the vendored faces are fetched from this origin, loaded and applied", async ({
    page,
  }) => {
    const audit = await installRequestPolicy(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    // Real application surface, not a synthetic harness page: these are the
    // elements the accepted baselines photograph.
    const confirmed = page.getByTestId("landing-demo-confirmed");
    await expect(confirmed).toBeVisible();
    const heading = page.getByRole("heading", { level: 1, name: /Listed Stocks\./ });
    await expect(heading).toBeVisible();

    // ----------------------------------------------------------------
    // 1. document.fonts.ready resolves, and every required face loads.
    // ----------------------------------------------------------------

    const loadResults = await page.evaluate(
      async ({ faces, latin, latinExt }) => {
        await document.fonts.ready;

        const results: Array<{
          family: string;
          weight: number;
          probe: string;
          loaded: number;
          error: string | null;
          check: boolean;
        }> = [];

        for (const { family, weights } of faces) {
          for (const weight of weights) {
            for (const probe of [latin, latinExt]) {
              const spec = `${weight} 16px "${family}"`;
              let loaded = 0;
              let error: string | null = null;
              try {
                loaded = (await document.fonts.load(spec, probe)).length;
              } catch (cause) {
                error = String(cause);
              }
              results.push({
                family,
                weight,
                probe,
                loaded,
                error,
                check: document.fonts.check(spec, probe),
              });
            }
          }
        }
        return results;
      },
      { faces: REQUIRED_FACES, latin: LATIN_PROBE, latinExt: LATIN_EXT_PROBE },
    );

    /*
     * `document.fonts.load()` rejects if the face's source cannot be fetched
     * and decoded, and resolves with the matched FontFace objects otherwise.
     * A zero-length result means the request matched no declared face at all;
     * an error means the file behind a declared face did not load. Both are
     * exactly the failure this spec exists to catch.
     */
    const failedLoads = loadResults.filter(
      (entry) => entry.error !== null || entry.loaded < 1 || !entry.check,
    );
    expect(
      failedLoads,
      "every required family and weight must load from a local file and report available",
    ).toEqual([]);

    // ----------------------------------------------------------------
    // 2. Every observed font request was local, successful and a WOFF2.
    // ----------------------------------------------------------------

    /*
     * Re-fetch each declared file from inside the page with `cache: no-store`,
     * so every one produces a real request/response pair rather than a memory
     * cache hit, and hash the bytes the server actually returned.
     *
     * This is the assertion that a 404 cannot survive: a dev server answering
     * a missing path with an HTML body still returns *something*, and that
     * something has neither the recorded length nor the recorded digest.
     */
    const served = await page.evaluate(async (urls: string[]) => {
      const out: Array<{
        url: string;
        ok: boolean;
        status: number;
        contentType: string;
        bytes: number;
        sha256: string;
      }> = [];
      for (const url of urls) {
        const response = await fetch(url, { cache: "no-store" });
        const buffer = await response.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        out.push({
          url,
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          bytes: buffer.byteLength,
          sha256: [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
        });
      }
      return out;
    }, EXPECTED_FONT_URLS);

    expect(
      served.map((entry) => entry.url).sort(),
      "every declared local font file must be reachable from the browser",
    ).toEqual(EXPECTED_FONT_URLS);

    for (const entry of served) {
      const declared = EXPECTED_FONTS.find((font) => font.url === entry.url);
      expect(declared, `${entry.url} is not declared in PROVENANCE.json`).toBeTruthy();
      expect(entry.status, `${entry.url} must return HTTP 200`).toBe(200);
      expect(entry.ok, `${entry.url} must return a successful response`).toBe(true);
      expect(
        entry.contentType,
        `${entry.url} must be served as WOFF2, not ${JSON.stringify(entry.contentType)}`,
      ).toMatch(WOFF2_MEDIA_TYPE);
      expect(entry.bytes, `${entry.url} byte length must match PROVENANCE.json`).toBe(
        declared!.bytes,
      );
      expect(entry.sha256, `${entry.url} sha256 must match PROVENANCE.json`).toBe(
        declared!.sha256,
      );
    }

    // Playwright-side corroboration of the same responses, observed at the
    // network layer rather than reported by the page.
    const fontPaths = audit.localFontPaths();
    expect(
      fontPaths.length,
      "at least one local /fonts/*.woff2 request must have been observed",
    ).toBeGreaterThan(0);
    expect(
      fontPaths,
      "every declared local font must have been requested from this origin",
    ).toEqual(EXPECTED_FONT_URLS);

    for (const record of audit.fontResponses) {
      expect(record.path, "font requests must use the /fonts/*.woff2 path shape").toMatch(
        LOCAL_FONT_PATH,
      );
      expect(record.status, `${record.path} responded ${record.status}`).toBe(200);
      expect(
        record.contentType,
        `${record.path} served as ${JSON.stringify(record.contentType)}`,
      ).toMatch(WOFF2_MEDIA_TYPE);
    }
    expect(
      [...new Set(audit.fontResponses.map((record) => record.path))].sort(),
      "a successful response must have been observed for every declared font",
    ).toEqual(EXPECTED_FONT_URLS);

    // ----------------------------------------------------------------
    // 3. The declared face matrix is discrete, and 750 resolves onto it.
    // ----------------------------------------------------------------

    const faceMatrix = await page.evaluate(() => {
      const faces: Array<{ family: string; weight: string; style: string }> = [];
      document.fonts.forEach((face) => {
        faces.push({ family: face.family, weight: face.weight, style: face.style });
      });
      return faces;
    });

    expect(faceMatrix.length, "the declared face matrix must not be empty").toBe(20);
    const rangedWeights = faceMatrix.filter(
      (face) => !/^(400|500|600|700)$/.test(face.weight.trim()),
    );
    expect(
      rangedWeights,
      "every declared face must carry a single canonical weight; a ranged descriptor " +
        "would let the 650 and 750 rules instantiate variable instances instead of " +
        "resolving onto the discrete 700 face",
    ).toEqual([]);

    // ----------------------------------------------------------------
    // 4. Real rendered elements compute to the intended families.
    // ----------------------------------------------------------------

    const monoElement = confirmed.locator(".font-mono").first();
    await expect(
      monoElement,
      "the landing verdict card must render a monospace/code role element",
    ).toBeVisible();

    const eyebrow = confirmed.locator(".az-eyebrow").first();
    await expect(
      eyebrow,
      "the landing verdict card must render an eyebrow, which is the 750-weight rule",
    ).toBeVisible();

    const bodyFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );
    expect(bodyFamily, "the body/UI role must request Inter").toContain("Inter");

    const displayFamily = await heading.evaluate(
      (element) => getComputedStyle(element).fontFamily,
    );
    expect(
      displayFamily,
      "the display-heading role must request Space Grotesk",
    ).toContain("Space Grotesk");

    const monoFamily = await monoElement.evaluate(
      (element) => getComputedStyle(element).fontFamily,
    );
    expect(
      monoFamily,
      "the numeric/code role must request JetBrains Mono",
    ).toContain("JetBrains Mono");

    // ----------------------------------------------------------------
    // 5. The 750 rule computes as written, and is not faked.
    // ----------------------------------------------------------------

    const eyebrowStyle = await eyebrow.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontWeight: style.fontWeight,
        fontFamily: style.fontFamily,
        synthesisWeight:
          style.getPropertyValue("font-synthesis-weight") ||
          style.getPropertyValue("font-synthesis"),
        resolves700: document.fonts.check('750 11px "Inter"'),
      };
    });

    /*
     * The CSS request must survive as written — 750, not clamped or rewritten —
     * while the faces it can match remain the discrete set asserted above. That
     * pairing is the whole of F1's descriptor contract: `.az-eyebrow` asks for
     * 750, no face declares 750, and the browser therefore resolves it onto the
     * loaded discrete 700 face rather than instantiating a 750 variable cut.
     */
    expect(
      eyebrowStyle.fontWeight,
      "the 750 rule must compute to its requested CSS weight",
    ).toBe("750");
    expect(eyebrowStyle.fontFamily, "the eyebrow inherits the Inter body stack").toContain(
      "Inter",
    );
    expect(
      eyebrowStyle.resolves700,
      "750 must resolve onto a loaded discrete face, not a missing one",
    ).toBe(true);
    /*
     * `font-synthesis: none` is what stops this being circular. With synthesis
     * on, a browser that could not load the 700 face would embolden the 400 one
     * and every assertion above would still pass while the pixels were wrong.
     * With it off, an unloadable face renders at the weight it really has.
     */
    expect(
      eyebrowStyle.synthesisWeight.trim(),
      "font synthesis must be off, so no fabricated weight can stand in for a real face",
    ).toBe("none");

    // ----------------------------------------------------------------
    // 6. Nothing left this origin.
    // ----------------------------------------------------------------

    assertRequestPolicy(audit, "font loading");
    expect(
      audit.byCategory("localFont").length,
      "the local font route must have been exercised",
    ).toBeGreaterThan(0);

    /*
     * Emit the evidence, not just the verdict. Everything above is asserted, so
     * the run already fails if any of it is wrong — but a reviewer auditing
     * this control needs to read the actual served table, the actual resolved
     * families and the actual request sets rather than infer them from a green
     * tick.
     */
    reportRequestAudit(audit, "font loading");
    console.log(
      `[font-evidence] ${JSON.stringify(
        {
          served: served.map((entry) => ({
            url: entry.url,
            status: entry.status,
            contentType: entry.contentType,
            bytes: entry.bytes,
            sha256Matches:
              entry.sha256 ===
              EXPECTED_FONTS.find((font) => font.url === entry.url)?.sha256,
          })),
          fontsLoadChecks: loadResults.map((entry) => ({
            face: `${entry.weight} ${entry.family}`,
            subsetProbe: entry.probe === LATIN_PROBE ? "latin" : "latin-ext",
            loadedFaces: entry.loaded,
            check: entry.check,
          })),
          declaredFaceCount: faceMatrix.length,
          declaredWeights: [
            ...new Set(faceMatrix.map((face) => face.weight)),
          ].sort(),
          computedFamilies: {
            "body/UI": bodyFamily,
            "display-heading": displayFamily,
            "numeric/code": monoFamily,
          },
          weight750Rule: eyebrowStyle,
        },
        null,
        0,
      )}`,
    );
  });
});
