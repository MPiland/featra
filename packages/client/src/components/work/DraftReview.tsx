import { useEffect, useRef, useState } from "react";
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
 * a draft, so the pane stops showing them. Escape in the question closes the question, not the pane.
 */
export function DraftReview({ id, stories, onApprove, onReject, onRejected }: DraftReviewProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const reject = useRef<HTMLButtonElement>(null);
  const back = useRef(false);

  useEffect(() => {
    if (asking) cancel.current?.focus();
    else if (back.current) {
      back.current = false;
      reject.current?.focus();
    }
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
          className="draft-ask"
          role="group"
          aria-label={CARD_COPY.reject}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            closeAsk();
          }}
        >
          <p>{CARD_COPY.rejectAsk(id, stories)}</p>
          <div className="send-back-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void run(onReject, onRejected)}>
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
