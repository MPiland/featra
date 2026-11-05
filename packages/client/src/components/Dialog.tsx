import { useEffect, useId, useRef, type ReactNode } from "react";

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
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, []);

  return (
    <div className="overlay">
      <div
        ref={box}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          } else if (e.key === "Tab") {
            const els = Array.from(box.current?.querySelectorAll<HTMLElement>("button, [href], [tabindex='0']") ?? []);
            const at = els.indexOf(document.activeElement as HTMLElement);
            const next = els[(at + (e.shiftKey ? -1 : 1) + els.length) % els.length];
            e.preventDefault();
            next?.focus();
          }
        }}
      >
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
