import type { ReactNode } from "react";

type BrowserMockupProps = {
  children: ReactNode;
};

export default function BrowserMockup({
  children,
}: BrowserMockupProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-stroke bg-surface shadow-2xl shadow-[var(--az-shadow-strong)]">
      <div className="flex h-14 items-center border-b border-stroke bg-surface-soft px-5">
        <div className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-critical/80" />
          <span className="h-3 w-3 rounded-full bg-caution/80" />
          <span className="h-3 w-3 rounded-full bg-positive/80" />
        </div>

        <div className="mx-auto rounded-lg border border-stroke bg-surface-soft px-6 py-2 text-xs text-ink-muted">
          AzaLens · Analysis Workspace
        </div>

        <div className="w-[52px]" />
      </div>

      {children}
    </div>
  );
}