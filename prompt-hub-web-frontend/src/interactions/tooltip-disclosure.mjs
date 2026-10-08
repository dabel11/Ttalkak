const boundTooltipButtons = new WeakSet();

function setTooltipExpanded(button, expanded, { dismissed = false } = {}) {
  if (!button) return false;
  const nextExpanded = Boolean(expanded);
  button.classList?.toggle("show-tip", nextExpanded);
  button.classList?.toggle("tooltip-dismissed", Boolean(dismissed));
  button.setAttribute?.("aria-expanded", String(nextExpanded));
  return nextExpanded;
}

/**
 * @param {HTMLElement | null | undefined} button
 * @param {{ onChange?: (expanded: boolean) => void }} [options]
 */
function bindTooltipDisclosure(button, { onChange } = {}) {
  if (!button || boundTooltipButtons.has(button)) return;
  boundTooltipButtons.add(button);
  let pointerPressed = false;
  let openedFromPointerFocus = false;
  let suppressKeyboardClick = false;

  const update = (expanded, options) => {
    const nextExpanded = setTooltipExpanded(button, expanded, options);
    onChange?.(nextExpanded);
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const keyboardClick = Number(event.detail ?? 1) === 0;
    if (suppressKeyboardClick && keyboardClick) {
      suppressKeyboardClick = false;
      return;
    }
    suppressKeyboardClick = false;
    if (openedFromPointerFocus) {
      pointerPressed = false;
      openedFromPointerFocus = false;
      return;
    }
    const isExpanded = button.getAttribute?.("aria-expanded") === "true";
    update(!isExpanded, { dismissed: isExpanded });
  });
  button.addEventListener("pointerdown", () => {
    pointerPressed = true;
    openedFromPointerFocus = false;
  });
  button.addEventListener("focus", () => {
    openedFromPointerFocus = pointerPressed;
    update(true);
  });
  button.addEventListener("blur", () => {
    pointerPressed = false;
    openedFromPointerFocus = false;
    suppressKeyboardClick = false;
    update(false);
  });
  button.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch" || button.classList?.contains("tooltip-dismissed")) return;
    update(true);
  });
  button.addEventListener("pointerleave", () => {
    if (button.ownerDocument?.activeElement !== button) update(false);
    button.classList?.remove("tooltip-dismissed");
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const isExpanded = button.getAttribute?.("aria-expanded") === "true";
      suppressKeyboardClick = true;
      update(!isExpanded, { dismissed: isExpanded });
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    update(false, { dismissed: true });
  });
}

export { bindTooltipDisclosure, setTooltipExpanded };
