/** The focused element, when it is an HTML element. */
export function focusedElement(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement ? el : null;
}

/** Whether an event's target lies inside any of the given elements. */
export function isInside(target: EventTarget | null, ...elements: (Element | null | undefined)[]): boolean {
  return target instanceof Node && elements.some((el) => el?.contains(target));
}
