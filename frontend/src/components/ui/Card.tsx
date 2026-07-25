import type { HTMLAttributes, ReactNode } from "react";

type CardVariant =
  | "default"
  | "glass"
  | "outline"
  | "brand"
  | "positive";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
};

const variantClasses: Record<CardVariant, string> = {
  default: "border-stroke bg-surface",
  glass: "border-stroke bg-surface/92 backdrop-blur-xl",
  outline: "border-stroke bg-transparent",
  brand: "border-intelligence/20 bg-intelligence/[0.055]",
  positive: "border-positive/20 bg-positive/[0.05]",
};

const paddingClasses = {
  none: "",
  sm: "p-3.5 sm:p-4",
  md: "p-3.5 sm:p-6",
  lg: "p-3.5 sm:p-6",
};

export default function Card({
  children,
  variant = "default",
  padding = "md",
  interactive = false,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border shadow-[var(--az-card-shadow)]",
        variantClasses[variant],
        paddingClasses[padding],
        interactive
          ? "transition duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_20px_60px_var(--az-shadow)]"
          : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
