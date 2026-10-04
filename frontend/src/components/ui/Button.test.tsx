import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Button from "./Button";

const classesOf = (element: HTMLElement) => element.className.split(/\s+/).filter(Boolean);

const SHARED = [
  "inline-flex",
  "items-center",
  "justify-center",
  "gap-2",
  "rounded-2xl",
  "font-semibold",
  "transition",
  "duration-200",
  "ease-out",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-offset-2",
  "focus-visible:ring-offset-canvas",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
  "active:scale-[0.98]",
];

const VARIANTS = {
  primary: ["bg-brand", "text-primary-button-label", "hover:bg-brand-strong", "focus-visible:ring-brand"],
  secondary: [
    "border",
    "border-stroke",
    "bg-surface-soft",
    "text-ink",
    "hover:border-stroke-strong",
    "hover:bg-surface-raised",
    "focus-visible:ring-brand",
  ],
  ghost: ["bg-transparent", "text-ink-soft", "hover:bg-surface-soft", "hover:text-ink", "focus-visible:ring-brand"],
  danger: ["bg-critical", "text-white", "hover:brightness-105", "focus-visible:ring-critical"],
} as const;

const MD = ["min-h-11", "px-5", "py-2.5", "text-sm"];

describe("Button variant contract", () => {
  it("primary takes its label from the primary-button-label token and keeps every other class", () => {
    render(<Button>Save</Button>);
    const classes = classesOf(screen.getByRole("button", { name: "Save" }));
    expect(classes).toEqual([...SHARED, ...VARIANTS.primary, ...MD]);
    expect(classes).not.toContain("text-white");
  });

  it("primary is the default variant", () => {
    render(<Button variant="primary">Explicit</Button>);
    render(<Button>Implicit</Button>);
    expect(screen.getByRole("button", { name: "Explicit" }).className).toBe(
      screen.getByRole("button", { name: "Implicit" }).className,
    );
  });

  for (const variant of ["secondary", "ghost", "danger"] as const) {
    it(`${variant} classes are unchanged`, () => {
      render(<Button variant={variant}>{variant}</Button>);
      expect(classesOf(screen.getByRole("button", { name: variant }))).toEqual([...SHARED, ...VARIANTS[variant], ...MD]);
    });
  }
});

describe("Button disabled and loading behaviour", () => {
  it("disabled keeps the label and the primary classes", () => {
    render(<Button disabled>Create</Button>);
    const button = screen.getByRole("button", { name: "Create" });
    expect(button).toBeDisabled();
    expect(classesOf(button)).toEqual([...SHARED, ...VARIANTS.primary, ...MD]);
  });

  it("loading disables the control, shows a hidden spinner and replaces the label with Loading...", () => {
    const { container } = render(<Button isLoading>Submit</Button>);
    const button = screen.getByRole("button", { name: "Loading..." });
    expect(button).toBeDisabled();
    expect(screen.queryByText("Submit")).toBeNull();
    const spinner = container.querySelector("span[aria-hidden='true']");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveClass("animate-spin", "border-current");
  });

  it("an enabled, non-loading Button is enabled with type=button by default", () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "button");
  });
});
