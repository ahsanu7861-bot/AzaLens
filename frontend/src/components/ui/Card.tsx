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
  sm: "p-4",
  md: "p-6",
  lg: "p-6",
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
        "az-card rounded-2xl border",
        variantClasses[variant],
        paddingClasses[padding],
        interactive
          ? "cursor-pointer"
          : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
