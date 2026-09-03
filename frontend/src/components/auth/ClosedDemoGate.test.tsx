import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOwnerSession } from "../../auth/OwnerSessionContext";

const { publicGet, publicPost, getCurrentSession, signInOwner, signOutOwner, subscribe, authCallback } = vi.hoisted(() => {
  const callback = { current: (_event: string, _session: unknown) => {} };
  return ({
  publicGet: vi.fn().mockResolvedValue({ data: { authorized: true } }),
  publicPost: vi.fn(),
  getCurrentSession: vi.fn().mockResolvedValue(null),
  signInOwner: vi.fn().mockResolvedValue({ access_token: "fixture" }),
  signOutOwner: vi.fn(),
  subscribe: vi.fn((handler) => { callback.current = handler; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
  authCallback: callback,
  });
});

vi.mock("../../services/api", () => ({
  publicApi: { get: publicGet, post: publicPost },
  onAuthenticationFailure: () => vi.fn(),
}));
vi.mock("../../auth/supabase", () => ({
  getCurrentSession,
  signInOwner,
  signOutOwner,
  supabaseAuthConfigured: true,
  supabase: { auth: { onAuthStateChange: subscribe } },
}));

import ClosedDemoGate from "./ClosedDemoGate";

describe("two-stage owner gate", () => {
  beforeEach(() => {
    publicGet.mockResolvedValue({ data: { authorized: true } });
    getCurrentSession.mockResolvedValue(null);
    signInOwner.mockResolvedValue({ access_token: "fixture" });
    signOutOwner.mockResolvedValue(undefined);
  });

  it("sends the password only to Supabase Auth and opens after sign-in", async () => {
    render(<ClosedDemoGate><div>workspace</div></ClosedDemoGate>);
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fixture-password-never-logged" } });
    fireEvent.click(screen.getByRole("button", { name: "Owner sign in" }));
    await waitFor(() => expect(screen.getByText("workspace")).toBeInTheDocument());
    expect(signInOwner).toHaveBeenCalledWith("owner@example.test", "fixture-password-never-logged");
    expect(publicPost).not.toHaveBeenCalled();
  });

  it("keeps refreshed sessions open and returns expired sessions to sign-in", async () => {
    getCurrentSession.mockResolvedValue({ access_token: "fixture" });
    render(<ClosedDemoGate><div>workspace</div></ClosedDemoGate>);
    expect(await screen.findByText("workspace")).toBeInTheDocument();
    authCallback.current("TOKEN_REFRESHED", { access_token: "refreshed" });
    expect(screen.getByText("workspace")).toBeInTheDocument();
    authCallback.current("SIGNED_OUT", null);
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
  });

  it("exposes sign-out only inside the verified workspace", async () => {
    function Child() {
      const { signOut } = useOwnerSession();
      return <button onClick={() => void signOut()}>fixture sign out</button>;
    }
    getCurrentSession.mockResolvedValue({ access_token: "fixture" });
    render(<ClosedDemoGate><Child /></ClosedDemoGate>);
    fireEvent.click(await screen.findByRole("button", { name: "fixture sign out" }));
    await waitFor(() => expect(signOutOwner).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
  });
});
