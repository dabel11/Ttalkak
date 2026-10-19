import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalFocus(onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusTarget = /** @type {HTMLElement | null} */ (document.activeElement);
    if (!dialog) return undefined;

    const getFocusable = () => [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
    const initialFocus = dialog.querySelector("[data-modal-initial-focus]") || getFocusable()[0];
    initialFocus?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (returnFocusTarget?.isConnected && typeof returnFocusTarget.focus === "function") {
        queueMicrotask(() => returnFocusTarget.focus());
      }
    };
  }, []);

  return dialogRef;
}
