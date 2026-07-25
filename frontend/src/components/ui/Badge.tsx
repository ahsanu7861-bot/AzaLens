import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "brand";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
};

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-ink-soft/20 bg-ink-soft/15 text-ink-soft",
  success:
    "border-positive/20 bg-positive/15 text-positive",
  warning: "border-caution/20 bg-caution/15 text-caution",
  danger: "border-critical/20 bg-critical/15 text-critical",
  info: "border-intelligence/20 bg-intelligence/15 text-intelligence",
  brand: "border-intelligence/20 bg-intelligence/15 text-intelligence",
};

const dotClasses: Record<BadgeVariant, string> = {
  neutral: "bg-ink-muted",
  success: "bg-positive",
  warning: "bg-caution",
  danger: "bg-critical",
  info: "bg-brand",
  brand: "bg-intelligence",
};

export default function Badge({
  children,
  variant = "neutral",
  dot = false,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        "text-xs font-semibold uppercase tracking-wider",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${dotClasses[variant]}`}
        />
      )}

      {children}
    </span>
  );
}
