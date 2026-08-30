import { describe, expect, it } from "vitest";

import {
  ACCEPT_BASELINES_ENV,
  ACCEPT_BASELINES_VALUE,
  ACCEPTANCE_PLATFORM,
  evaluateSnapshotPolicy,
  invalidOptInError,
  optInWithoutWriteModeError,
  SNAPSHOT_UPDATE_MODES,
  unauthorisedWriteError,
  unknownModeError,
  wrongPlatformError,
} from "../../e2e/snapshotPolicy";

/*
 * ============================================================================
 * Snapshot acceptance policy contract.
 *
 * This suite is pure: it imports one function that touches no filesystem, no
 * Playwright runtime and no browser, so it can enumerate every branch of the
 * guard — including the ones that would otherwise require a Linux host or a
 * deliberately destructive `--update-snapshots` run — without any chance of
 * creating or modifying an accepted baseline.
 *
 * It lives beside `visualFixtureContract.test.ts`, which is the established
 * home for vitest suites about the Playwright layer: `vite.config.ts` excludes
 * `e2e/**` from test discovery, so a suite placed under `e2e/` would never run.
 * ============================================================================
 */

const DARWIN = "darwin";
const LINUX = ACCEPTANCE_PLATFORM;
const OPT_IN = ACCEPT_BASELINES_VALUE;

const WRITING_MODES = SNAPSHOT_UPDATE_MODES.filter((mode) => mode !== "none");

describe("evaluateSnapshotPolicy", () => {
  describe("ordinary verification is always allowed", () => {
    it("allows none + no opt-in on Darwin", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "none",
          acceptBaselines: undefined,
          platform: DARWIN,
        }),
      ).toEqual({ allowed: true, reason: expect.any(String) });
    });

    it("allows none + no opt-in on Linux", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "none",
          acceptBaselines: undefined,
          platform: LINUX,
        }),
      ).toEqual({ allowed: true, reason: expect.any(String) });
    });

    it("treats an explicitly empty opt-in as absent, not as authorisation", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "none",
          acceptBaselines: "",
          platform: LINUX,
        }).allowed,
      ).toBe(true);

      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "changed",
          acceptBaselines: "",
          platform: LINUX,
        }),
      ).toEqual({ allowed: false, error: unauthorisedWriteError("changed") });
    });
  });

  describe("a write mode without the opt-in is refused everywhere", () => {
    it("rejects changed + no opt-in on Darwin", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "changed",
          acceptBaselines: undefined,
          platform: DARWIN,
        }),
      ).toEqual({ allowed: false, error: unauthorisedWriteError("changed") });
    });

    it("rejects changed + no opt-in on Linux", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "changed",
          acceptBaselines: undefined,
          platform: LINUX,
        }),
      ).toEqual({ allowed: false, error: unauthorisedWriteError("changed") });
    });

    /*
     * `-u` resolves to "changed", but the config default Playwright would fall
     * back to is "missing", and `--update-snapshots=all` is equally destructive.
     * Every writing mode must be refused, not just the one the CLI presets.
     */
    it.each(WRITING_MODES)("rejects %s + no opt-in", (mode) => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: mode,
          acceptBaselines: undefined,
          platform: LINUX,
        }),
      ).toEqual({ allowed: false, error: unauthorisedWriteError(mode) });
    });
  });

  describe("the opt-in is Linux-only", () => {
    it("rejects changed + opt-in on Darwin", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "changed",
          acceptBaselines: OPT_IN,
          platform: DARWIN,
        }),
      ).toEqual({ allowed: false, error: wrongPlatformError(DARWIN) });
    });

    it("rejects changed + opt-in on win32", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "changed",
          acceptBaselines: OPT_IN,
          platform: "win32",
        }),
      ).toEqual({ allowed: false, error: wrongPlatformError("win32") });
    });

    it("allows changed + opt-in on Linux", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "changed",
          acceptBaselines: OPT_IN,
          platform: LINUX,
        }),
      ).toEqual({ allowed: true, reason: expect.any(String) });
    });
  });

  it("rejects none + opt-in on Linux as an operator error", () => {
    expect(
      evaluateSnapshotPolicy({
        updateSnapshots: "none",
        acceptBaselines: OPT_IN,
        platform: LINUX,
      }),
    ).toEqual({ allowed: false, error: optInWithoutWriteModeError() });
  });

  describe("only the exact opt-in value authorises", () => {
    it.each(["0", "true", "TRUE", "yes", " ", " 1", "1 ", "01", "11", "none"])(
      "rejects opt-in %j",
      (value) => {
        expect(
          evaluateSnapshotPolicy({
            updateSnapshots: "changed",
            acceptBaselines: value,
            platform: LINUX,
          }),
        ).toEqual({ allowed: false, error: invalidOptInError(value) });
      },
    );

    it("rejects an invalid opt-in even in verification mode", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "none",
          acceptBaselines: "true",
          platform: LINUX,
        }),
      ).toEqual({ allowed: false, error: invalidOptInError("true") });
    });
  });

  describe("unknown modes fail closed", () => {
    it.each(["", "NONE", "update", "all ", "missing,changed"])(
      "rejects unexpected update mode %j",
      (mode) => {
        expect(
          evaluateSnapshotPolicy({
            updateSnapshots: mode,
            acceptBaselines: undefined,
            platform: LINUX,
          }),
        ).toEqual({ allowed: false, error: unknownModeError(mode) });
      },
    );

    it("rejects an unknown mode even with a valid Linux opt-in", () => {
      expect(
        evaluateSnapshotPolicy({
          updateSnapshots: "rewrite",
          acceptBaselines: OPT_IN,
          platform: LINUX,
        }),
      ).toEqual({ allowed: false, error: unknownModeError("rewrite") });
    });
  });

  describe("error messages are specific enough to act on", () => {
    it("names the opt-in variable and the Linux rule when refusing Darwin", () => {
      const decision = evaluateSnapshotPolicy({
        updateSnapshots: "changed",
        acceptBaselines: OPT_IN,
        platform: DARWIN,
      });

      expect(decision.allowed).toBe(false);
      const error = decision.allowed ? "" : decision.error;
      expect(error).toContain(ACCEPT_BASELINES_ENV);
      expect(error).toContain(ACCEPTANCE_PLATFORM);
      expect(error).toContain(DARWIN);
    });

    it("states that CI=1 is not authorisation when refusing a bare -u", () => {
      const decision = evaluateSnapshotPolicy({
        updateSnapshots: "changed",
        acceptBaselines: undefined,
        platform: LINUX,
      });

      expect(decision.allowed).toBe(false);
      const error = decision.allowed ? "" : decision.error;
      expect(error).toContain("CI=1");
      expect(error).toContain("test:visual:accept-linux");
    });
  });
});
