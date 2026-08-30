/*
 * ============================================================================
 * Snapshot acceptance policy.
 *
 * Pure decision logic: no Playwright, no Node globals, no filesystem. It is
 * imported by `e2e/globalSetup.ts`, which supplies the *resolved* Playwright
 * configuration, `process.env` and `process.platform`, and by a vitest suite
 * that exercises every branch without a browser or a Playwright worker.
 *
 * Why a guard exists at all. `playwright.config.ts` sets
 * `updateSnapshots: "none"`, but that is necessary and not sufficient: the
 * installed Playwright 1.62 resolves the effective mode as
 *
 *   takeFirst(configCLIOverrides.updateSnapshots, userConfig.updateSnapshots,
 *             "missing")            -- node_modules/playwright/lib/common/index.js
 *
 * so a bare `-u` on the command line (preset `"changed"`, see
 * node_modules/playwright/lib/program.js) silently outranks the config file.
 * `FullConfig.updateSnapshots` handed to `globalSetup` already reflects that
 * override, which makes global setup the first place the *effective* mode can
 * be inspected — and it runs before any test worker starts.
 *
 * The policy therefore has exactly one authorisation route: the environment
 * variable AZALENS_ACCEPT_BASELINES set to exactly "1", on Linux, together with
 * an explicit Playwright write mode. Everything else fails closed.
 * ============================================================================
 */

/** The one opt-in variable. Nothing else authorises baseline writing. */
export const ACCEPT_BASELINES_ENV = "AZALENS_ACCEPT_BASELINES";

/** The one accepted opt-in value. Compared exactly; no truthiness coercion. */
export const ACCEPT_BASELINES_VALUE = "1";

/** Accepted baselines are Linux-only; a Darwin PNG can never satisfy CI. */
export const ACCEPTANCE_PLATFORM = "linux";

/** The command that is the only supported acceptance route. */
export const ACCEPTANCE_COMMAND = "npm run test:visual:accept-linux";

/** Every mode Playwright 1.62 will resolve `updateSnapshots` to. */
export const SNAPSHOT_UPDATE_MODES = [
  "all",
  "changed",
  "missing",
  "none",
] as const;

export type SnapshotUpdateMode = (typeof SNAPSHOT_UPDATE_MODES)[number];

/** The only mode that cannot write an accepted baseline. */
export const NON_WRITING_MODE = "none";

export type SnapshotPolicyInput = {
  /** Effective `FullConfig.updateSnapshots`, i.e. after CLI overrides. */
  readonly updateSnapshots: string;
  /** Raw `process.env.AZALENS_ACCEPT_BASELINES`; `undefined` when unset. */
  readonly acceptBaselines: string | undefined;
  /** Raw `process.platform`. */
  readonly platform: string;
};

export type SnapshotPolicyDecision =
  | { readonly allowed: true; readonly reason: string }
  | { readonly allowed: false; readonly error: string };

const PREFIX = "AzaLens snapshot guard: refusing to run — ";

const KNOWN_MODES_TEXT = SNAPSHOT_UPDATE_MODES.map(
  (mode) => `"${mode}"`,
).join(", ");

export function unknownModeError(updateSnapshots: string): string {
  return (
    `${PREFIX}the resolved updateSnapshots value ${JSON.stringify(updateSnapshots)} ` +
    `is not one of ${KNOWN_MODES_TEXT}. An unrecognised mode cannot be proven ` +
    `non-writing, so the run fails closed.`
  );
}

export function invalidOptInError(acceptBaselines: string): string {
  return (
    `${PREFIX}${ACCEPT_BASELINES_ENV} is set to ${JSON.stringify(acceptBaselines)}, ` +
    `which is not the exact value "${ACCEPT_BASELINES_VALUE}". Only the exact ` +
    `value "${ACCEPT_BASELINES_VALUE}" authorises baseline acceptance; no other ` +
    `value is treated as authorisation.`
  );
}

export function wrongPlatformError(platform: string): string {
  return (
    `${PREFIX}${ACCEPT_BASELINES_ENV}=${ACCEPT_BASELINES_VALUE} was supplied on ` +
    `platform ${JSON.stringify(platform)}, but accepted baselines must be ` +
    `generated on "${ACCEPTANCE_PLATFORM}". A macOS/Darwin baseline can never ` +
    `satisfy Linux CI, so this is refused even when a write mode is requested ` +
    `on the command line.`
  );
}

export function optInWithoutWriteModeError(): string {
  return (
    `${PREFIX}${ACCEPT_BASELINES_ENV}=${ACCEPT_BASELINES_VALUE} was supplied but ` +
    `the resolved updateSnapshots is "${NON_WRITING_MODE}", so nothing would be ` +
    `written. Pass an explicit write mode such as --update-snapshots=changed, or ` +
    `drop the opt-in.`
  );
}

export function unauthorisedWriteError(updateSnapshots: string): string {
  return (
    `${PREFIX}the resolved updateSnapshots is ${JSON.stringify(updateSnapshots)}, ` +
    `which writes accepted baselines, but ${ACCEPT_BASELINES_ENV}=` +
    `${ACCEPT_BASELINES_VALUE} was not supplied. Snapshot writing requires the ` +
    `explicit AzaLens acceptance route (${ACCEPTANCE_COMMAND}, Linux only). ` +
    `Neither --update-snapshots on its own nor CI=1 is an authorisation ` +
    `mechanism.`
  );
}

export function verificationAllowedReason(): string {
  return (
    `AzaLens snapshot guard: verification mode — resolved updateSnapshots is ` +
    `"${NON_WRITING_MODE}" and ${ACCEPT_BASELINES_ENV} is unset. No accepted ` +
    `baseline can be written.`
  );
}

export function acceptanceAllowedReason(updateSnapshots: string): string {
  return (
    `AzaLens snapshot guard: acceptance route — ${ACCEPT_BASELINES_ENV}=` +
    `${ACCEPT_BASELINES_VALUE} on "${ACCEPTANCE_PLATFORM}" with resolved ` +
    `updateSnapshots ${JSON.stringify(updateSnapshots)}. Baseline writing is ` +
    `deliberately enabled for this run.`
  );
}

function isKnownMode(value: string): value is SnapshotUpdateMode {
  return (SNAPSHOT_UPDATE_MODES as readonly string[]).includes(value);
}

/**
 * Decide whether a Playwright run may start, given the effective snapshot mode,
 * the raw opt-in value and the platform. Total and side-effect free.
 */
export function evaluateSnapshotPolicy(
  input: SnapshotPolicyInput,
): SnapshotPolicyDecision {
  const { updateSnapshots, acceptBaselines, platform } = input;

  // 7. Fail closed on anything we cannot classify.
  if (!isKnownMode(updateSnapshots)) {
    return { allowed: false, error: unknownModeError(updateSnapshots) };
  }

  /*
   * An unset variable and an explicitly empty one are both "absent". An empty
   * value can never authorise writing under either reading, so folding the two
   * together is not a hole: it only decides which refusal an operator sees, and
   * it keeps ordinary verification working in environments that export the name
   * with no value. Every *non-empty* value other than "1" is invalid.
   */
  const optIn = acceptBaselines ?? "";

  if (optIn === "") {
    // 1. Ordinary verification: non-writing and unauthorised, which is correct.
    if (updateSnapshots === NON_WRITING_MODE) {
      return { allowed: true, reason: verificationAllowedReason() };
    }
    // 2. A write mode reached us without the opt-in — the CLI-override hole.
    return { allowed: false, error: unauthorisedWriteError(updateSnapshots) };
  }

  // 5. Present but not exactly "1": invalid configuration, never authorisation.
  if (optIn !== ACCEPT_BASELINES_VALUE) {
    return { allowed: false, error: invalidOptInError(optIn) };
  }

  // 3. Opt-in on a non-Linux host is refused regardless of the write mode.
  if (platform !== ACCEPTANCE_PLATFORM) {
    return { allowed: false, error: wrongPlatformError(platform) };
  }

  // 4. Opt-in with no write mode is an operator error, not a silent no-op.
  if (updateSnapshots === NON_WRITING_MODE) {
    return { allowed: false, error: optInWithoutWriteModeError() };
  }

  // 6. The deliberate acceptance route.
  return { allowed: true, reason: acceptanceAllowedReason(updateSnapshots) };
}

/**
 * Throwing wrapper used by Playwright global setup. Returns the allow reason so
 * the caller can record which route the run took.
 */
export function assertSnapshotPolicy(input: SnapshotPolicyInput): string {
  const decision = evaluateSnapshotPolicy(input);
  if (!decision.allowed) {
    throw new Error(decision.error);
  }
  return decision.reason;
}
