import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  recordPartialExit: vi.fn(),
  recordFinalExit: vi.fn(),
  tightenProtectiveStop: vi.fn(),
  recoverLifecycle: vi.fn(),
}));
vi.mock("../services/personalRiskLifecycle", async () => {
  const actual = await vi.importActual<typeof import("../services/personalRiskLifecycle")>("../services/personalRiskLifecycle");
  return { ...actual, ...service };
});

import { LIFECYCLE_PENDING_KEY, type PendingReason } from "../lib/personalRiskLifecycleIntent";
import { LifecycleClientError } from "../services/personalRiskLifecycle";
import type { LifecycleOperation } from "../types/personalRiskLifecycle";
import PersonalRiskLifecyclePage from "./PersonalRiskLifecyclePage";

const POSITION = "20000000-0000-4000-8000-000000000002";
const OTHER_POSITION = "20000000-0000-4000-8000-00000000000a";
const KEY = "30000000-0000-4000-8000-000000000003";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
} as Storage;
beforeAll(() => Object.defineProperty(window, "localStorage", { configurable: true, value: storage }));

const IMPLIED: Record<PendingReason, { certainty: string; restriction: string }> = {
  NONE: { certainty: "UNKNOWN", restriction: "RECOVER_FIRST" },
  READBACK_PENDING: { certainty: "COMMITTED", restriction: "NO_RETRY" },
  CONFLICT: { certainty: "UNKNOWN", restriction: "NO_RETRY" },
  CONTRADICTORY: { certainty: "COMMITTED", restriction: "NO_RETRY" },
};
function seed(reason: PendingReason, operation: LifecycleOperation = "PARTIAL_EXIT", positionId = POSITION) {
  memory.set(
    LIFECYCLE_PENDING_KEY,
    JSON.stringify({ version: 1, operation, positionId, idempotencyKey: KEY, reason, ...IMPLIED[reason] }),
  );
}
/** Mints the version-2 TIGHTEN_STOP shape directly, for states the page cannot reach in one session. */
function seedV2Stop(reason: PendingReason, evidenceClass: "OWNER_DECLARED" | "BROKER_CONFIRMED" = "BROKER_CONFIRMED") {
  memory.set(
    LIFECYCLE_PENDING_KEY,
    JSON.stringify({
      version: 2,
      operation: "TIGHTEN_STOP",
      positionId: POSITION,
      idempotencyKey: KEY,
      evidenceClass,
      reason,
      ...IMPLIED[reason],
    }),
  );
  return memory.get(LIFECYCLE_PENDING_KEY) as string;
}
const storedRecord = () => {
  const raw = memory.get(LIFECYCLE_PENDING_KEY);
  return raw === undefined ? null : (JSON.parse(raw) as Record<string, string>);
};

const exitResult = {
  operation: "PARTIAL_EXIT" as const,
  eventId: "7",
  positionId: POSITION,
  openQuantity: "4.00000000",
  realizedPnl: "30.41666667",
  brokerEffectiveAt: "2026-09-18T15:00:00+00:00",
  replayed: false,
};
const stopResult = {
  operation: "TIGHTEN_STOP" as const,
  stopChangeId: "9",
  positionId: POSITION,
  priorStop: "99.00000000",
  newStop: "100.00000000",
  evidenceClass: "OWNER_DECLARED" as const,
  direction: "TIGHTENING" as const,
  replayed: false,
};
const notFound = (operation: LifecycleOperation = "PARTIAL_EXIT", positionId = POSITION) => ({
  operation,
  state: "NOT_FOUND" as const,
  positionId,
});
const committed = { ...exitResult, replayed: true, state: "COMMITTED" as const };

const CLASS_UNCONFIRMED_COPY =
  "The recorded outcome could not be confirmed to match the evidence class originally submitted. The saved request key remains pending and needs investigation before any further action.";
const RETRY_CLASS_MISMATCH_COPY = "Select the same evidence class you originally submitted to retry.";
const REPORTED_CAPTION =
  "The evidence class above is reported from the stored record. This check does not verify it against what was submitted.";
const MATCHED_CAPTION = "The evidence class above matched the class originally submitted under this saved request key.";
const CLASSES = [
  { choice: "Owner declared" as const, sent: "OWNER_DECLARED" as const, other: "Broker confirmed" as const },
  { choice: "Broker confirmed" as const, sent: "BROKER_CONFIRMED" as const, other: "Owner declared" as const },
];
const committedStop = (evidenceClass: "OWNER_DECLARED" | "BROKER_CONFIRMED") => ({
  ...stopResult,
  evidenceClass,
  replayed: true,
  state: "COMMITTED" as const,
});
const OWNER_DECLARED_COPY =
  "You have recorded this stop in AzaLens. This does not place or amend an order at Saxo — update your stop with your broker separately.";
const BROKER_CONFIRMED_COPY =
  "Saxo has already confirmed this stop change. AzaLens is recording it. This screen does not place or amend any order.";

function view() {
  return render(
    <MemoryRouter>
      <PersonalRiskLifecyclePage />
    </MemoryRouter>,
  );
}
const field = (label: string) => screen.getByLabelText(label);
function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}
function fillExit(position = POSITION) {
  type("Position identifier", position);
  type("Broker effective time", "2026-09-18T15:00:00Z");
  type("Fill price", "120");
  type("Quantity", "2");
  type("Fees", "0.4");
  type("Taxes", "0");
}
/** The confirmations live inside the dialog, so the dialog must already be open. */
function confirmExit(final = false) {
  fireEvent.click(screen.getByLabelText(/broker has already confirmed/));
  if (final) fireEvent.click(screen.getByLabelText(/closes the position record/));
}
async function openExit(final = false, position = POSITION) {
  fillExit(position);
  await startAction(final ? "Review final exit" : "Review partial exit");
  await screen.findByRole("dialog");
  confirmExit(final);
}
async function openStop(position = POSITION, evidence: "Owner declared" | "Broker confirmed" = "Broker confirmed") {
  fillStop(position, evidence);
  await startAction("Review stop tightening");
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByLabelText(/I have read the statement above/));
}
function fillStop(position = POSITION, evidence: "Owner declared" | "Broker confirmed" = "Broker confirmed") {
  type("Position identifier", position);
  type("New stop price", "100");
  fireEvent.click(screen.getByLabelText(evidence));
}
async function confirmDialog() {
  const confirm = await screen.findByRole("button", { name: "Confirm and submit" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  return confirm;
}
const action = (name: string) => screen.getByRole("button", { name });
async function startAction(name: string) {
  const control = action(name);
  await waitFor(() => expect(control).toBeEnabled());
  fireEvent.click(control);
}
const check = () => screen.queryByRole("button", { name: "Check recorded outcome" });
const retry = () => screen.queryByRole("button", { name: "Retry same request key" });
const totalPosts = () =>
  service.recordPartialExit.mock.calls.length + service.recordFinalExit.mock.calls.length + service.tightenProtectiveStop.mock.calls.length;

describe("personal-risk lifecycle page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    memory.clear();
    Object.values(service).forEach((mock) => mock.mockReset());
  });

  it("C1 mints and persists the key only at final confirmation, immediately before one POST", async () => {
    const order: string[] = [];
    vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      order.push("persist");
      memory.set(key, value);
    });
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.recordPartialExit.mockImplementation(async () => {
      order.push("post");
      return exitResult;
    });
    view();
    fillExit();
    await startAction("Review partial exit");
    await screen.findByRole("dialog");
    expect(randomUUID).not.toHaveBeenCalled();
    confirmExit();
    expect(randomUUID).not.toHaveBeenCalled();
    await confirmDialog();
    await waitFor(() => expect(service.recordPartialExit).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["persist", "post"]);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(service.recordPartialExit).toHaveBeenCalledWith(KEY, {
      positionId: POSITION,
      brokerEffectiveAt: "2026-09-18T15:00:00Z",
      price: "120",
      quantity: "2",
      fees: "0.4",
      taxes: "0",
      exitReason: null,
    });
    expect(storedRecord()).toBeNull();
  });

  it("C2 disables every action while a pending record exists", async () => {
    seed("NONE");
    view();
    for (const name of ["Review partial exit", "Review final exit", "Review stop tightening"]) {
      expect(action(name)).toBeDisabled();
    }
    expect(check()).toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
  });

  it("C3 refuses an operation mismatch client-side without a POST or a new key", async () => {
    seed("NONE", "TIGHTEN_STOP");
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    service.recoverLifecycle.mockResolvedValue(notFound("TIGHTEN_STOP"));
    view();
    // Arm retry for the stored tightening, then attempt a final exit instead.
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(retry()).not.toBeInTheDocument());
    fillExit();
    expect(action("Review final exit")).toBeDisabled();
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(storedRecord()?.idempotencyKey).toBe(KEY);
  });

  it("C4 refuses a retry aimed at a different position", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.recordPartialExit.mockRejectedValue(new LifecycleClientError("LIFECYCLE_COMMIT_UNKNOWN", { commitState: "UNKNOWN" }));
    service.recoverLifecycle.mockResolvedValue(notFound());
    view();
    await openExit();
    await confirmDialog();
    await waitFor(() => expect(check()).toBeInTheDocument());
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(retry()).toBeInTheDocument());
    // Re-enter against a different position, then retry with the armed key.
    fillExit(OTHER_POSITION);
    fireEvent.click(retry() as HTMLElement);
    await screen.findByRole("dialog");
    confirmExit();
    await confirmDialog();
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(service.recordPartialExit).toHaveBeenCalledTimes(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(storedRecord()?.idempotencyKey).toBe(KEY);
  });

  it("C5 invalidates confirmations and closes the dialog on any edit", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    view();
    await openExit();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm and submit" })).toBeEnabled());
    type("Fill price", "121");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await startAction("Review partial exit");
    const confirm = await screen.findByRole("button", { name: "Confirm and submit" });
    expect(screen.getByLabelText(/broker has already confirmed/)).not.toBeChecked();
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(storedRecord()).toBeNull();
  });

  it("C6 blocks an invalid position identifier before minting or dispatching", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    view();
    await openExit(false, "not-a-uuid");
    const confirm = await screen.findByRole("button", { name: "Confirm and submit" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(storedRecord()).toBeNull();
  });

  it("C7 labels the position input plainly, with no picker and no scaffolding language", () => {
    view();
    expect(field("Position identifier")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/temporary|scaffold|interim|placeholder|for now|coming soon/i);
  });

  it("C8 renders the approved OWNER_DECLARED sentence verbatim and gates submit on its own checkbox", async () => {
    view();
    type("Position identifier", POSITION);
    type("New stop price", "100");
    fireEvent.click(screen.getByLabelText("Owner declared"));
    expect(screen.getAllByText(OWNER_DECLARED_COPY).length).toBeGreaterThan(0);
    await startAction("Review stop tightening");
    const confirm = await screen.findByRole("button", { name: "Confirm and submit" });
    expect(confirm).toBeDisabled();
    expect(screen.getAllByText(OWNER_DECLARED_COPY).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByLabelText(/I have read the statement above/));
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it("C9 renders the approved BROKER_CONFIRMED sentence and omits the owner-declared one", async () => {
    view();
    await openStop(POSITION, "Broker confirmed");
    expect(screen.getAllByText(BROKER_CONFIRMED_COPY).length).toBeGreaterThan(0);
    expect(screen.queryByText(OWNER_DECLARED_COPY)).not.toBeInTheDocument();
  });

  it.each([
    { choice: "Owner declared" as const, sent: "OWNER_DECLARED" as const },
    { choice: "Broker confirmed" as const, sent: "BROKER_CONFIRMED" as const },
  ])("C10 transmits the explicitly selected $sent class unchanged", async ({ choice, sent }) => {
    service.tightenProtectiveStop.mockResolvedValue({ ...stopResult, evidenceClass: sent });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    view();
    await openStop(POSITION, choice);
    await confirmDialog();
    await waitFor(() => expect(service.tightenProtectiveStop).toHaveBeenCalledTimes(1));
    expect(service.tightenProtectiveStop).toHaveBeenCalledWith(KEY, {
      positionId: POSITION,
      newStop: "100",
      evidenceClass: sent,
    });
  });

  it("C11 gates an exit on broker confirmation and offers no unconfirmed exit control", async () => {
    view();
    fillExit();
    await startAction("Review partial exit");
    const confirm = await screen.findByRole("button", { name: "Confirm and submit" });
    expect(confirm).toBeDisabled();
    confirmExit();
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(screen.queryByRole("button", { name: /unconfirmed|declare.*exit/i })).not.toBeInTheDocument();
  });

  it("C12 requires a second confirmation that a final exit does not share with a partial exit", async () => {
    view();
    fillExit();
    await startAction("Review final exit");
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByLabelText(/broker has already confirmed/));
    const confirm = screen.getByRole("button", { name: "Confirm and submit" });
    // The broker confirmation alone is not enough for a final exit.
    expect(confirm).toBeDisabled();
    expect(screen.getByLabelText(/closes the position record/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/closes the position record/));
    await waitFor(() => expect(confirm).toBeEnabled());
    // A partial exit does not present that second confirmation.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await startAction("Review partial exit");
    await screen.findByRole("dialog");
    expect(screen.queryByLabelText(/closes the position record/)).not.toBeInTheDocument();
  });

  it("C13 shows the commit-unknown state, offers no retry and keeps the key", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.recordPartialExit.mockRejectedValue(new LifecycleClientError("LIFECYCLE_COMMIT_UNKNOWN", { commitState: "UNKNOWN" }));
    view();
    await openExit();
    await confirmDialog();
    expect(await screen.findByText("Outcome unknown")).toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    expect(check()).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ idempotencyKey: KEY, reason: "NONE", restriction: "RECOVER_FIRST" });
  });

  it("C14 shows the readback-pending state with distinct copy and never a retry", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.recordPartialExit.mockRejectedValue(
      new LifecycleClientError("LIFECYCLE_COMMITTED_READBACK_PENDING", { commitState: "COMMITTED" }),
    );
    view();
    await openExit();
    await confirmDialog();
    expect(await screen.findByText("Recorded, but not read back")).toBeInTheDocument();
    expect(screen.queryByText("Outcome unknown")).not.toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ reason: "READBACK_PENDING", restriction: "NO_RETRY", certainty: "COMMITTED" });
  });

  it("C15 replays the stored triple verbatim on the recovery read", async () => {
    seed("NONE", "FINAL_EXIT", OTHER_POSITION);
    service.recoverLifecycle.mockResolvedValue(notFound("FINAL_EXIT", OTHER_POSITION));
    view();
    type("Position identifier", POSITION);
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    expect(service.recoverLifecycle).toHaveBeenCalledWith(KEY, { operation: "FINAL_EXIT", positionId: OTHER_POSITION });
  });

  it("C16 arms a same-session retry only after re-entry and re-confirmation, reusing the stored key", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.recordPartialExit
      .mockRejectedValueOnce(new LifecycleClientError("LIFECYCLE_COMMIT_UNKNOWN", { commitState: "UNKNOWN" }))
      .mockResolvedValueOnce(exitResult);
    service.recoverLifecycle.mockResolvedValue(notFound());
    view();
    await openExit();
    await confirmDialog();
    await waitFor(() => expect(check()).toBeInTheDocument());
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(retry()).toBeInTheDocument());
    // Every payload field was blanked by the recovery, so re-entry is mandatory before retrying.
    expect(field("Fill price")).toHaveValue("");
    fillExit();
    fireEvent.click(retry() as HTMLElement);
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Confirm and submit" })).toBeDisabled();
    confirmExit();
    await confirmDialog();
    await waitFor(() => expect(service.recordPartialExit).toHaveBeenCalledTimes(2));
    expect(service.recordPartialExit.mock.calls[1][0]).toBe(KEY);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("C17 blanks every payload field and confirmation after a recovery read", async () => {
    seed("NONE");
    service.recoverLifecycle.mockResolvedValue(notFound());
    view();
    fillExit();
    type("Reason (optional)", "thesis invalidated");
    type("New stop price", "100");
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    for (const label of ["Broker effective time", "Fill price", "Quantity", "Fees", "Taxes", "Reason (optional)", "New stop price"]) {
      expect(field(label), label).toHaveValue("");
    }
    // The position identifier is identity, not payload, so it is deliberately preserved.
    expect(field("Position identifier")).toHaveValue(POSITION);
  });

  it("C18 treats a mismatched NOT_FOUND as a failed read and keeps the restriction", async () => {
    seed("NONE");
    service.recoverLifecycle.mockResolvedValue(notFound("PARTIAL_EXIT", OTHER_POSITION));
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(screen.getByText(/last check could not be completed/)).toBeInTheDocument());
    expect(retry()).not.toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ reason: "NONE", idempotencyKey: KEY });
  });

  it("C19 fails closed when the recovery read is unavailable or malformed", async () => {
    for (const error of [
      new LifecycleClientError("LIFECYCLE_RECOVERY_UNAVAILABLE", { commitState: "UNKNOWN" }),
      new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502 }),
    ]) {
      memory.clear();
      seed("NONE");
      service.recoverLifecycle.mockReset().mockRejectedValue(error);
      const { unmount } = view();
      fireEvent.click(check() as HTMLElement);
      await waitFor(() => expect(screen.getByText(/last check could not be completed/)).toBeInTheDocument());
      expect(retry()).not.toBeInTheDocument();
      expect(storedRecord()).toMatchObject({ reason: "NONE", restriction: "RECOVER_FIRST", idempotencyKey: KEY });
      unmount();
    }
  });

  it("C20 resolves and clears the record when recovery returns COMMITTED", async () => {
    seed("READBACK_PENDING");
    service.recoverLifecycle.mockResolvedValue(committed);
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(storedRecord()).toBeNull());
    expect(await screen.findByText("30.41666667")).toBeInTheDocument();
    await waitFor(() => expect(action("Review partial exit")).toBeEnabled());
    expect(screen.queryByText("Recorded, but not read back")).not.toBeInTheDocument();
  });

  it("C21 exposes accessible dialogs and no prohibited term in any interactive name", async () => {
    view();
    const interactiveNames = () =>
      [...screen.getAllByRole("button"), ...screen.getAllByRole("link")].map(
        (element) => element.getAttribute("aria-label") ?? element.textContent ?? "",
      );
    expect(interactiveNames().length).toBeGreaterThan(0);
    for (const name of interactiveNames()) {
      expect(name, `interactive name: ${name}`).not.toMatch(/trade|order|execute|Saxo|ledger/i);
    }
    await openStop(POSITION, "Owner declared");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    // The approved copy legitimately contains "order" and "Saxo"; only interactive names are scanned.
    expect(dialog.textContent ?? "").toContain("Saxo");
    for (const name of interactiveNames()) {
      expect(name, `interactive name: ${name}`).not.toMatch(/trade|order|execute|Saxo|ledger/i);
    }
  });

  it.each([
    { branch: "COMMITTED", response: committed },
    { branch: "NOT_FOUND", response: notFound() },
    { branch: "malformed", response: null },
  ])("C22 keeps a 409 frozen through a $branch recovery", async ({ response }) => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.recordPartialExit.mockRejectedValue(new LifecycleClientError("IDEMPOTENCY_CONFLICT", { status: 409 }));
    if (response === null) {
      service.recoverLifecycle.mockRejectedValue(new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502 }));
    } else {
      service.recoverLifecycle.mockResolvedValue(response);
    }
    view();
    await openExit();
    await confirmDialog();
    expect(await screen.findByText("Saved request key conflict")).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ reason: "CONFLICT", restriction: "NO_RETRY" });
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Saved request key conflict")).toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    expect(service.recordPartialExit).toHaveBeenCalledTimes(1);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(storedRecord()).toMatchObject({ reason: "CONFLICT", restriction: "NO_RETRY", idempotencyKey: KEY });
    if (response === committed) {
      // The phrase appears in both the live region and the result card.
      expect(screen.getAllByText(/may be a different recorded action/).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("link", { name: "Leave this page" })).toBeInTheDocument();
    expect(storedRecord()).not.toBeNull();
  });

  it("C23 moves a committed readback to the contradictory state on a matching NOT_FOUND", async () => {
    seed("READBACK_PENDING");
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    service.recoverLifecycle.mockResolvedValue(notFound());
    view();
    fireEvent.click(check() as HTMLElement);
    expect(await screen.findByText("Conflicting results")).toBeInTheDocument();
    expect(screen.getByText(/These results conflict/)).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ reason: "CONTRADICTORY", restriction: "NO_RETRY", certainty: "COMMITTED" });
    expect(retry()).not.toBeInTheDocument();
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
    // A second NOT_FOUND must not de-escalate.
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Conflicting results")).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ reason: "CONTRADICTORY" });
    expect(retry()).not.toBeInTheDocument();
  });

  it.each([
    { reason: "NONE" as PendingReason, heading: "Outcome unknown" },
    { reason: "READBACK_PENDING" as PendingReason, heading: "Recorded, but not read back" },
    { reason: "CONFLICT" as PendingReason, heading: "Saved request key conflict" },
    { reason: "CONTRADICTORY" as PendingReason, heading: "Conflicting results" },
  ])("C24 rehydrates a $reason record with its restriction and no retry path", async ({ reason, heading }) => {
    seed(reason);
    service.recoverLifecycle.mockResolvedValue(notFound());
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    view();
    expect(await screen.findByText(heading)).toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    // Including the RECOVER_FIRST record: no reloaded record was minted in this page session.
    expect(retry()).not.toBeInTheDocument();
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(storedRecord()?.restriction).toBe(IMPLIED[reason].restriction);
  });

  it.each([
    { label: "unparseable JSON", bytes: "{" },
    { label: "wrong shape", bytes: JSON.stringify({ version: 1, nope: true }) },
    { label: "future version", bytes: JSON.stringify({ version: 3, operation: "PARTIAL_EXIT", positionId: POSITION, idempotencyKey: KEY, certainty: "UNKNOWN", restriction: "RECOVER_FIRST", reason: "NONE" }) },
    { label: "invalid enum", bytes: JSON.stringify({ version: 1, operation: "PARTIAL_EXIT", positionId: POSITION, idempotencyKey: KEY, certainty: "MAYBE", restriction: "RECOVER_FIRST", reason: "NONE" }) },
    { label: "inconsistent pair", bytes: JSON.stringify({ version: 1, operation: "PARTIAL_EXIT", positionId: POSITION, idempotencyKey: KEY, certainty: "UNKNOWN", restriction: "NO_RETRY", reason: "NONE" }) },
  ])("C25 fails closed and retains the bytes for $label", async ({ bytes }) => {
    memory.set(LIFECYCLE_PENDING_KEY, bytes);
    view();
    expect(await screen.findByText("Safety state cannot be verified")).toBeInTheDocument();
    for (const name of ["Review partial exit", "Review final exit", "Review stop tightening"]) {
      expect(action(name)).toBeDisabled();
    }
    expect(retry()).not.toBeInTheDocument();
    expect(check()).not.toBeInTheDocument();
    expect(memory.get(LIFECYCLE_PENDING_KEY)).toBe(bytes);
  });

  it("C26 fails closed when a safety write throws at mint time and at escalation time", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const first = view();
    await openExit();
    await confirmDialog();
    expect(await screen.findByText("Safety state cannot be verified")).toBeInTheDocument();
    expect(totalPosts()).toBe(0);
    expect(memory.get(LIFECYCLE_PENDING_KEY)).toBeUndefined();
    first.unmount();

    // Escalation-time failure: the mint succeeds, the escalation write does not.
    vi.restoreAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    let writes = 0;
    vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      writes += 1;
      if (writes > 1) throw new Error("quota");
      memory.set(key, value);
    });
    service.recordPartialExit.mockRejectedValue(
      new LifecycleClientError("LIFECYCLE_COMMITTED_READBACK_PENDING", { commitState: "COMMITTED" }),
    );
    view();
    await openExit();
    await confirmDialog();
    expect(await screen.findByText("Safety state cannot be verified")).toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    expect(check()).not.toBeInTheDocument();
  });

  it.each([
    { reason: "READBACK_PENDING" as PendingReason },
    { reason: "CONFLICT" as PendingReason },
  ])("C27 never arms a retry after a $reason origin across reload", async ({ reason }) => {
    seed(reason);
    service.recoverLifecycle.mockResolvedValue(notFound());
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    expect(retry()).not.toBeInTheDocument();
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(storedRecord()?.restriction).toBe("NO_RETRY");
  });

  it.each([
    { reason: "READBACK_PENDING" as PendingReason, heading: "Recorded, but not read back" },
    { reason: "CONFLICT" as PendingReason, heading: "Saved request key conflict" },
    { reason: "CONTRADICTORY" as PendingReason, heading: "Conflicting results" },
  ])("C28 keeps the $reason origin intact when the recovery read fails", async ({ reason, heading }) => {
    for (const error of [
      new LifecycleClientError("LIFECYCLE_RECOVERY_UNAVAILABLE", { commitState: "UNKNOWN" }),
      new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502 }),
    ]) {
      memory.clear();
      seed(reason);
      service.recoverLifecycle.mockReset().mockRejectedValue(error);
      const { unmount } = view();
      fireEvent.click(check() as HTMLElement);
      await waitFor(() => expect(screen.getByText(/last check could not be completed/)).toBeInTheDocument());
      expect(screen.getByText(heading)).toBeInTheDocument();
      expect(retry()).not.toBeInTheDocument();
      expect(storedRecord()).toMatchObject({ reason, restriction: "NO_RETRY", idempotencyKey: KEY });
      unmount();
    }
  });

  it("C29 refuses retry after an escalation-write failure, a reload, and a matching NOT_FOUND", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    let writes = 0;
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      writes += 1;
      if (writes > 1) throw new Error("quota");
      memory.set(key, value);
    });
    service.recordPartialExit.mockRejectedValue(
      new LifecycleClientError("LIFECYCLE_COMMITTED_READBACK_PENDING", { commitState: "COMMITTED" }),
    );
    const first = view();
    await openExit();
    await confirmDialog();
    // Session 1 is permanently blocked and the stored record is still the stale RECOVER_FIRST one.
    expect(await screen.findByText("Safety state cannot be verified")).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ reason: "NONE", restriction: "RECOVER_FIRST" });
    first.unmount();

    // Reload: a new page session, with storage working again and the stale record intact.
    setItem.mockRestore();
    service.recoverLifecycle.mockResolvedValue(notFound());
    view();
    expect(await screen.findByText("Outcome unknown")).toBeInTheDocument();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    expect(retry()).not.toBeInTheDocument();
    expect(screen.getByText(/did not start in this page session/)).toBeInTheDocument();
    expect(service.recordPartialExit).toHaveBeenCalledTimes(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(storedRecord()).toMatchObject({ idempotencyKey: KEY, reason: "NONE" });
  });

  it("C30 refuses a prior-session record the right to authorise its own retry", async () => {
    seed("NONE");
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    service.recoverLifecycle.mockResolvedValue(notFound());
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/did not start in this page session/)).toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
    expect(storedRecord()).toMatchObject({ idempotencyKey: KEY, reason: "NONE" });
  });

  it.each([
    {
      shape: "code LIFECYCLE_COMMITTED_READBACK_PENDING",
      error: new LifecycleClientError("LIFECYCLE_COMMITTED_READBACK_PENDING", { status: 503, commitState: "COMMITTED" }),
    },
    {
      shape: "502 LIFECYCLE_RESPONSE_INVALID carrying commitState COMMITTED",
      error: new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502, commitState: "COMMITTED" }),
    },
  ])("C31 treats a $shape failure as committed, then contradictory on NOT_FOUND", async ({ error }) => {
    const randomUUID = vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.recordPartialExit.mockRejectedValue(error);
    service.recoverLifecycle.mockResolvedValue(notFound());
    view();
    await openExit();
    await confirmDialog();
    // Before any recovery, the record must already be retry-ineligible.
    await waitFor(() => expect(storedRecord()).toMatchObject({ reason: "READBACK_PENDING", restriction: "NO_RETRY" }));
    expect(storedRecord()).toMatchObject({ certainty: "COMMITTED", idempotencyKey: KEY });
    expect(await screen.findByText("Recorded, but not read back")).toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    // A matching NOT_FOUND is then contradictory, never permission.
    fireEvent.click(check() as HTMLElement);
    expect(await screen.findByText("Conflicting results")).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ reason: "CONTRADICTORY", restriction: "NO_RETRY", idempotencyKey: KEY });
    expect(retry()).not.toBeInTheDocument();
    expect(service.recordPartialExit).toHaveBeenCalledTimes(1);
    expect(totalPosts()).toBe(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("C32 issues no stop POST and renders no acknowledgement until a class is selected", async () => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    view();
    // No class is preselected.
    expect(screen.getByLabelText("Broker confirmed")).not.toBeChecked();
    expect(screen.getByLabelText("Owner declared")).not.toBeChecked();
    expect(screen.queryByLabelText(/I have read the statement above/)).not.toBeInTheDocument();
    // Neither approved sentence applies yet, so neither is shown.
    expect(screen.queryByText(OWNER_DECLARED_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText(BROKER_CONFIRMED_COPY)).not.toBeInTheDocument();
    type("Position identifier", POSITION);
    type("New stop price", "100");
    await startAction("Review stop tightening");
    await screen.findByRole("dialog");
    expect(screen.queryByLabelText(/I have read the statement above/)).not.toBeInTheDocument();
    expect(screen.queryByText(OWNER_DECLARED_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText(BROKER_CONFIRMED_COPY)).not.toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm and submit" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(service.tightenProtectiveStop).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
    expect(storedRecord()).toBeNull();
    // Selecting a class reveals exactly that statement and its acknowledgement.
    fireEvent.click(screen.getByLabelText("Owner declared"));
    await startAction("Review stop tightening");
    await screen.findByRole("dialog");
    expect(screen.getByLabelText(/I have read the statement above/)).toBeInTheDocument();
    expect(screen.getAllByText(OWNER_DECLARED_COPY).length).toBeGreaterThan(0);
    expect(screen.queryByText(BROKER_CONFIRMED_COPY)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and submit" })).toBeDisabled();
  });

  it("C33 never claims in general copy that an owner-declared stop was amended at the broker", async () => {
    view();
    const general = () => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      // Remove the two approved evidence sentences; what remains is the general narrative copy.
      for (const node of [...clone.querySelectorAll("*")]) {
        const text = node.textContent ?? "";
        if (text === OWNER_DECLARED_COPY || text === BROKER_CONFIRMED_COPY) node.remove();
      }
      return clone.textContent ?? "";
    };
    for (const claim of [
      /records what already happened at your broker/i,
      /records what the broker already confirmed/i,
      /all .{0,30}confirmed by your broker/i,
      /amend(ed|s)? (an |your |the )?order/i,
      /placed? (an |your |the )?order/i,
    ]) {
      expect(general(), String(claim)).not.toMatch(claim);
    }
    // The page states the two cases are different rather than asserting broker confirmation for both.
    expect(general()).toMatch(/or one you are declaring yourself/i);
    fireEvent.click(screen.getByLabelText("Owner declared"));
    expect(general()).not.toMatch(/broker has (already )?confirmed this stop/i);
    // The approved owner-declared sentence itself is still present, verbatim and unmodified.
    expect(screen.getAllByText(OWNER_DECLARED_COPY).length).toBeGreaterThan(0);
    console.log("PASS lifecycle UI: session-scoped retry gating, terminal conflict, contradictory recovery, committed-state escalation, explicit evidence selection and truthful copy are enforced.");
  });

  it.each(CLASSES)("D1 saves the dispatched $sent class and recovers with it after an ambiguous submission", async ({ choice, sent }) => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.tightenProtectiveStop.mockRejectedValue(new LifecycleClientError("NETWORK_AMBIGUOUS"));
    service.recoverLifecycle.mockResolvedValue(notFound("TIGHTEN_STOP"));
    view();
    await openStop(POSITION, choice);
    await confirmDialog();
    expect(await screen.findByText("Outcome unknown")).toBeInTheDocument();
    expect(service.tightenProtectiveStop).toHaveBeenCalledWith(KEY, { positionId: POSITION, newStop: "100", evidenceClass: sent });
    expect(storedRecord()).toEqual({
      version: 2,
      operation: "TIGHTEN_STOP",
      positionId: POSITION,
      idempotencyKey: KEY,
      evidenceClass: sent,
      certainty: "UNKNOWN",
      restriction: "RECOVER_FIRST",
      reason: "NONE",
    });
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    expect(service.recoverLifecycle).toHaveBeenCalledWith(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: sent });
  });

  it.each(CLASSES)("D2 keeps version 2 and the $sent class through every escalation path", async ({ choice, sent }) => {
    // NONE -> CONFLICT
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.tightenProtectiveStop.mockRejectedValueOnce(new LifecycleClientError("IDEMPOTENCY_CONFLICT", { status: 409 }));
    const first = view();
    await openStop(POSITION, choice);
    await confirmDialog();
    expect(await screen.findByText("Saved request key conflict")).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ version: 2, evidenceClass: sent, reason: "CONFLICT", restriction: "NO_RETRY" });
    first.unmount();

    // NONE -> READBACK_PENDING -> CONTRADICTORY
    memory.clear();
    service.tightenProtectiveStop.mockRejectedValueOnce(
      new LifecycleClientError("LIFECYCLE_COMMITTED_READBACK_PENDING", { status: 503, commitState: "COMMITTED" }),
    );
    service.recoverLifecycle.mockResolvedValue(notFound("TIGHTEN_STOP"));
    view();
    await openStop(POSITION, choice);
    await confirmDialog();
    expect(await screen.findByText("Recorded, but not read back")).toBeInTheDocument();
    expect(storedRecord()).toMatchObject({ version: 2, evidenceClass: sent, reason: "READBACK_PENDING", certainty: "COMMITTED" });
    fireEvent.click(check() as HTMLElement);
    expect(await screen.findByText("Conflicting results")).toBeInTheDocument();
    expect(service.recoverLifecycle).toHaveBeenCalledWith(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: sent });
    expect(storedRecord()).toMatchObject({ version: 2, evidenceClass: sent, reason: "CONTRADICTORY", restriction: "NO_RETRY" });
    expect(Object.keys(storedRecord() as object)).toHaveLength(8);
  });

  it.each(CLASSES)("D3 clears a $sent record and says its class matched only on COMMITTED with that class", async ({ choice, sent }) => {
    // From NONE, minted in this session after an ambiguous submission.
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.tightenProtectiveStop.mockRejectedValue(new LifecycleClientError("NETWORK_AMBIGUOUS"));
    service.recoverLifecycle.mockResolvedValue(committedStop(sent));
    const first = view();
    await openStop(POSITION, choice);
    await confirmDialog();
    await waitFor(() => expect(check()).toBeInTheDocument());
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(storedRecord()).toBeNull());
    expect(screen.getByText(MATCHED_CAPTION)).toBeInTheDocument();
    expect(screen.getByText("The stop tightening is confirmed recorded, and its evidence class matched what was submitted.")).toBeInTheDocument();
    expect(screen.queryByText(REPORTED_CAPTION)).not.toBeInTheDocument();
    await waitFor(() => expect(action("Review stop tightening")).toBeEnabled());
    first.unmount();

    // From READBACK_PENDING, reloaded.
    seedV2Stop("READBACK_PENDING", sent);
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(storedRecord()).toBeNull());
    expect(service.recoverLifecycle).toHaveBeenLastCalledWith(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: sent });
    expect(screen.getByText(MATCHED_CAPTION)).toBeInTheDocument();
  });

  it("D4 keeps a version-1 stop recovery report-only with the original caption", async () => {
    seed("NONE", "TIGHTEN_STOP");
    const before = memory.get(LIFECYCLE_PENDING_KEY);
    expect(JSON.parse(before as string)).toMatchObject({ version: 1 });
    service.recoverLifecycle.mockResolvedValue(committedStop("OWNER_DECLARED"));
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(storedRecord()).toBeNull());
    expect(service.recoverLifecycle).toHaveBeenCalledWith(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION });
    expect(screen.getByText(REPORTED_CAPTION)).toBeInTheDocument();
    expect(screen.getByText("The stop tightening is confirmed recorded.")).toBeInTheDocument();
    expect(screen.queryByText(/matched/)).not.toBeInTheDocument();
  });

  it.each([
    { label: "a backend LIFECYCLE_RESPONSE_INVALID", reject: true },
    { label: "a COMMITTED readback carrying the other class", reject: false },
  ])("D5 shows one conflict alert and keeps the record after $label on a class-verified check", async ({ reject }) => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    // An earlier, successful stop leaves its success card on screen.
    service.tightenProtectiveStop
      .mockResolvedValueOnce({ ...stopResult, evidenceClass: "OWNER_DECLARED" })
      .mockRejectedValueOnce(new LifecycleClientError("NETWORK_AMBIGUOUS"));
    if (reject) {
      service.recoverLifecycle.mockRejectedValue(
        new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502, commitState: "UNKNOWN", recoveryRequired: true }),
      );
    } else {
      service.recoverLifecycle.mockResolvedValue(committedStop("BROKER_CONFIRMED"));
    }
    view();
    await openStop(POSITION, "Owner declared");
    await confirmDialog();
    expect(await screen.findByText("Recorded in AzaLens")).toBeInTheDocument();
    await openStop(POSITION, "Owner declared");
    await confirmDialog();
    expect(await screen.findByText("Outcome unknown")).toBeInTheDocument();
    const bytes = memory.get(LIFECYCLE_PENDING_KEY);
    expect(JSON.parse(bytes as string)).toMatchObject({ version: 2, evidenceClass: "OWNER_DECLARED", reason: "NONE" });

    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(screen.getByText(CLASS_UNCONFIRMED_COPY)).toBeInTheDocument());
    expect(service.recoverLifecycle).toHaveBeenCalledWith(KEY, { operation: "TIGHTEN_STOP", positionId: POSITION, evidenceClass: "OWNER_DECLARED" });
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(CLASS_UNCONFIRMED_COPY);
    expect(screen.queryByText(/last check could not be completed/)).not.toBeInTheDocument();
    expect(memory.get(LIFECYCLE_PENDING_KEY)).toBe(bytes);
    expect(screen.queryByText("Recorded in AzaLens")).not.toBeInTheDocument();
    expect(screen.queryByText("Owner-scoped check result")).not.toBeInTheDocument();
    expect(screen.queryByText(/confirmed recorded/)).not.toBeInTheDocument();
    expect(screen.queryByText(/matched/)).not.toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
    expect(screen.getByText("Outcome unknown")).toBeInTheDocument();
    expect(service.tightenProtectiveStop).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: "LIFECYCLE_RECOVERY_UNAVAILABLE", error: new LifecycleClientError("LIFECYCLE_RECOVERY_UNAVAILABLE", { status: 503, commitState: "UNKNOWN" }) },
    { label: "NETWORK_AMBIGUOUS", error: new LifecycleClientError("NETWORK_AMBIGUOUS") },
    { label: "a non-client error", error: new Error("socket closed") },
  ])("D6 keeps the generic failed-check line for $label on a class-verified check", async ({ error }) => {
    const bytes = seedV2Stop("NONE");
    service.recoverLifecycle.mockRejectedValue(error);
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(screen.getByText(/last check could not be completed/)).toBeInTheDocument());
    expect(screen.queryByText(CLASS_UNCONFIRMED_COPY)).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(memory.get(LIFECYCLE_PENDING_KEY)).toBe(bytes);
  });

  it.each([
    { fixture: "version-1 stop record", load: () => seed("NONE", "TIGHTEN_STOP") },
    { fixture: "version-2 stop record", load: () => seedV2Stop("NONE") },
  ])("D7 (preservation-only: already true on main) starts no new action after an invalid check of a $fixture", async ({ load }) => {
    load();
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    service.recoverLifecycle.mockRejectedValue(new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502 }));
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    for (const name of ["Review partial exit", "Review final exit", "Review stop tightening"]) {
      expect(action(name)).toBeDisabled();
      fireEvent.click(action(name));
    }
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(totalPosts()).toBe(0);
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it("D8 lets a later consistent check resolve an unconfirmed class-verified request", async () => {
    seedV2Stop("NONE", "OWNER_DECLARED");
    service.recoverLifecycle
      .mockRejectedValueOnce(new LifecycleClientError("LIFECYCLE_RESPONSE_INVALID", { status: 502 }))
      .mockResolvedValueOnce(committedStop("OWNER_DECLARED"));
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(screen.getByText(CLASS_UNCONFIRMED_COPY)).toBeInTheDocument());
    expect(storedRecord()).not.toBeNull();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(storedRecord()).toBeNull());
    expect(screen.queryByText(CLASS_UNCONFIRMED_COPY)).not.toBeInTheDocument();
    expect(screen.getByText(MATCHED_CAPTION)).toBeInTheDocument();
  });

  it.each(CLASSES)("D9 refuses a same-key retry that selects a class other than $sent", async ({ choice, sent, other }) => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(KEY);
    service.tightenProtectiveStop
      .mockRejectedValueOnce(new LifecycleClientError("LIFECYCLE_COMMIT_UNKNOWN", { status: 503, commitState: "UNKNOWN" }))
      .mockResolvedValueOnce({ ...stopResult, evidenceClass: sent });
    service.recoverLifecycle.mockResolvedValue(notFound("TIGHTEN_STOP"));
    view();
    await openStop(POSITION, choice);
    await confirmDialog();
    await waitFor(() => expect(check()).toBeInTheDocument());
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(retry()).toBeInTheDocument());
    const bytes = memory.get(LIFECYCLE_PENDING_KEY);

    fillStop(POSITION, other);
    fireEvent.click(retry() as HTMLElement);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByLabelText(/I have read the statement above/));
    await confirmDialog();
    await waitFor(() => expect(screen.getAllByText(RETRY_CLASS_MISMATCH_COPY).length).toBeGreaterThan(0));
    expect(service.tightenProtectiveStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/It is frozen/)).not.toBeInTheDocument();
    expect(memory.get(LIFECYCLE_PENDING_KEY)).toBe(bytes);
    expect(retry()).toBeInTheDocument();

    // Selecting the original class then retries with the same key and that class.
    fireEvent.click(screen.getByLabelText(choice));
    fireEvent.click(screen.getByLabelText(/I have read the statement above/));
    await confirmDialog();
    await waitFor(() => expect(service.tightenProtectiveStop).toHaveBeenCalledTimes(2));
    expect(service.tightenProtectiveStop).toHaveBeenLastCalledWith(KEY, { positionId: POSITION, newStop: "100", evidenceClass: sent });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([
    { reason: "CONFLICT" as PendingReason, heading: "Saved request key conflict" },
    { reason: "CONTRADICTORY" as PendingReason, heading: "Conflicting results" },
  ])("D10 never claims a match for a $reason stop record, even on a COMMITTED matching check", async ({ reason, heading }) => {
    const bytes = seedV2Stop(reason, "BROKER_CONFIRMED");
    service.recoverLifecycle.mockResolvedValue(committedStop("BROKER_CONFIRMED"));
    view();
    fireEvent.click(check() as HTMLElement);
    await waitFor(() => expect(service.recoverLifecycle).toHaveBeenCalledTimes(1));
    expect(service.recoverLifecycle).toHaveBeenCalledWith(KEY, {
      operation: "TIGHTEN_STOP",
      positionId: POSITION,
      evidenceClass: "BROKER_CONFIRMED",
    });
    await waitFor(() => expect(screen.getAllByText(/may be a different recorded action/).length).toBeGreaterThan(0));
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(memory.get(LIFECYCLE_PENDING_KEY)).toBe(bytes);
    expect(screen.queryByText(/matched/)).not.toBeInTheDocument();
    expect(screen.queryByText(MATCHED_CAPTION)).not.toBeInTheDocument();
    expect(screen.queryByText(/confirmed recorded/)).not.toBeInTheDocument();
    expect(retry()).not.toBeInTheDocument();
  });
});
