import { expect, type Page, type Request, type Response } from "@playwright/test";

/*
 * Fail-closed browser request policy, shared by every spec that renders the
 * application.
 *
 * Why a shared module rather than three per-spec allowlists: before F2 there
 * were three, they disagreed, and two of them had rotted.
 * `landing-visual.spec.ts` and `scripts/captureLandingCandidates.mjs` both
 * carried a `FONT_HOSTS` allowlist that permitted fonts.googleapis.com and
 * fonts.gstatic.com, with a comment explaining that index.html loaded the
 * Google Fonts stylesheet — which stopped being true when F1 vendored the
 * faces. `methodology-visual.spec.ts` blocked a short list of provider
 * patterns and then `route.continue()`d everything else, so it permitted any
 * host nobody had thought of. `visual.spec.ts`, which covers 14 of the 24
 * accepted comparisons, enforced nothing at all.
 *
 * The policy here is deliberately the inverse shape: every request must match
 * a category that was decided in advance, and anything that matches no
 * category is forbidden. New third parties therefore fail the run rather than
 * being silently permitted, and an allowlist can never be grown by reading it
 * off a failing run.
 *
 * Enforcement is split from observation on purpose:
 *
 *   - `page.on("request")` sees EVERY request the page makes, including ones a
 *     fixture route fulfils, so the audit is complete.
 *   - `page.route("**\/*")` is the enforcement fallback. Playwright matches
 *     routes in reverse registration order, so a spec must install this policy
 *     BEFORE it installs its fixture routes; the fixture routes then win and
 *     this handler only ever sees traffic nobody deliberately mocked.
 *
 * Neither half is trusted to have run. An empty forbidden list proves nothing
 * on its own — it is exactly what a policy that never installed would produce.
 * `assertRequestPolicy` therefore asserts positive sentinels first: the
 * observer is installed, the route handler executed, requests were observed,
 * and a same-origin document request was among them.
 */

/** Hosts Playwright's `baseURL` and the Vite dev server may legitimately use. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** The two font hosts F1 removed. Their reappearance is a specific regression. */
export const GOOGLE_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/**
 * Market-data, screening and registry hosts a browser test must never reach.
 * Kept as substring patterns because several are reached through per-account
 * subdomains rather than one fixed origin.
 */
export const PROVIDER_PATTERNS: RegExp[] = [
  /finnhub/i,
  /twelvedata/i,
  /twelve-data/i,
  /alphavantage/i,
  /alpha-vantage/i,
  /yahoo/i,
  /yfinance/i,
  /halalterminal/i,
  /halal-terminal/i,
  /musaffa/i,
  /polygon\.io/i,
  /registry\.npmjs\.org/i,
  /api\.azalens\.com/i,
];

/**
 * Path shapes that are application or provider endpoints wherever they are
 * served from. An undeclared request to one of these is treated as provider
 * traffic even when it is same-origin: on a developer machine
 * `VITE_API_BASE_URL` points the same calls at a local backend, and a visual
 * or font run must not reach a backend either way.
 */
const API_PATH = /^\/(api|auth|history)(\/|$)/;

/** The only local path shape a font may be served from. */
export const LOCAL_FONT_PATH = /^\/fonts\/[A-Za-z0-9._-]+\.woff2$/;

export type RequestCategory =
  /* allowed */
  | "inert"
  | "fixture"
  | "localFont"
  | "local"
  /* forbidden */
  | "googleFonts"
  | "provider"
  | "external";

const ALLOWED: ReadonlySet<RequestCategory> = new Set<RequestCategory>([
  "inert",
  "fixture",
  "localFont",
  "local",
]);

export type RequestRecord = {
  url: string;
  method: string;
  resourceType: string;
  category: RequestCategory;
};

export type FontResponseRecord = {
  url: string;
  path: string;
  status: number;
  contentType: string;
};

export type RequestAudit = {
  /** Sentinel: the observer and the route fallback were both installed. */
  installed: boolean;
  /** Sentinel: the route fallback actually executed at least once. */
  routeHandlerRuns: number;
  /** Every request the page made, classified. */
  records: RequestRecord[];
  /** Requests the route fallback refused and aborted. */
  refused: RequestRecord[];
  /** Every response to a local `/fonts/*.woff2` request. */
  fontResponses: FontResponseRecord[];
  byCategory(category: RequestCategory): string[];
  documentRequests(): RequestRecord[];
  localFontPaths(): string[];
  externalHosts(): string[];
  /** A compact, log-safe summary for the run report. */
  summary(): Record<string, unknown>;
};

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Classify one URL. Order matters and is the whole contract:
 *
 *   1. non-HTTP schemes carry no network traffic;
 *   2. a pattern the calling spec explicitly declared it fulfils;
 *   3. anything provider-shaped, by host OR by path, wherever it points;
 *   4. the two Google font hosts, called out separately from other externals
 *      so the report can answer "were there Google Fonts requests" directly;
 *   5. same-origin local traffic, with local WOFF2 split out for positive
 *      font proof;
 *   6. everything else — forbidden by default.
 */
export function classifyRequest(url: string, fixtures: RegExp[] = []): RequestCategory {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "external";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "inert";
  if (fixtures.some((pattern) => pattern.test(url))) return "fixture";
  if (API_PATH.test(parsed.pathname)) return "provider";
  if (PROVIDER_PATTERNS.some((pattern) => pattern.test(url))) return "provider";
  if (GOOGLE_FONT_HOSTS.includes(parsed.hostname)) return "googleFonts";

  if (LOCAL_HOSTS.has(parsed.hostname)) {
    return LOCAL_FONT_PATH.test(parsed.pathname) ? "localFont" : "local";
  }

  return "external";
}

function record(request: Request, fixtures: RegExp[]): RequestRecord {
  return {
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    category: classifyRequest(request.url(), fixtures),
  };
}

/**
 * Install the policy on a page.
 *
 * MUST be called before the spec installs its own fixture routes, so that the
 * fixture routes take priority over this catch-all.
 *
 * @param fixtures URL patterns the calling spec deliberately fulfils or mocks.
 *                 Declaring a pattern here is what makes such a request
 *                 allowed; nothing is inferred from a route being registered.
 */
export async function installRequestPolicy(
  page: Page,
  { fixtures = [] as RegExp[] } = {},
): Promise<RequestAudit> {
  const records: RequestRecord[] = [];
  const refused: RequestRecord[] = [];
  const fontResponses: FontResponseRecord[] = [];

  const audit: RequestAudit = {
    installed: false,
    routeHandlerRuns: 0,
    records,
    refused,
    fontResponses,
    byCategory: (category) =>
      records.filter((entry) => entry.category === category).map((entry) => entry.url),
    documentRequests: () =>
      records.filter((entry) => entry.resourceType === "document"),
    localFontPaths: () =>
      [
        ...new Set(
          records
            .filter((entry) => entry.category === "localFont")
            .map((entry) => new URL(entry.url).pathname),
        ),
      ].sort(),
    externalHosts: () =>
      [
        ...new Set(
          records
            .filter(
              (entry) =>
                entry.category === "external" ||
                entry.category === "googleFonts" ||
                entry.category === "provider",
            )
            .map((entry) => {
              try {
                return new URL(entry.url).hostname;
              } catch {
                return entry.url;
              }
            }),
        ),
      ].sort(),
    summary: () => ({
      installed: audit.installed,
      routeHandlerRuns: audit.routeHandlerRuns,
      totalRequests: records.length,
      documentRequests: audit.documentRequests().length,
      localFontPaths: audit.localFontPaths(),
      fontResponses: fontResponses.map(
        ({ path, status, contentType }) => `${path} ${status} ${contentType}`,
      ),
      fixtureRequests: audit.byCategory("fixture").length,
      googleFontRequests: audit.byCategory("googleFonts"),
      providerRequests: audit.byCategory("provider"),
      externalRequests: audit.byCategory("external"),
      refused: refused.map((entry) => `${entry.method} ${entry.url} [${entry.category}]`),
    }),
  };

  page.on("request", (request: Request) => {
    records.push(record(request, fixtures));
  });

  page.on("response", (response: Response) => {
    const url = response.url();
    if (classifyRequest(url, fixtures) !== "localFont") return;
    fontResponses.push({
      url,
      path: new URL(url).pathname,
      status: response.status(),
      contentType: response.headers()["content-type"] ?? "",
    });
  });

  await page.route("**/*", async (route) => {
    audit.routeHandlerRuns += 1;
    const entry = record(route.request(), fixtures);
    if (ALLOWED.has(entry.category)) {
      await route.continue();
      return;
    }
    refused.push(entry);
    await route.abort();
  });

  audit.installed = true;
  return audit;
}

/**
 * Emit the audit as one machine-readable line.
 *
 * Evidence that is only asserted is invisible to a reviewer reading the run
 * log: a green tick proves the forbidden sets were empty but not what the
 * allowed traffic actually was, and the sentinel counters that separate
 * "nothing forbidden happened" from "nothing happened" are exactly the numbers
 * a reviewer needs to see rather than take on trust. This prints them.
 */
export function reportRequestAudit(audit: RequestAudit, context: string): void {
  console.log(`[request-audit] ${context} ${JSON.stringify(audit.summary())}`);
}

/**
 * Assert the policy held — and, first, that it ran at all.
 *
 * The sentinels are not ceremony. `refused`, `providerRequests` and
 * `googleFontRequests` are all empty on a page that never loaded, on a page
 * whose route was registered after a fixture swallowed everything, and on a
 * policy that was never installed. Only the positive counters distinguish
 * "nothing forbidden happened" from "nothing happened".
 */
export function assertRequestPolicy(audit: RequestAudit, context: string): void {
  expect(audit.installed, `${context}: the request policy must be installed`).toBe(true);
  expect(
    audit.routeHandlerRuns,
    `${context}: the request-policy route handler never executed, so nothing was enforced`,
  ).toBeGreaterThan(0);
  expect(
    audit.records.length,
    `${context}: no browser request was observed at all`,
  ).toBeGreaterThan(0);
  expect(
    audit.documentRequests().length,
    `${context}: no document request was observed, so the page never navigated`,
  ).toBeGreaterThan(0);

  expect(
    audit.byCategory("googleFonts"),
    `${context}: fonts are self-hosted; no request may reach a Google font host`,
  ).toEqual([]);
  expect(
    audit.byCategory("provider"),
    `${context}: a browser test must never call an application or market-data endpoint`,
  ).toEqual([]);
  expect(
    audit.byCategory("external"),
    `${context}: the page must not reach any external origin`,
  ).toEqual([]);
  expect(
    audit.refused.map((entry) => `${entry.method} ${entry.url} [${entry.category}]`),
    `${context}: the request policy refused traffic that must never have been attempted`,
  ).toEqual([]);
}
