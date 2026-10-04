import { beforeEach, describe, expect, it, vi } from "vitest";
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("./api", () => ({ api: { get, post } }));
import {
  LifecycleClientError,
  recordFinalExit,
  recordPartialExit,
  recoverLifecycle,
  tightenProtectiveStop,
} from "./personalRiskLifecycle";

const POSITION = "20000000-0000-4000-8000-000000000002";
const KEY = "30000000-0000-4000-8000-000000000003";
const exitRequest = {
  positionId: POSITION,
  brokerEffectiveAt: "2026-09-18T15:00:00Z",
  price: "120",
  quantity: "2",
  fees: "0.4",
  taxes: "0",
  exitReason: null,
};
const exitData = {
  operation: "PARTIAL_EXIT",
  eventId: "7",
  positionId: POSITION,
  openQuantity: "4.00000000",
  realizedPnl: "30.41666667",
  brokerEffectiveAt: "2026-09-18T15:00:00+00:00",
  replayed: false,
};
const stopData = {
  operation: "TIGHTEN_STOP",
  stopChangeId: "9",
  positionId: POSITION,
  priorStop: "99.00000000",
  newStop: "100.00000000",
  evidenceClass: "OWNER_DECLARED",
  direction: "TIGHTENING",
  replayed: false,
};
const ok = (data: unknown) => ({ data: { success: true, data } });
const axiosError = (status: number, body: unknown) => ({ isAxiosError: true, response: { status, data: body } });

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof LifecycleClientError) return error;
    throw error;
  }
  throw new Error("expected a LifecycleClientError");
}

describe("personal-risk lifecycle service", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it("B1 uses only the fixed endpoints, exact bodies and the canonical header", async () => {
    post.mockResolvedValueOnce(ok(exitData)).mockResolvedValueOnce(ok({ ...exitData, operation: "FINAL_EXIT" })).mockResolvedValueOnce(ok(stopData));
    await recordPartialExit(KEY, exitRequest);
    await recordFinalExit(KEY, { ...exitRequest, exitReason: "thesis invalidated" });
    await tightenProtectiveStop(KEY, { positionId: POSITION, newStop: "100", evidenceClass: "OWNER_DECLARED" });
    expect(post.mock.calls).toEqual([
      [
        "/api/personal-risk/lifecycle/partial-exits",
        { positionId: POSITION, brokerConfirmed: true, brokerEffectiveAt: "2026-09-18T15:00:00Z", price: "120", quantity: "2", fees: "0.4", taxes: "0", exitReason: null },
        { headers: { "Idempotency-Key": KEY } },
      ],
      [
        "/api/personal-risk/lifecycle/final-exits",
        { positionId: POSITION, brokerConfirmed: true, brokerEffectiveAt: "2026-09-18T15:00:00Z", price: "120", quantity: "2", fees: "0.4", taxes: "0", exitReason: "thesis invalidated" },
        { headers: { "Idempotency-Key": KEY } },
      ],
      [
        "/api/personal-risk/lifecycle/protective-stop-tightenings",
        { positionId: POSITION, newStop: "100", evidenceClass: "OWNER_DECLARED" },
        { headers: { "Idempotency-Key": KEY } },
      ],
    ]);
    // `exitReason: null` is transmitted, never omitted, and `brokerConfirmed` is the literal true.
    expect(Object.hasOwn(post.mock.calls[0][1] as object, "exitReason")).toBe(true);
    expect((post.mock.calls[0][1] as { brokerConfirmed: unknown }).brokerConfirmed).toBe(true);
  });

  it("B2 sends the recovery read with exactly the two query params and one valid key header", async () => {
    get.mockResolvedValue(ok({ operation: "TIGHTEN_STOP", state: "NOT_FOUND", positionId: POSITION }));
    await recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION });
    expect(get.mock.calls).toEqual([
      [
        "/api/personal-risk/lifecycle/recovery",
        { params: { operation: "TIGHTEN_STOP", positionId: POSITION }, headers: { "Idempotency-Key": KEY } },
      ],
    ]);
    expect(await failure(() => recoverLifecycle("not-a-uuid", { operation: "TIGHTEN_STOP", positionId: POSITION }))).toMatchObject({
      code: "LIFECYCLE_INPUT_INVALID",
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("B3 accepts the exit shape and keeps every numeric a string", async () => {
    post.mockResolvedValue(ok(exitData));
    const result = await recordPartialExit(KEY, exitRequest);
    expect(result).toEqual(exitData);
    expect(typeof result.openQuantity).toBe("string");
    expect(typeof result.eventId).toBe("string");
  });

  it("B4 accepts a negative realizedPnl, proving the unsigned bootstrap validator is not reused", async () => {
    post.mockResolvedValue(ok({ ...exitData, realizedPnl: "-12.50000000", openQuantity: "0.00000000" }));
    const result = await recordPartialExit(KEY, exitRequest);
    expect(result.realizedPnl).toBe("-12.50000000");
    expect(result.openQuantity).toBe("0.00000000");
  });

  it("B5 accepts the tightening shape and requires direction TIGHTENING", async () => {
    post.mockResolvedValueOnce(ok(stopData));
    expect(await tightenProtectiveStop(KEY, { positionId: POSITION, newStop: "100", evidenceClass: "OWNER_DECLARED" })).toEqual(stopData);
    post.mockResolvedValueOnce(ok({ ...stopData, direction: "LOOSENING" }));
    expect(
      await failure(() => tightenProtectiveStop(KEY, { positionId: POSITION, newStop: "100", evidenceClass: "OWNER_DECLARED" })),
    ).toMatchObject({ code: "LIFECYCLE_RESPONSE_INVALID" });
  });

  it("B6 passes each evidence class through unchanged", async () => {
    for (const evidenceClass of ["OWNER_DECLARED", "BROKER_CONFIRMED"] as const) {
      post.mockResolvedValueOnce(ok({ ...stopData, evidenceClass }));
      const result = await tightenProtectiveStop(KEY, { positionId: POSITION, newStop: "100", evidenceClass });
      const sent = post.mock.calls.at(-1) as [string, { evidenceClass: string }, unknown];
      expect(sent[1].evidenceClass).toBe(evidenceClass);
      expect(result.evidenceClass).toBe(evidenceClass);
    }
  });

  it("B7 rejects shape violations instead of rendering them", async () => {
    for (const data of [
      { ...exitData, unexpected: true },
      { ...exitData, eventId: 7 },
      { ...exitData, eventId: "0" },
      { ...exitData, realizedPnl: "1,000" },
      { ...exitData, operation: "FINAL_EXIT" },
      { ...exitData, replayed: "false" },
      { ...exitData, positionId: "nope" },
    ]) {
      post.mockResolvedValueOnce(ok(data));
      expect(await failure(() => recordPartialExit(KEY, exitRequest)), JSON.stringify(data)).toMatchObject({
        code: "LIFECYCLE_RESPONSE_INVALID",
      });
    }
    post.mockResolvedValueOnce({ data: { success: false, data: exitData } });
    expect(await failure(() => recordPartialExit(KEY, exitRequest))).toMatchObject({ code: "LIFECYCLE_RESPONSE_INVALID" });
  });

  it("B8 validates the NOT_FOUND shape as exactly three fields", async () => {
    get.mockResolvedValueOnce(ok({ operation: "PARTIAL_EXIT", state: "NOT_FOUND", positionId: POSITION }));
    expect(await recoverLifecycle(KEY, { operation: "PARTIAL_EXIT", positionId: POSITION })).toEqual({
      operation: "PARTIAL_EXIT",
      state: "NOT_FOUND",
      positionId: POSITION,
    });
    for (const data of [
      { operation: "PARTIAL_EXIT", state: "NOT_FOUND", positionId: POSITION, replayed: false },
      { operation: "FINAL_EXIT", state: "NOT_FOUND", positionId: POSITION },
      { operation: "PARTIAL_EXIT", state: "MISSING", positionId: POSITION },
    ]) {
      get.mockResolvedValueOnce(ok(data));
      expect(await failure(() => recoverLifecycle(KEY, { operation: "PARTIAL_EXIT", positionId: POSITION }))).toMatchObject({
        code: "LIFECYCLE_RESPONSE_INVALID",
      });
    }
  });

  it("B9 requires replayed true on a COMMITTED recovery", async () => {
    get.mockResolvedValueOnce(ok({ ...exitData, replayed: true, state: "COMMITTED" }));
    expect(await recoverLifecycle(KEY, { operation: "PARTIAL_EXIT", positionId: POSITION })).toEqual({
      ...exitData,
      replayed: true,
      state: "COMMITTED",
    });
    get.mockResolvedValueOnce(ok({ ...exitData, replayed: false, state: "COMMITTED" }));
    expect(await failure(() => recoverLifecycle(KEY, { operation: "PARTIAL_EXIT", positionId: POSITION }))).toMatchObject({
      code: "LIFECYCLE_RESPONSE_INVALID",
    });
  });

  it("B10 preserves commit-unknown exactly", async () => {
    post.mockRejectedValueOnce(
      axiosError(503, { success: false, code: "LIFECYCLE_COMMIT_UNKNOWN", recoveryRequired: true, commitState: "UNKNOWN" }),
    );
    expect(await failure(() => recordPartialExit(KEY, exitRequest))).toMatchObject({
      code: "LIFECYCLE_COMMIT_UNKNOWN",
      commitState: "UNKNOWN",
      recoveryRequired: true,
      status: 503,
    });
  });

  it("B11 preserves committed-readback-pending without collapsing it into commit-unknown", async () => {
    post.mockRejectedValueOnce(
      axiosError(503, {
        success: false,
        code: "LIFECYCLE_COMMITTED_READBACK_PENDING",
        recoveryRequired: true,
        commitState: "COMMITTED",
      }),
    );
    const error = await failure(() => recordPartialExit(KEY, exitRequest));
    expect(error.code).toBe("LIFECYCLE_COMMITTED_READBACK_PENDING");
    expect(error.commitState).toBe("COMMITTED");
    expect(error.code).not.toBe("LIFECYCLE_COMMIT_UNKNOWN");
  });

  it("B12 keeps recovery-unavailable distinct and falls back to NETWORK_AMBIGUOUS", async () => {
    get.mockRejectedValueOnce(
      axiosError(503, { success: false, code: "LIFECYCLE_RECOVERY_UNAVAILABLE", recoveryRequired: true, commitState: "UNKNOWN" }),
    );
    const recovery = await failure(() => recoverLifecycle(KEY, { operation: "PARTIAL_EXIT", positionId: POSITION }));
    expect(recovery.code).toBe("LIFECYCLE_RECOVERY_UNAVAILABLE");
    expect(recovery.commitState).toBe("UNKNOWN");
    post.mockRejectedValueOnce(axiosError(409, { success: false, code: "IDEMPOTENCY_CONFLICT" }));
    const conflict = await failure(() => recordPartialExit(KEY, exitRequest));
    expect(conflict.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(conflict.commitState).toBeUndefined();
    expect(conflict.recoveryRequired).toBe(false);
    post.mockRejectedValueOnce(axiosError(500, { success: false, code: "SOMETHING_ELSE" }));
    expect(await failure(() => recordPartialExit(KEY, exitRequest))).toMatchObject({ code: "LIFECYCLE_UNAVAILABLE" });
    post.mockRejectedValueOnce(new Error("socket closed"));
    expect(await failure(() => recordPartialExit(KEY, exitRequest))).toMatchObject({ code: "NETWORK_AMBIGUOUS" });
    post.mockRejectedValueOnce(axiosError(502, { success: false }));
    expect(await failure(() => recordPartialExit(KEY, exitRequest))).toMatchObject({ code: "LIFECYCLE_RESPONSE_INVALID" });
  });

  it("B13 reports a malformed 2xx mutation body as COMMITTED, never as undispatched", async () => {
    // The backend answers 2xx only after the RPC committed and its readback succeeded, so an
    // uninterpretable 2xx body is a committed outcome we cannot read — not a safe retry.
    for (const data of [{ ...exitData, unexpected: true }, { ...exitData, eventId: 0 }, { nothing: true }]) {
      post.mockResolvedValueOnce(ok(data));
      const error = await failure(() => recordPartialExit(KEY, exitRequest));
      expect(error.code, JSON.stringify(data)).toBe("LIFECYCLE_RESPONSE_INVALID");
      expect(error.commitState, JSON.stringify(data)).toBe("COMMITTED");
      expect(error.recoveryRequired).toBe(true);
    }
    post.mockResolvedValueOnce(ok({ ...stopData, direction: "LOOSENING" }));
    const stop = await failure(() =>
      tightenProtectiveStop(KEY, { positionId: POSITION, newStop: "100", evidenceClass: "OWNER_DECLARED" }),
    );
    expect(stop.code).toBe("LIFECYCLE_RESPONSE_INVALID");
    expect(stop.commitState).toBe("COMMITTED");
    // A non-2xx response must keep whatever the backend actually asserted, not gain COMMITTED.
    post.mockRejectedValueOnce(axiosError(502, { success: false, code: "LIFECYCLE_RESPONSE_INVALID" }));
    expect((await failure(() => recordPartialExit(KEY, exitRequest))).commitState).toBeUndefined();
    // The recovery read is non-mutating, so a malformed 2xx there must NOT claim COMMITTED.
    get.mockResolvedValueOnce(ok({ operation: "PARTIAL_EXIT", state: "NOT_FOUND", positionId: POSITION, extra: 1 }));
    const recovery = await failure(() => recoverLifecycle(KEY, { operation: "PARTIAL_EXIT", positionId: POSITION }));
    expect(recovery.code).toBe("LIFECYCLE_RESPONSE_INVALID");
    expect(recovery.commitState).toBeUndefined();
    console.log("PASS lifecycle service: fixed endpoints, exact bodies, signed readback decimals, strict shapes, distinct commit-state mapping and committed-on-malformed-2xx are enforced.");
  });

  it("B14 sends the expected class only for a TIGHTEN_STOP recovery that supplies one", async () => {
    for (const evidenceClass of ["OWNER_DECLARED", "BROKER_CONFIRMED"] as const) {
      get.mockReset().mockResolvedValue(ok({ operation: "TIGHTEN_STOP", state: "NOT_FOUND", positionId: POSITION }));
      await recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass });
      expect(get.mock.calls).toEqual([
        [
          "/api/personal-risk/lifecycle/recovery",
          { params: { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass }, headers: { "Idempotency-Key": KEY } },
        ],
      ]);
    }
    // Omitted, or explicitly undefined, the read stays report-only with exactly two params.
    get.mockReset().mockResolvedValue(ok({ operation: "TIGHTEN_STOP", state: "NOT_FOUND", positionId: POSITION }));
    await recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: undefined });
    expect(Object.keys((get.mock.calls[0][1] as { params: object }).params).sort()).toEqual(["operation", "positionId"]);
  });

  it("B15 rejects an unknown class, or a class supplied for an exit, before any GET", async () => {
    for (const target of [
      { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: "UNKNOWN_CLASS" },
      { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: "" },
      { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: null },
      { operation: "PARTIAL_EXIT", positionId: POSITION, evidenceClass: "BROKER_CONFIRMED" },
      { operation: "FINAL_EXIT", positionId: POSITION, evidenceClass: "OWNER_DECLARED" },
    ]) {
      expect(await failure(() => recoverLifecycle(KEY, target as never)), JSON.stringify(target)).toMatchObject({
        code: "LIFECYCLE_INPUT_INVALID",
        status: 400,
      });
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("B16 refuses a COMMITTED stop recovery whose class differs from the expected one", async () => {
    const committedStop = (evidenceClass: string) => ok({ ...stopData, evidenceClass, replayed: true, state: "COMMITTED" });
    // Matching class: success, reported exactly.
    get.mockResolvedValueOnce(committedStop("BROKER_CONFIRMED"));
    expect(
      await recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: "BROKER_CONFIRMED" }),
    ).toMatchObject({ state: "COMMITTED", evidenceClass: "BROKER_CONFIRMED" });
    // A discrepancy the backend failed to catch is still never a success, and asserts nothing about commit.
    for (const [expected, returned] of [
      ["BROKER_CONFIRMED", "OWNER_DECLARED"],
      ["OWNER_DECLARED", "BROKER_CONFIRMED"],
    ] as const) {
      get.mockResolvedValueOnce(committedStop(returned));
      const error = await failure(() =>
        recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: expected }),
      );
      expect(error.code).toBe("LIFECYCLE_RESPONSE_INVALID");
      expect(error.commitState).toBeUndefined();
    }
    // Without an expected class the stored class is only reported, exactly as before.
    get.mockResolvedValueOnce(committedStop("OWNER_DECLARED"));
    expect(await recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION })).toMatchObject({
      state: "COMMITTED",
      evidenceClass: "OWNER_DECLARED",
    });
    // NOT_FOUND carries no class and is unaffected by the expectation.
    get.mockResolvedValueOnce(ok({ operation: "TIGHTEN_STOP", state: "NOT_FOUND", positionId: POSITION }));
    expect(
      await recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: "OWNER_DECLARED" }),
    ).toEqual({ operation: "TIGHTEN_STOP", state: "NOT_FOUND", positionId: POSITION });
    // The backend's own 502 for a mismatched or missing durable class keeps its UNKNOWN commit state.
    get.mockRejectedValueOnce(
      axiosError(502, { success: false, code: "LIFECYCLE_RESPONSE_INVALID", commitState: "UNKNOWN", recoveryRequired: true }),
    );
    expect(
      await failure(() => recoverLifecycle(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: "OWNER_DECLARED" })),
    ).toMatchObject({ code: "LIFECYCLE_RESPONSE_INVALID", status: 502, commitState: "UNKNOWN", recoveryRequired: true });
  });
});
