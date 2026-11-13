import { useEffect, useRef, useState } from "react";
import { CARD_COPY, type ReviewResult } from "../../card-pane.ts";
import { ConfirmAsk } from "./ConfirmAsk.tsx";

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
  const reject = useRef<HTMLButtonElement>(null);
  const back = useRef(false);

  useEffect(() => {
    if (!asking && back.current) {
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
        <ConfirmAsk
          label={CARD_COPY.reject}
          cancel={CARD_COPY.rejectCancel}
          onCancel={closeAsk}
          actions={
            <button type="button" className="btn" aria-disabled={busy} onClick={() => void run(onReject, onRejected)}>
              {CARD_COPY.rejectConfirm}
            </button>
          }
        >
          <p>{CARD_COPY.rejectAsk(id, stories)}</p>
        </ConfirmAsk>
      )}
      {error && (
        <p className="card-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
