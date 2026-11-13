import { useEffect, useId, useRef, type ReactNode } from "react";

export interface ConfirmAskProps {
  /** The dialog's name: the action it confirms. */
  label: string;
  /** The question, and what going ahead would change. */
  children: ReactNode;
  /** The buttons that go ahead, before Cancel. */
  actions: ReactNode;
  cancel: string;
  onCancel: () => void;
}

/**
 * The inline question before an action that can't be undone, shared by a draft's Reject (STORY-51) and a story's
 * Abandon (STORY-58). An alert dialog in place of the buttons that opened it: focus starts on Cancel and stays inside,
 * and Escape closes it from anywhere (not the pane behind it). Putting focus back on the button that opened it is the
 * opener's part, since only it knows that button.
 */
export function ConfirmAsk({ label, children, actions, cancel: cancelText, onCancel }: ConfirmAskProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onCancel);
  const question = useId();

  useEffect(() => {
    close.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Node && !dialog.current?.contains(e.target)) cancel.current?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={dialog}
      className="draft-ask"
      role="alertdialog"
      aria-label={label}
      aria-describedby={question}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const buttons = [...e.currentTarget.querySelectorAll("button")];
        const edge = buttons[e.shiftKey ? 0 : buttons.length - 1];
        if (e.target !== edge) return;
        e.preventDefault();
        buttons[e.shiftKey ? buttons.length - 1 : 0]?.focus();
      }}
    >
      <div id={question}>{children}</div>
      <div className="send-back-actions">
        {actions}
        <button ref={cancel} type="button" className="btn" onClick={onCancel}>
          {cancelText}
        </button>
      </div>
    </div>
  );
}
