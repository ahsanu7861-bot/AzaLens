import { readFile } from "node:fs/promises";

/*
  Static guard for the Content Security Policy declared in vercel.json.

  The policy is deliberately Report-Only for now. It must not be promoted to an
  enforcing Content-Security-Policy header until a real deploy has been observed
  with zero violations — cmdk and lightweight-charts are third-party and cannot
  be proven style-injection-free by reading our own source.

  Supabase origins: vercel.json is one static file serving both Preview and
  Production deployments, and its headers cannot vary by environment. Preview
  builds talk to the development project and Production talks to the production
  project, so the shared policy must name BOTH exact origins. Both are ours.

  This is deliberately not solved with edge middleware or generated headers -
  varying a static header by environment is a lot of deployment machinery to
  avoid listing two hostnames we own.

  A wildcard would be the lazy alternative and is rejected below: *.supabase.co
  would authorise every Supabase project on the internet, including an
  attacker's, which is precisely what connect-src exists to prevent.
*/

// Exact, owned project origins. Public identifiers, not secrets.
const REQUIRED_SUPABASE_ORIGINS = [
  "https://jexphwidcfbgxpthgwum.supabase.co",
  "https://xhxlgalaytuqdnmmwypv.supabase.co",
];

const REQUIRED_DIRECTIVES = [
  "default-src",
  "script-src",
  "style-src",
  "font-src",
  "img-src",
  "connect-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
];

const FORBIDDEN_KEYWORDS = [
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'unsafe-hashes'",
];

const REQUIRED_SOURCES = {
  "connect-src": ["'self'", "https://api.azalens.com"],
  "style-src": ["'self'"],
  "font-src": ["'self'"],
  "script-src": ["'self'"],
};

// Fonts are self-hosted from public/fonts. These hosts must not reappear in a
// production font-loading surface: any reappearance means a face is being
// fetched from Google again, which reintroduces the third-party dependency and
// the network variability that offline visual verification exists to remove.
const FORBIDDEN_FONT_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// Directives that exist to load styles and fonts. Unrelated directives are not
// searched for these hosts, so an unrelated future allowance is not misread.
const FONT_LOADING_DIRECTIVES = ["style-src", "font-src"];

const failures = [];

const vercelConfig = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

const html = await readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);

// ------------------------------------------------------------------
// 1. index.html must contain no inline event handlers.
// ------------------------------------------------------------------
// A CSP cannot allow these without 'unsafe-hashes', which would relax
// script-src for the whole site. The deferred Google Fonts stylesheet used to
// rely on onload="this.media='all'"; fonts are now self-hosted and declared
// statically in src/fonts.css, so nothing needs activating at all.

const inlineHandlers = [
  ...html.matchAll(/\son([a-z]+)\s*=\s*["'][^"']*["']/gi),
].map((match) => match[0].trim());

if (inlineHandlers.length > 0) {
  failures.push(
    `index.html contains ${inlineHandlers.length} inline event handler(s), ` +
      `which CSP blocks without 'unsafe-hashes': ${inlineHandlers.join(", ")}`,
  );
}

// ------------------------------------------------------------------
// 1b. index.html must not reach a Google Fonts host.
// ------------------------------------------------------------------
// Fonts are self-hosted by src/fonts.css. There is no deferred stylesheet to
// activate any more and no scriptless fallback to keep in sync, so the old
// data-deferred-font contract is gone. What replaces it is the absence of the
// hosts: a preconnect, preload, stylesheet link or fallback pointing at Google
// would quietly restore the third-party font fetch.

for (const host of FORBIDDEN_FONT_HOSTS) {
  if (html.includes(host)) {
    failures.push(
      `index.html references ${host}. Fonts are self-hosted from ` +
        "public/fonts via src/fonts.css; no Google Fonts host belongs in the " +
        "production document. Run `npm run test:fonts` for the full contract.",
    );
  }
}

if (/\sdata-deferred-font\b/.test(html)) {
  failures.push(
    "index.html still carries a data-deferred-font link. The deferred Google " +
      "Fonts loader (src/lib/fonts.ts) was removed when fonts became " +
      "self-hosted; nothing activates that attribute any more.",
  );
}

// ------------------------------------------------------------------
// 2. The header must be present, and Report-Only.
// ------------------------------------------------------------------

const headerRules = vercelConfig.headers ?? [];
const allHeaders = headerRules.flatMap((rule) => rule.headers ?? []);

const reportOnly = allHeaders.find(
  (header) =>
    header.key.toLowerCase() === "content-security-policy-report-only",
);

const enforcing = allHeaders.find(
  (header) => header.key.toLowerCase() === "content-security-policy",
);

if (!reportOnly) {
  failures.push(
    "vercel.json declares no Content-Security-Policy-Report-Only header.",
  );
}

if (enforcing) {
  failures.push(
    "vercel.json declares an enforcing Content-Security-Policy header. " +
      "Promotion from Report-Only is a reviewed decision: it requires a " +
      "deploy observed with zero violations first. Update this check when " +
      "that review happens.",
  );
}

// ------------------------------------------------------------------
// 3. Policy contents.
// ------------------------------------------------------------------

if (reportOnly) {
  const policy = reportOnly.value;

  const directives = new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name.toLowerCase(), sources];
      }),
  );

  for (const directive of REQUIRED_DIRECTIVES) {
    if (!directives.has(directive)) {
      failures.push(`CSP is missing the ${directive} directive.`);
    }
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (policy.includes(keyword)) {
      failures.push(
        `CSP contains ${keyword}, which defeats the protection this policy ` +
          "exists to provide.",
      );
    }
  }

  for (const [directive, required] of Object.entries(REQUIRED_SOURCES)) {
    const sources = directives.get(directive) ?? [];
    for (const source of required) {
      if (!sources.includes(source)) {
        failures.push(`CSP ${directive} is missing ${source}.`);
      }
    }
  }

  // The production API origin is the one that breaks every screen if dropped.
  if (!(directives.get("connect-src") ?? []).includes("https://api.azalens.com")) {
    failures.push(
      "CSP connect-src no longer allows https://api.azalens.com — every API " +
        "call from the browser would be blocked.",
    );
  }

  for (const directive of FONT_LOADING_DIRECTIVES) {
    const sources = directives.get(directive) ?? [];
    for (const host of FORBIDDEN_FONT_HOSTS) {
      if (sources.some((source) => source.includes(host))) {
        failures.push(
          `CSP ${directive} still allows ${host}. Fonts are self-hosted; ` +
            "leaving the host allowed means a reintroduced Google font fetch " +
            "would load silently instead of being reported as a violation.",
        );
      }
    }
  }

  if ((directives.get("object-src") ?? [])[0] !== "'none'") {
    failures.push("CSP object-src must be 'none'.");
  }

  if ((directives.get("frame-ancestors") ?? [])[0] !== "'none'") {
    failures.push("CSP frame-ancestors must be 'none'.");
  }

  // script-src must pin the inline theme bootstrap by hash, never by keyword.
  const scriptSources = directives.get("script-src") ?? [];
  if (!scriptSources.some((source) => source.startsWith("'sha256-"))) {
    failures.push(
      "CSP script-src carries no sha256 hash. The inline theme script in " +
        "index.html would be blocked and every page would flash the wrong theme.",
    );
  }

  // ----------------------------------------------------------------
  // Supabase origins: hard assertions, no longer an advisory note.
  // ----------------------------------------------------------------

  const connectSources = directives.get("connect-src") ?? [];
  const supabaseSources = [...directives.values()]
    .flat()
    .filter((source) => source.includes("supabase"));

  for (const required of REQUIRED_SUPABASE_ORIGINS) {
    if (!connectSources.includes(required)) {
      failures.push(
        `CSP connect-src is missing the Supabase origin ${required}. ` +
          "The shared static policy serves both Preview and Production, so " +
          "both owned project origins must be present or login breaks in one " +
          "of them — and the symptom looks like an auth bug, not a CSP one.",
      );
    }
  }

  for (const source of supabaseSources) {
    if (source.includes("*")) {
      failures.push(
        `CSP contains a wildcard Supabase origin (${source}). A wildcard ` +
          "authorises every Supabase project on the internet, including an " +
          "attacker's. Name the exact origins instead.",
      );
    }

    if (
      source.includes("<") ||
      source.includes(">") ||
      source.toUpperCase().includes("PROJECT-REF") ||
      source.toUpperCase().includes("PROJECT_REF")
    ) {
      failures.push(
        `CSP contains a placeholder Supabase origin (${source}). ` +
          "Use the exact https://<ref>.supabase.co origins, never a template.",
      );
    }

    if (!REQUIRED_SUPABASE_ORIGINS.includes(source)) {
      failures.push(
        `CSP names an unrecognised Supabase origin (${source}). Only the two ` +
          "AzaLens project origins belong here.",
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Content Security Policy check failed:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("[csp] Policy check passed.");
