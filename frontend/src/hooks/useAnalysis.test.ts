import { describe, expect, it } from "vitest";

import {
  ANALYSIS_GC_TIME_MS,
  ANALYSIS_STALE_TIME_MS,
} from "./useAnalysis";

describe("analysis query cache policy", () => {
  it("keeps verified analysis fresh briefly without retaining it indefinitely", () => {
    expect(ANALYSIS_STALE_TIME_MS).toBe(60_000);
    expect(ANALYSIS_GC_TIME_MS).toBe(15 * 60_000);
    expect(ANALYSIS_GC_TIME_MS).toBeGreaterThan(
      ANALYSIS_STALE_TIME_MS,
    );
  });
});
