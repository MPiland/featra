import { useEffect, useId, useRef, type ReactNode } from "react";
import { focusedElement } from "../utils/dom.ts";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** The dismiss button's label: Close, or Cancel when the dialog asks something. */
  closeLabel?: string;
  /** Buttons after the dismiss button, such as a confirm. */
  actions?: ReactNode;
}

/**
 * A modal dialog. The app behind it is made inert by the caller; focus starts on the dismiss button (the safe
 * choice), Tab stays inside, Escape dismisses, and focus returns to wherever it was before the dialog opened.
 */
export function Dialog({ title, onClose, children, closeLabel = "Close", actions }: DialogProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = focusedElement();
    closeButton.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, []);

  return (
    // The overlay only catches keys bubbling up from inside the dialog, so it has no role of its own.
    <div
      className="overlay"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === "Tab") {
          const els = Array.from(box.current?.querySelectorAll<HTMLElement>("button, [href], [tabindex='0']") ?? []);
          const focused = focusedElement();
          const at = focused ? els.indexOf(focused) : -1;
          const next = els[(at + (e.shiftKey ? -1 : 1) + els.length) % els.length];
          e.preventDefault();
          next?.focus();
        }
      }}
    >
      <div ref={box} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="dialog-actions">
          <button ref={closeButton} type="button" className="btn" onClick={onClose}>
            {closeLabel}
          </button>
          {actions}
        </div>
      </div>
    </div>
  );
}
