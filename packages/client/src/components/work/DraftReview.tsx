import { useEffect, useId, useRef, useState } from "react";
import { CARD_COPY, type ReviewResult } from "../../card-pane.ts";

export interface DraftReviewProps {
  id: string;
  /** How many stories Reject would delete, for the question. */
  stories: number;
  onApprove: () => Promise<ReviewResult>;
  onReject: () => Promise<ReviewResult>;
  /** Called once the draft is deleted, so the pane around it can close. */
  onRejected: () => void;
}

/**
 * Approve and Reject on a draft (STORY-51): Approve acts at once; Reject asks first, since it can't be undone. While
 * one is running both are off. A refusal shows in an alert and the buttons come back; on success the draft stops being
 * a draft, so the pane stops showing them. The question is an alert dialog: focus starts on Cancel and stays inside,
 * Escape closes it from anywhere (not the pane behind it), and closing it, or a refusal, puts focus back on Reject.
 */
export function DraftReview({ id, stories, onApprove, onReject, onRejected }: DraftReviewProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const reject = useRef<HTMLButtonElement>(null);
  const back = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const question = useId();

  useEffect(() => {
    if (asking) cancel.current?.focus();
    else if (back.current) {
      back.current = false;
      reject.current?.focus();
    }
  }, [asking]);

  // While the question is open: Escape closes it wherever focus is, and focus can't leave it.
  useEffect(() => {
    if (!asking) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      back.current = true;
      setAsking(false);
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
  }, [asking]);

  const run = async (act: () => Promise<ReviewResult>, done?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await act();
      if (result.ok) done?.();
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      back.current = true;
      setAsking(false);
    }
  };

  const closeAsk = () => {
    back.current = true;
    setAsking(false);
  };

  return (
    <>
      {!asking && (
        <div className="draft-review">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void run(onApprove)}>
            {CARD_COPY.approve}
          </button>
          <button
            ref={reject}
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setError(null);
              setAsking(true);
            }}
          >
            {CARD_COPY.reject}
          </button>
        </div>
      )}
      {asking && (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={dialog}
          className="draft-ask"
          role="alertdialog"
          aria-label={CARD_COPY.reject}
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
          <p id={question}>{CARD_COPY.rejectAsk(id, stories)}</p>
          <div className="send-back-actions">
            <button type="button" className="btn" aria-disabled={busy} onClick={() => void run(onReject, onRejected)}>
              {CARD_COPY.rejectConfirm}
            </button>
            <button ref={cancel} type="button" className="btn" onClick={closeAsk}>
              {CARD_COPY.rejectCancel}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="card-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
