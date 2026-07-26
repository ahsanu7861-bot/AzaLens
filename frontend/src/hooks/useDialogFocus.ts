import {
  useEffect,
  useRef,
  type RefObject,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type DialogFocusOptions = {
  open: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      !element.hasAttribute("hidden"),
  );
}

export function useDialogFocus({
  open,
  dialogRef,
  onClose,
}: DialogFocusOptions) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const currentDialog = dialogRef.current;
    if (!currentDialog) return;
    const dialog: HTMLElement = currentDialog;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    let active = true;

    document.body.style.overflow = "hidden";

    queueMicrotask(() => {
      if (!active) return;

      const preferredTarget =
        dialog.querySelector<HTMLElement>("[autofocus]") ??
        getFocusableElements(dialog)[0] ??
        dialog;
      preferredTarget.focus({ preventScroll: true });
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement =
        focusableElements[focusableElements.length - 1];

      if (
        event.shiftKey &&
        (document.activeElement === firstElement ||
          document.activeElement === dialog)
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      active = false;
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [dialogRef, open]);
}
