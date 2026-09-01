import type { FullConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";

import {
  ACCEPT_BASELINES_ENV,
  assertSnapshotPolicy,
} from "./snapshotPolicy";

/**
 * Environment variable carrying the candidate run identity from the Playwright
 * parent process into every worker it forks.
 *
 * Workers are forked with `env: { ...process.env, ...extraEnv }` read at fork
 * time (playwright 1.62, `lib/runner/index.js`), and global setup completes
 * before the first worker is spawned. Assigning here is therefore the only
 * point in this architecture where one value can reach every worker — and every
 * retry, including a retry that runs in a freshly spawned worker.
 */
export const CANDIDATE_RUN_ID_ENV = "AZALENS_CANDIDATE_RUN_ID";

/**
 * The only shape a candidate run ID may take: one filesystem-safe path
 * component. Readers re-validate against this before building any path, so a
 * value injected around this module cannot widen it.
 */
export const CANDIDATE_RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/*
 * Millisecond timestamp for human ordering, plus 96 bits of randomness for
 * uniqueness. The random half is what makes two invocations of the *same
 * commit* land in different directories, which is the property the whole
 * isolation fix rests on. Deliberately not derived from the commit SHA, the
 * PID, the parent PID, GITHUB_RUN_ID or GITHUB_RUN_ATTEMPT: a commit SHA is
 * identical across re-runs of one commit, PIDs are recycled by the OS, and the
 * two GitHub values are shared by every Playwright invocation inside one job.
 */
function createCandidateRunId(): string {
  return `run-${Date.now().toString(36)}-${randomBytes(12).toString("hex")}`;
}

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
 *
 * Order is load-bearing. `assertSnapshotPolicy` throws on refusal, so it is
 * called *first* and the candidate run ID is created only on the path where it
 * returned. A refused invocation therefore never receives a run ID and never
 * logs one, and no candidate directory is named after a run that was not
 * allowed to start.
 */
export default function globalSetup(config: FullConfig): void {
  const reason = assertSnapshotPolicy({
    updateSnapshots: config.updateSnapshots,
    acceptBaselines: process.env[ACCEPT_BASELINES_ENV],
    platform: process.platform,
  });

  console.log(reason);

  const runId = createCandidateRunId();
  process.env[CANDIDATE_RUN_ID_ENV] = runId;
  console.log(`AzaLens candidate run: ${CANDIDATE_RUN_ID_ENV}=${runId}`);
}
