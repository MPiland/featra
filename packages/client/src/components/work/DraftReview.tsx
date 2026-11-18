import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARD_COPY, type ReviewResult } from "../../card-pane.ts";
import { ConfirmAsk } from "./ConfirmAsk.tsx";
import type { Action } from "./useAction.ts";

export interface DraftReviewProps {
  id: string;
  /** How many stories Reject would delete, for the question. */
  stories: number;
  onApprove: () => Promise<ReviewResult>;
  onReject: () => Promise<ReviewResult>;
  /** Called once the draft is deleted, so the pane around it can close. */
  onRejected: () => void;
  /**
   * What runs Approve and Reject, held by the card pane (BUG-31): while one runs the card can stop being a draft and
   * come back (the server writes the approved feature, then puts it back when the commit fails), which unmounts these
   * buttons and mounts them again. Held here, that would forget it is running and drop its error.
   */
  action: Action;
}

/**
 * Approve and Reject on a draft (STORY-51): Approve acts at once; Reject asks first, since it can't be undone. While
 * one is running both are off. A refusal shows in the card pane's alert and the buttons come back; on success the draft
 * stops being a draft, so the pane stops showing them. The question is an alert dialog: focus starts on Cancel and stays
 * inside, Escape closes it from anywhere (not the pane behind it), and closing it, or a refusal, puts focus back on
 * Reject.
 */
export function DraftReview({ id, stories, onApprove, onReject, onRejected, action }: DraftReviewProps) {
  const [asking, setAsking] = useState(false);
  const reject = useRef<HTMLButtonElement>(null);
  const back = useRef(false);
  const { busy } = action;

  useEffect(() => {
    if (!asking && back.current) {
      back.current = false;
      reject.current?.focus();
    }
  }, [asking]);
  // A refusal puts focus on Reject, these buttons mounted again while it ran included (BUG-31): in the commit that shows
  // it, and once Reject is on again (a disabled button takes no focus).
  useLayoutEffect(() => {
    if (action.error && !busy) reject.current?.focus();
  }, [action.error, busy]);

  const run = async (act: () => Promise<ReviewResult>, done?: () => void) => {
    await action.run(act, done);
    back.current = true;
    setAsking(false);
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
              action.clear();
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
    </>
  );
}
