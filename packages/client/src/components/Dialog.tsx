import { useEffect, useId, useRef, type FormEvent, type ReactNode, type RefObject } from "react";
import { focusedElement } from "../utils/dom.ts";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** The dismiss button's label: Close, or Cancel when the dialog asks something. */
  closeLabel?: string;
  /** Buttons after the dismiss button, such as a confirm. */
  actions?: ReactNode;
  /** Where focus starts, such as a form's first field. Default: the dismiss button. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Makes the dialog a form: Enter in a field, or a submit button among the actions, calls this. */
  onSubmit?: () => void;
}

/** What Tab moves between inside the dialog. */
const TABBABLE = "button:not(:disabled), input:not(:disabled), [href], [tabindex='0']";

/**
 * A modal dialog. The app behind it is made inert by the caller; focus starts on the dismiss button (the safe
 * choice) unless the dialog names a field, Tab stays inside, Escape dismisses, and focus returns to wherever it was before the dialog opened.
 */
export function Dialog(props: DialogProps) {
  const { title, onClose, children, closeLabel = "Close", actions, initialFocus, onSubmit } = props;
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = focusedElement();
    (initialFocus?.current ?? closeButton.current)?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
    // A ref object is stable, so this runs once, when the dialog opens.
  }, [initialFocus]);

  const buttons = (
    <div className="dialog-actions">
      <button ref={closeButton} type="button" className="btn" onClick={onClose}>
        {closeLabel}
      </button>
      {actions}
    </div>
  );

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
          const els = Array.from(box.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? []);
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
        {onSubmit ? (
          <form
            className="form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {children}
            {buttons}
          </form>
        ) : (
          <>
            {children}
            {buttons}
          </>
        )}
      </div>
    </div>
  );
}
