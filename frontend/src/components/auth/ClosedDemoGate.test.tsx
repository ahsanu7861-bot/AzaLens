import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    vi.clearAllMocks();
    authCallback.current = () => {};
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
    await act(async () => {
      authCallback.current("TOKEN_REFRESHED", { access_token: "refreshed" });
    });
    expect(screen.getByText("workspace")).toBeInTheDocument();
    await act(async () => {
      authCallback.current("SIGNED_OUT", null);
    });
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

  const BUTTON_CLASS = "w-full rounded-xl bg-brand px-4 py-3 font-semibold text-primary-button-label disabled:opacity-60";

  function expectLabelToken(button: HTMLElement) {
    expect(button.classList.contains("bg-brand")).toBe(true);
    expect(button.classList.contains("text-primary-button-label")).toBe(true);
    expect(button.classList.contains("text-white")).toBe(false);
    expect(button.className).toBe(BUTTON_CLASS);
  }

  async function lockedUnlockButton() {
    publicGet.mockResolvedValue({ data: { authorized: false } });
    render(<ClosedDemoGate><div>workspace</div></ClosedDemoGate>);
    const button = await screen.findByRole("button", { name: "Enter workspace" });
    await waitFor(() => expect(button).toBeEnabled());
    return button;
  }

  it("gives the unlock button the primary-button label token", async () => {
    expectLabelToken(await lockedUnlockButton());
  });

  it("gives the sign-in button the primary-button label token", async () => {
    render(<ClosedDemoGate><div>workspace</div></ClosedDemoGate>);
    const button = await screen.findByRole("button", { name: "Owner sign in" });
    await waitFor(() => expect(button).toBeEnabled());
    expectLabelToken(button);
  });

  it("unlocks with exactly one unchanged request and never signs in", async () => {
    publicPost.mockResolvedValue({ data: { success: true } });
    const button = await lockedUnlockButton();
    fireEvent.change(screen.getByLabelText("Owner access code"), { target: { value: "fixture-access-code" } });
    fireEvent.click(button);
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
    expect(publicPost).toHaveBeenCalledTimes(1);
    expect(publicPost).toHaveBeenCalledWith("/auth/demo/unlock", { accessCode: "fixture-access-code" });
    expect(signInOwner).not.toHaveBeenCalled();
  });

  it("dispatches the same single unlock request on form submission", async () => {
    publicPost.mockResolvedValue({ data: { success: true } });
    const button = await lockedUnlockButton();
    fireEvent.change(screen.getByLabelText("Owner access code"), { target: { value: "fixture-access-code" } });
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
    expect(publicPost).toHaveBeenCalledTimes(1);
    expect(publicPost).toHaveBeenCalledWith("/auth/demo/unlock", { accessCode: "fixture-access-code" });
    expect(signInOwner).not.toHaveBeenCalled();
  });

  it("keeps the label token on the disabled unlock button while checking", async () => {
    let release: (value: unknown) => void = () => {};
    publicPost.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const button = await lockedUnlockButton();
    fireEvent.change(screen.getByLabelText("Owner access code"), { target: { value: "fixture-access-code" } });
    fireEvent.click(button);
    const pending = await screen.findByRole("button", { name: "Checking…" });
    expect(pending).toBeDisabled();
    expect(pending.classList.contains("disabled:opacity-60")).toBe(true);
    expectLabelToken(pending);
    expect(publicPost).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ data: { success: true } });
    });
    expect(await screen.findByRole("heading", { name: "Owner sign in" })).toBeInTheDocument();
  });

  it("keeps the label token on the disabled sign-in button while signing in", async () => {
    let release: (value: unknown) => void = () => {};
    signInOwner.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    render(<ClosedDemoGate><div>workspace</div></ClosedDemoGate>);
    const button = await screen.findByRole("button", { name: "Owner sign in" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fixture-password-never-logged" } });
    fireEvent.click(button);
    const pending = await screen.findByRole("button", { name: "Signing in…" });
    expect(pending).toBeDisabled();
    expectLabelToken(pending);
    expect(signInOwner).toHaveBeenCalledTimes(1);
    expect(publicPost).not.toHaveBeenCalled();
    await act(async () => {
      release({ access_token: "fixture" });
    });
    expect(await screen.findByText("workspace")).toBeInTheDocument();
  });
});
