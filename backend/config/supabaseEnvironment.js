"use strict";

/*
  Supabase environment rules.

  Everything here is non-secret: project references and API origins are public
  identifiers, the same way a hostname is public. No key, password, token or
  secret value is stored, logged or compared in this file.

  The point of the module is to make one class of mistake impossible: pointing a
  production deployment at the development database, or the reverse. That
  mistake is silent - the app boots, queries succeed, and the only symptom is
  that real user data and throwaway test data have quietly swapped places.

  Acceptance is never inferred from a single field. The environment name selects
  an expected project reference from the table below; the supplied SUPABASE_URL
  is parsed to discover its actual project reference; and the two must agree.
  Either alone would be trusting a value that a deploy config can get wrong.
*/

// Public project references. Not secrets.
const PROJECT_REFS = {
  development: "xhxlgalaytuqdnmmwypv",
  production: "jexphwidcfbgxpthgwum",
};

/*
  Which Supabase project each runtime environment must use.

  staging maps to the development project deliberately. Only two projects
  exist, and a staging deployment must never read or write production user
  data. If a dedicated staging project is created later, add it here - the
  cross-check will then enforce it automatically.
*/
const ENVIRONMENT_PROJECT_REF = {
  development: PROJECT_REFS.development,
  test: PROJECT_REFS.development,
  staging: PROJECT_REFS.development,
  production: PROJECT_REFS.production,
};

// Environments where Supabase configuration is mandatory rather than optional.
const ENVIRONMENTS_REQUIRING_SUPABASE = new Set(["staging", "production"]);

const SUPABASE_VARIABLES = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
];

// Supabase project references are 20 lowercase alphanumeric characters.
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

/*
  Values that look like an untouched template. A deployment that ships
  "<your-project>" is not configured, and saying so at startup is far kinder
  than a confusing failure on the first request.
*/
const PLACEHOLDER_MARKERS = [
  "<",
  ">",
  "your-",
  "your_",
  "changeme",
  "change-me",
  "placeholder",
  "example",
  "todo",
  "xxxx",
  "replace",
];

function looksLikePlaceholder(value) {
  const normalized = String(value).trim().toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

/*
  Parses a Supabase API origin and returns its project reference.

  Rejects anything that is not exactly https://<ref>.supabase.co with no path,
  query or fragment. A URL carrying a path is usually a copied Auth endpoint
  such as .../auth/v1, which would then be concatenated again when the issuer
  is derived.
*/
function parseSupabaseUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return { valid: false, reason: "is empty" };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { valid: false, reason: "is not a valid absolute URL" };
  }

  if (url.protocol !== "https:") {
    return { valid: false, reason: `must use https, not ${url.protocol}` };
  }

  if (url.search || url.hash) {
    return { valid: false, reason: "must not carry a query string or fragment" };
  }

  if (url.pathname !== "/" && url.pathname !== "") {
    return {
      valid: false,
      reason:
        `must be the bare project origin with no path (found "${url.pathname}"). ` +
        "The Auth endpoint is derived automatically",
    };
  }

  const host = url.hostname.toLowerCase();
  const suffix = ".supabase.co";

  if (!host.endsWith(suffix)) {
    return { valid: false, reason: `host must end with ${suffix}` };
  }

  const projectRef = host.slice(0, -suffix.length);

  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    return {
      valid: false,
      reason: `project reference "${projectRef}" is not 20 lowercase alphanumeric characters`,
    };
  }

  return { valid: true, projectRef, origin: url.origin };
}

/*
  The expected JWT issuer, derived from the already-validated SUPABASE_URL.

  Deliberately not configurable. §4.3 records why: an independently settable
  issuer can drift from the project it is supposed to describe, so a production
  SUPABASE_URL could be paired with a development issuer and would then accept
  development-signed tokens against production data. Deriving it makes that
  combination unrepresentable.

  Slice 2 only establishes and tests this value. Verification of real tokens is
  Slice 3.
*/
function deriveJwtIssuer(supabaseUrl) {
  const parsed = parseSupabaseUrl(supabaseUrl);

  if (!parsed.valid) {
    throw new Error(
      `Cannot derive a JWT issuer from an invalid SUPABASE_URL: it ${parsed.reason}.`
    );
  }

  return `${parsed.origin}/auth/v1`;
}

function expectedProjectRefFor(environment) {
  return ENVIRONMENT_PROJECT_REF[environment] || null;
}

/*
  Returns an array of error strings. Empty means valid.
*/
function validateSupabaseEnvironment(environment, env = process.env) {
  const errors = [];
  const required = ENVIRONMENTS_REQUIRING_SUPABASE.has(environment);
  const present = SUPABASE_VARIABLES.filter((name) =>
    String(env[name] || "").trim()
  );

  // An independently configurable issuer must not exist at all.
  if (String(env.SUPABASE_JWT_ISSUER || "").trim()) {
    errors.push(
      "SUPABASE_JWT_ISSUER must not be set. The JWT issuer is derived from " +
        "SUPABASE_URL so the two cannot drift apart - see design §4.3. Remove " +
        "the variable."
    );
  }

  if (present.length === 0) {
    if (required) {
      errors.push(
        `Missing required ${environment} Supabase configuration: ` +
          `${SUPABASE_VARIABLES.join(", ")}.`
      );
    }
    // Optional and absent in development/test: nothing further to check.
    return errors;
  }

  // Partially configured is worse than not configured - it boots and then
  // fails somewhere unrelated.
  const missing = SUPABASE_VARIABLES.filter(
    (name) => !String(env[name] || "").trim()
  );

  if (missing.length > 0) {
    errors.push(
      `Incomplete Supabase configuration: ${missing.join(", ")} ` +
        `${missing.length === 1 ? "is" : "are"} missing while others are set. ` +
        "Set all three or none."
    );
  }

  for (const name of SUPABASE_VARIABLES) {
    const value = String(env[name] || "").trim();
    if (value && looksLikePlaceholder(value)) {
      errors.push(
        `${name} still contains a template placeholder. Replace it with the real value.`
      );
    }
  }

  const url = String(env.SUPABASE_URL || "").trim();

  if (url && !looksLikePlaceholder(url)) {
    const parsed = parseSupabaseUrl(url);

    if (!parsed.valid) {
      errors.push(`SUPABASE_URL ${parsed.reason}.`);
    } else {
      const expected = expectedProjectRefFor(environment);

      if (!expected) {
        errors.push(
          `No Supabase project is mapped to environment "${environment}".`
        );
      } else if (parsed.projectRef !== expected) {
        errors.push(
          `SUPABASE_URL points at project "${parsed.projectRef}" but ` +
            `environment "${environment}" requires project "${expected}". ` +
            "Refusing to start: this is how production ends up reading the " +
            "development database, or the reverse."
        );
      }
    }
  }

  // Key shape only. No key value is compared, logged or stored.
  const publishable = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (publishable && !looksLikePlaceholder(publishable)) {
    if (publishable.startsWith("sb_secret_")) {
      errors.push(
        "SUPABASE_PUBLISHABLE_KEY holds a secret key. The publishable key is " +
          "public and the secret key must never be exposed - these are swapped."
      );
    } else if (!publishable.startsWith("sb_publishable_")) {
      errors.push(
        'SUPABASE_PUBLISHABLE_KEY must start with "sb_publishable_". Legacy ' +
          "JWT-style anon keys are not accepted."
      );
    }
  }

  const secret = String(env.SUPABASE_SECRET_KEY || "").trim();
  if (secret && !looksLikePlaceholder(secret)) {
    if (secret.startsWith("sb_publishable_")) {
      errors.push(
        "SUPABASE_SECRET_KEY holds a publishable key - these are swapped."
      );
    } else if (!secret.startsWith("sb_secret_")) {
      errors.push(
        'SUPABASE_SECRET_KEY must start with "sb_secret_". Legacy JWT-style ' +
          "service-role keys are not accepted."
      );
    }
  }

  return errors;
}

module.exports = {
  ENVIRONMENTS_REQUIRING_SUPABASE,
  ENVIRONMENT_PROJECT_REF,
  PROJECT_REFS,
  SUPABASE_VARIABLES,
  deriveJwtIssuer,
  expectedProjectRefFor,
  looksLikePlaceholder,
  parseSupabaseUrl,
  validateSupabaseEnvironment,
};
