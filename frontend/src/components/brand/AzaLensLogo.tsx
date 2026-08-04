import { useContext } from "react";

import { ThemeContext } from "../../app/providers/theme";

export type AzaLensLogoVariant = "horizontal" | "symbol" | "loading";

type AzaLensLogoProps = {
  variant?: AzaLensLogoVariant;
  surface?: "auto" | "dark" | "light";
  className?: string;
  decorative?: boolean;
};

const dimensions: Record<AzaLensLogoVariant, { width: number; height: number }> = {
  horizontal: { width: 540, height: 120 },
  symbol: { width: 289, height: 262 },
  loading: { width: 320, height: 320 },
};

export default function AzaLensLogo({
  variant = "horizontal",
  surface = "auto",
  className,
  decorative = false,
}: AzaLensLogoProps) {
  const theme = useContext(ThemeContext);
  const documentTheme =
    typeof document === "undefined"
      ? "night"
      : document.documentElement.dataset.theme;
  const resolvedTheme =
    theme?.resolvedTheme ?? (documentTheme === "day" ? "day" : "night");
  const resolvedSurface =
    surface === "auto"
      ? resolvedTheme === "night"
        ? "dark"
        : "light"
      : surface;
  const src =
    variant === "horizontal"
      ? `/brand/azalens-horizontal-on-${resolvedSurface}.svg`
      : variant === "loading"
        ? "/brand/azalens-loading-mark-animated.svg"
        : "/brand/azalens-symbol-gradient.svg";

  return (
    <img
      src={src}
      width={dimensions[variant].width}
      height={dimensions[variant].height}
      className={className}
      alt={decorative ? "" : "AzaLens"}
      aria-hidden={decorative || undefined}
      draggable={false}
    />
  );
}
