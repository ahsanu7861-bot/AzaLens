import { Hammer, X } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import type { PlannedFeatureTrigger } from "../../types/overview";

const DEFAULT_DESCRIPTION =
  "This feature has not been built yet. AzaLens has no paid tier today — everything currently in the app, including Shariah screening and all baseline analysis, is free.";

interface PlannedFeatureWrapperProps {
  feature: PlannedFeatureTrigger;
  children: ReactElement<{ className?: string; onClick?: () => void }>;
  footer?: ReactNode;
}

export default function PlannedFeatureWrapper({
  feature,
  children,
  footer,
}: PlannedFeatureWrapperProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeDialog = useCallback(() => {
    setOpen(false);
  }, []);

  useDialogFocus({
    open,
    dialogRef,
    onClose: closeDialog,
  });

  if (!isValidElement(children)) return null;

  return (
    <>
      <span className="relative inline-flex">
        {cloneElement(children, {
          className: [
            "min-h-[44px] min-w-[44px]",
            children.props.className,
          ]
            .filter(Boolean)
            .join(" "),
          onClick: () => setOpen(true),
        })}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-1 rounded-full border border-stroke-strong bg-surface-soft px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-ink-muted"
        >
          NOT BUILT
        </span>
      </span>

      {open && (
        <div
          className="fixed inset-0 z-[100] grid place-items-end bg-black/55 p-3 backdrop-blur-sm sm:place-items-center"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDialog();
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="az-popover w-full max-w-md rounded-3xl p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-soft text-ink-muted">
                <Hammer size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Not built yet
                </p>
                <h2
                  id={titleId}
                  className="mt-1 font-display text-lg font-semibold text-ink"
                >
                  {feature.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeDialog}
                className="az-icon-button !h-11 !w-11"
              >
                <X size={18} />
              </button>
            </div>

            <p
              id={descriptionId}
              className="mt-4 break-words text-sm leading-6 text-ink-soft"
            >
              {feature.description ?? DEFAULT_DESCRIPTION}
            </p>

            {footer}
          </section>
        </div>
      )}
    </>
  );
}
