import { createContext, useContext, useState } from "react";
import { ACTION_COPY, type ActionRequest } from "@featra/work-format/action-request";
import type { ApprovalAnswer } from "@featra/work-format/approvals";
import { CHAT_COPY } from "../../chats.ts";
import { DenyWithReason } from "./DenyWithReason.tsx";

/** Puts text on the clipboard (the host's `app.copyText`); App provides it. Default: nothing is copied. */
export const CopyTextContext = createContext<(text: string) => void>(() => {});

/**
 * An agent's `request_action` (STORY-68), in its chat and the Inbox: what to do and why, the steps in order, each
 * command with a Copy button, then Done, or Can't do it with an optional reason the agent is sent. Featra never runs a
 * command: Copy puts it on the clipboard, for the user to run themselves.
 */
export function ActionRequestPrompt({
  title,
  why,
  steps,
  story = null,
  subagent = null,
  onAnswer,
}: ActionRequest & {
  story?: string | null;
  subagent?: string | null;
  onAnswer: (answer: ApprovalAnswer) => Promise<string | null>;
}) {
  const copyText = useContext(CopyTextContext);
  const [copied, setCopied] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(a: ApprovalAnswer) {
    if (busy) return;
    setBusy(true);
    setError(await onAnswer(a));
    setBusy(false);
  }
  const copy = (n: number, command: string) => {
    copyText(command);
    setCopied(n);
  };

  return (
    <div className="chat-approval action-request" role="group" aria-label={title}>
      {story && <p className="meta">{CHAT_COPY.askedFor(story)}</p>}
      {subagent && <p className="meta">{CHAT_COPY.askedBySubagent(subagent)}</p>}
      <h3 className="action-request-title">{title}</h3>
      {why && <p className="action-request-why">{why}</p>}
      <ol className="action-request-steps">
        {steps.map((step, i) => (
          // The steps never change for the card's life and may repeat their text: their place is who they are.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={i}>
            <p>{step.text}</p>
            {step.command !== undefined && (
              <div className="action-request-command">
                <code>{step.command}</code>
                <button
                  type="button"
                  className="btn"
                  aria-label={ACTION_COPY.copyLabel(i + 1)}
                  onClick={() => copy(i + 1, step.command ?? "")}
                >
                  {copied === i + 1 ? ACTION_COPY.copied : ACTION_COPY.copy}
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="chat-approval-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void answer({ choice: "allow" })}>
          {ACTION_COPY.done}
        </button>
        <DenyWithReason
          label={ACTION_COPY.reason}
          hint={ACTION_COPY.reasonHint}
          action={ACTION_COPY.cantDo}
          busy={busy}
          onDeny={(a) => void answer(a)}
        />
      </div>
      {/* Copy's "Copied" is said to screen readers too, politely, as the button's words change. */}
      <p className="sr-only" role="status" aria-live="polite">
        {copied === null ? "" : ACTION_COPY.copiedStep(copied)}
      </p>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
