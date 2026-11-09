import { useState } from "react";
import type { ApprovalAnswer } from "@featra/work-format/approvals";
import { CHAT_COPY } from "../../chats.ts";

interface ApprovalPromptProps {
  name: string;
  input: unknown;
  /** Allow for this chat is offered: there is a rule for the call, and the agent didn't say it may only be allowed once. */
  forChat: boolean;
  /** What Allow for this chat covers, as its button's description. */
  covers: string | null;
  /** Sends the answer; resolves with why it wasn't taken, or null. */
  onAnswer: (answer: ApprovalAnswer) => Promise<string | null>;
}

export const showInput = (input: unknown) => (typeof input === "string" ? input : JSON.stringify(input, null, 2));

/**
 * A tool call waiting on the user (STORY-45): its input, Allow, Allow for this chat and Deny, with an optional reason
 * for Deny that the agent is sent. Native controls in reading order, so Tab reaches each; Enter in the reason denies.
 */
export function ApprovalPrompt({ name, input, forChat, covers, onAnswer }: ApprovalPromptProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(a: ApprovalAnswer) {
    if (busy) return;
    setBusy(true);
    const why = await onAnswer(a);
    setError(why);
    setBusy(false);
  }
  const deny = () => answer(reason.trim() ? { choice: "deny", reason: reason.trim() } : { choice: "deny" });

  return (
    <div className="chat-approval" role="group" aria-label={`${CHAT_COPY.approve} ${name}`}>
      <h3>{CHAT_COPY.input}</h3>
      <pre>{showInput(input)}</pre>
      <div className="chat-approval-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void answer({ choice: "allow" })}>
          {CHAT_COPY.allow}
        </button>
        {forChat && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            title={covers ?? undefined}
            onClick={() => void answer({ choice: "allow-chat" })}
          >
            {CHAT_COPY.allowForChat}
          </button>
        )}
        <input
          type="text"
          className="text-field chat-approval-reason"
          aria-label={CHAT_COPY.denyReason}
          placeholder={CHAT_COPY.denyReasonHint}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void deny();
          }}
        />
        <button type="button" className="btn" disabled={busy} onClick={() => void deny()}>
          {CHAT_COPY.deny}
        </button>
      </div>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
