import { useState } from "react";
import type { ApprovalAnswer } from "@featra/work-format/approvals";
import { isRecord } from "@featra/work-format/guards";
import { MERGE_COPY } from "@featra/work-format/merge-copy";

/** The story and feature branch a `request_merge` card names; null when its input isn't one. */
export function mergeAsk(input: unknown): { story: string; into: string } | null {
  if (!isRecord(input) || typeof input.story !== "string" || typeof input.into !== "string") return null;
  return { story: input.story, into: input.into };
}

/**
 * The Dev Lead's `request_merge` (STORY-12), in its chat and the Inbox: the question, Merge and Decline. Merge is the
 * approval, and it merges; Decline tells the Dev Lead so. Nothing else is offered: a merge is never allowed for a chat.
 */
export function MergeRequestPrompt({
  story,
  into,
  onAnswer,
}: {
  story: string;
  into: string;
  onAnswer: (answer: ApprovalAnswer) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function answer(a: ApprovalAnswer) {
    if (busy) return;
    setBusy(true);
    setError(await onAnswer(a));
    setBusy(false);
  }
  return (
    <div className="chat-approval" role="group" aria-label={MERGE_COPY.ask(story, into)}>
      <p className="meta">{MERGE_COPY.asked}</p>
      <h3>{MERGE_COPY.ask(story, into)}</h3>
      <div className="chat-approval-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void answer({ choice: "allow" })}>
          {MERGE_COPY.merge}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void answer({ choice: "deny" })}>
          {MERGE_COPY.decline}
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
