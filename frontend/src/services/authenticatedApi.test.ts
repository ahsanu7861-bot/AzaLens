import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentSession, signOutOwner } = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  signOutOwner: vi.fn(),
}));

vi.mock("../auth/supabase", () => ({ getCurrentSession, signOutOwner }));

import { api, onAuthenticationFailure, publicApi } from "./api";

describe("centralized authenticated API boundary", () => {
  beforeEach(() => {
    getCurrentSession.mockReset();
    signOutOwner.mockReset().mockResolvedValue(undefined);
  });

  it("adds exactly one current bearer header to protected requests", async () => {
    getCurrentSession.mockResolvedValue({ access_token: "fixture.access.token" });
    let authorization = "";
    await api.get("/api/analyze/AAPL", {
      adapter: async (config) => {
        authorization = String(config.headers.get("Authorization"));
        return { data: {}, status: 200, statusText: "OK", headers: {}, config };
      },
    });
    expect(authorization).toBe("Bearer fixture.access.token");
    expect(authorization.split("Bearer ")).toHaveLength(2);
    expect(getCurrentSession).toHaveBeenCalledTimes(1);
  });

  it("never sends a protected request without a session", async () => {
    getCurrentSession.mockResolvedValue(null);
    const adapter = vi.fn();
    await expect(api.get("/api/search", { adapter })).rejects.toThrow("A verified owner session is required.");
    expect(adapter).not.toHaveBeenCalled();
  });

  it("signs out and signals once on 401 without replay", async () => {
    getCurrentSession.mockResolvedValue({ access_token: "fixture.access.token" });
    const adapter = vi.fn(async () => { throw { response: { status: 401 } }; });
    const listener = vi.fn();
    const remove = onAuthenticationFailure(listener);
    await expect(api.get("/api/analyze/AAPL", { adapter })).rejects.toBeTruthy();
    remove();
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(signOutOwner).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ status: 401, code: undefined });
  });

  it("returns an expired demo cookie to the first lock without discarding the owner session", async () => {
    getCurrentSession.mockResolvedValue({ access_token: "fixture.access.token" });
    const adapter = vi.fn(async () => { throw { response: { status: 401, data: { code: "CLOSED_DEMO_ACCESS_REQUIRED" } } }; });
    const listener = vi.fn();
    const remove = onAuthenticationFailure(listener);
    await expect(api.get("/api/search", { adapter })).rejects.toBeTruthy();
    remove();
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(signOutOwner).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({ status: 401, code: "CLOSED_DEMO_ACCESS_REQUIRED" });
  });

  it("does not confuse a capability 403 with an invalid owner session", async () => {
    getCurrentSession.mockResolvedValue({ access_token: "fixture.access.token" });
    const adapter = vi.fn(async () => { throw { response: { status: 403, data: { code: "RAW_PROVIDER_DATA_NOT_DISPLAY_ENTITLED" } } }; });
    await expect(api.get("/history/AAPL", { adapter })).rejects.toBeTruthy();
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(signOutOwner).not.toHaveBeenCalled();
  });

  it("keeps demo unlock on the unauthenticated client", () => {
    expect(publicApi).not.toBe(api);
  });
});
