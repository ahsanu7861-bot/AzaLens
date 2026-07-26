import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import WorkspaceTabsNav from "./WorkspaceTabsNav";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

describe("WorkspaceTabsNav keyboard contract", () => {
  it("uses a roving tab stop with linked tab panels", () => {
    render(
      <WorkspaceTabsNav
        activeWorkspace="overview"
        onChange={() => undefined}
      />,
    );

    const overview = screen.getByRole("tab", {
      name: "Overview",
    });
    const technical = screen.getByRole("tab", {
      name: "Technical",
    });

    expect(overview).toHaveAttribute("tabindex", "0");
    expect(overview).toHaveAttribute(
      "aria-controls",
      "workspace-panel-overview",
    );
    expect(technical).toHaveAttribute("tabindex", "-1");
  });

  it("supports Arrow, Home, and End navigation", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WorkspaceTabsNav
        activeWorkspace="overview"
        onChange={onChange}
      />,
    );

    const overview = screen.getByRole("tab", {
      name: "Overview",
    });
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });

    expect(onChange).toHaveBeenLastCalledWith("technical");
    expect(
      screen.getByRole("tab", { name: "Technical" }),
    ).toHaveFocus();

    rerender(
      <WorkspaceTabsNav
        activeWorkspace="technical"
        onChange={onChange}
      />,
    );
    const technical = screen.getByRole("tab", {
      name: "Technical",
    });
    fireEvent.keyDown(technical, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("thesis");

    fireEvent.keyDown(
      screen.getByRole("tab", { name: "AI Thesis" }),
      { key: "Home" },
    );
    expect(onChange).toHaveBeenLastCalledWith("overview");
  });
});
