import type { FullConfig } from "@playwright/test";

import {
  ACCEPT_BASELINES_ENV,
  assertSnapshotPolicy,
} from "./snapshotPolicy";

/*
 * Playwright global setup. It runs once, before any test worker is spawned, and
 * receives the fully resolved `FullConfig` — so `config.updateSnapshots` here is
 * the *effective* mode after command-line overrides, not the value written in
 * `playwright.config.ts`. That is what makes this the only place a bare `-u`
 * can be refused; see `./snapshotPolicy.ts` for the full reasoning and the
 * decision table.
 *
 * Throwing here aborts the run before a single screenshot is taken, so a
 * refused run cannot deposit a baseline.
 */
export default function globalSetup(config: FullConfig): void {
  const reason = assertSnapshotPolicy({
    updateSnapshots: config.updateSnapshots,
    acceptBaselines: process.env[ACCEPT_BASELINES_ENV],
    platform: process.platform,
  });

  console.log(reason);
}
