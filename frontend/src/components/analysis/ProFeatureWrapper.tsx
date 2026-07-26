import { Crown, X } from "lucide-react";
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
import type { ProFeatureTrigger } from "../../types/overview";

const DEFAULT_DESCRIPTION =
  "Export PDF Institutional Reports is available on AzaLens Pro. Upgrade to unlock full exports, continuous monitoring alerts, and multi-watchlist workflows.";

interface ProFeatureWrapperProps {
  feature: ProFeatureTrigger;
  children: ReactElement<{ className?: string; onClick?: () => void }>;
  footer?: ReactNode;
}

export default function ProFeatureWrapper({
  feature,
  children,
  footer,
}: ProFeatureWrapperProps) {
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
          className="pointer-events-none absolute -right-1 -top-1 rounded-full border border-intelligence/30 bg-intelligence/15 px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-intelligence"
        >
          PRO
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
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-intelligence/15 text-intelligence">
                <Crown size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-intelligence">
                  AzaLens Pro preview
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
                aria-label="Close Pro preview"
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

            <div className="mt-4 rounded-xl border border-positive/25 bg-positive/10 p-3 text-[12px] leading-5 text-positive">
              Shariah screening and all core baseline analysis remain 100% free.
            </div>
            {footer}
          </section>
        </div>
      )}
    </>
  );
}
