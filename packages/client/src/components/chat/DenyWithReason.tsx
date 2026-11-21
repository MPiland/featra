import { useState } from "react";
import { DENY_REASON_MAX, type ApprovalAnswer } from "@featra/work-format/approvals";

/** The Deny answer, with the user's reason when they gave one. */
export const denyAnswer = (reason: string): ApprovalAnswer =>
  reason.trim() ? { choice: "deny", reason: reason.trim() } : { choice: "deny" };

/**
 * A request's optional reason and its Deny button (STORY-45; STORY-68's Can't do it): Enter in the reason denies too.
 * The reason is as long as the agent is sent, no longer.
 */
export function DenyWithReason({
  label,
  hint,
  action,
  busy,
  onDeny,
}: {
  /** The reason field's accessible name. */
  label: string;
  hint: string;
  /** The button's words: Deny, or Can't do it. */
  action: string;
  busy: boolean;
  onDeny: (answer: ApprovalAnswer) => void;
}) {
  const [reason, setReason] = useState("");
  const deny = () => onDeny(denyAnswer(reason));
  return (
    <>
      <input
        type="text"
        className="text-field chat-approval-reason"
        aria-label={label}
        placeholder={hint}
        maxLength={DENY_REASON_MAX}
        value={reason}
        disabled={busy}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          deny();
        }}
      />
      <button type="button" className="btn" disabled={busy} onClick={deny}>
        {action}
      </button>
    </>
  );
}
