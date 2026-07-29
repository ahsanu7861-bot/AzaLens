"use strict";

// ============================================================
// Rate-limit path matching.
//
// Deliberately does NOT decodeURIComponent anything: req.path is
// already the raw, undecoded pathname (Express/parseurl strips the
// query string but leaves percent-encoding untouched), and that is
// also what Express's own router matches against. Mirroring that
// exact behavior - rather than normalizing further - is what keeps
// this exemption check aligned with which requests actually reach
// the /api/analyze/:symbol, /api/explanation/:symbol, and
// /api/portfolio/intelligence handlers. Decoding here would let an
// encoded separator (e.g. "%2f") widen the exemption to paths the
// real router would never match, or throw on a malformed sequence.
// ============================================================

const OPERATIONAL_PATHS = new Set([
  "/health",
  "/health/live",
  "/health/ready",
  "/ops/metrics",
]);

const ANALYZE_PATTERN = /^\/api\/analyze\/[^/]+$/;
const EXPLANATION_PATTERN = /^\/api\/explanation\/[^/]+$/;
const PORTFOLIO_INTELLIGENCE_PATH = "/api/portfolio/intelligence";

function toRawPathname(input) {
  if (typeof input === "string") {
    return input;
  }

  if (input && typeof input === "object") {
    if (typeof input.path === "string") {
      return input.path;
    }

    if (typeof input.url === "string") {
      return input.url;
    }
  }

  return "";
}

function stripQueryString(pathname) {
  const queryIndex = pathname.indexOf("?");

  return queryIndex === -1
    ? pathname
    : pathname.slice(0, queryIndex);
}

function normalizePathname(input) {
  const raw = stripQueryString(
    toRawPathname(input)
  );

  if (typeof raw !== "string" || raw.length === 0) {
    return "/";
  }

  const lowered = raw.toLowerCase();

  if (lowered === "/") {
    return "/";
  }

  const withoutTrailingSlashes = lowered.replace(
    /\/+$/,
    ""
  );

  return withoutTrailingSlashes === ""
    ? "/"
    : withoutTrailingSlashes;
}

function isGlobalLimiterExempt(input) {
  const pathname = normalizePathname(input);

  if (OPERATIONAL_PATHS.has(pathname)) {
    return true;
  }

  if (ANALYZE_PATTERN.test(pathname)) {
    return true;
  }

  if (EXPLANATION_PATTERN.test(pathname)) {
    return true;
  }

  if (pathname === PORTFOLIO_INTELLIGENCE_PATH) {
    return true;
  }

  return false;
}

module.exports = {
  normalizePathname,
  isGlobalLimiterExempt,
};
