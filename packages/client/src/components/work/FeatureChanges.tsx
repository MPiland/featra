import { CHANGES_COPY, type FeatureChanges as Changes } from "@featra/work-format/changes";
import type { ReviewResult, SendBackResult } from "../../card-pane.ts";
import { SendBack } from "./SendBack.tsx";
import { useAction } from "./useAction.ts";

/** "Not yet" beside Approve (STORY-71): the reason goes to the feature's Dev Lead chat as the user's message. */
export function NotYet({ onSend }: { onSend: (reason: string) => Promise<SendBackResult> }) {
  return (
    <SendBack
      onSend={(reason) => onSend(reason)}
      unavailable={null}
      copy={{
        open: CHANGES_COPY.notYet,
        form: CHANGES_COPY.notYet,
        reason: CHANGES_COPY.reason,
        hint: CHANGES_COPY.hint,
        send: CHANGES_COPY.send,
        cancel: CHANGES_COPY.cancel,
      }}
    />
  );
}

/**
 * What the user asked to change before approving (STORY-71): "Changes asked" with each reason and Dismiss while the
 * Dev Lead hasn't replied; its reply once it marked them handled, and "Changes asked" gone. Nothing when none are asked.
 */
export function ChangesAsked({
  changes,
  onDismiss,
}: {
  changes: Changes | null;
  onDismiss: () => Promise<ReviewResult>;
}) {
  const action = useAction();
  if (!changes) return null;
  if (changes.reply)
    return (
      <section className="card-sec rv-summary rv-changes" aria-label={CHANGES_COPY.handled}>
        <h3 className="sh">
          <span>{CHANGES_COPY.handled}</span>
          <span className="rv-by">{CHANGES_COPY.byLead}</span>
        </h3>
        <p className="rv-summary-text">{changes.reply.text}</p>
      </section>
    );
  return (
    <section className="card-sec rv-changes rv-asked" aria-label={CHANGES_COPY.asked}>
      <h3 className="sh">
        <span className="rv-asked-badge" role="status">
          {CHANGES_COPY.asked}
        </span>
        <button type="button" className="btn" disabled={action.busy} onClick={() => void action.run(onDismiss)}>
          {CHANGES_COPY.dismiss}
        </button>
      </h3>
      <ul className="rv-asked-list">
        {changes.asked.map((n) => (
          <li key={`${n.at}-${n.text}`} className="rv-summary-text">
            {n.text}
          </li>
        ))}
      </ul>
      {action.error && (
        <p className="card-error" role="alert">
          {action.error}
        </p>
      )}
    </section>
  );
}
