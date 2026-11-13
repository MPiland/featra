import { useState } from "react";
import type { ApprovalAnswer } from "@featra/work-format/approvals";
import { BUG_COPY, type BugPlacements, type BugReport } from "@featra/work-format/bug-copy";
import { PlacementSelect } from "../bugs/PlacementSelect.tsx";

/**
 * The Dev Lead's `report_bug` (STORY-13), in its chat and the Inbox: the bug, where Featra proposes it goes, a way to
 * change that, then Create or Cancel. Create is the approval, with the place picked; Cancel tells the Dev Lead so.
 * Nothing is written until Create.
 */
export function BugReportPrompt({
  title,
  description,
  cause,
  proposed,
  choices,
  onAnswer,
}: BugReport &
  BugPlacements & {
    onAnswer: (answer: ApprovalAnswer) => Promise<string | null>;
  }) {
  const [placement, setPlacement] = useState(proposed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function answer(a: ApprovalAnswer) {
    if (busy) return;
    setBusy(true);
    setError(await onAnswer(a));
    setBusy(false);
  }
  return (
    <div className="chat-approval bug-report" role="group" aria-label={BUG_COPY.ask(title)}>
      <p className="meta">{BUG_COPY.asked}</p>
      <h3>{BUG_COPY.ask(title)}</h3>
      {description && <p className="bug-description">{description}</p>}
      {cause && <p className="meta">{BUG_COPY.causedBy(cause)}</p>}
      <PlacementSelect placements={{ proposed, choices }} value={placement} onChange={setPlacement} disabled={busy} />
      <div className="chat-approval-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void answer({ choice: "allow", option: placement })}
        >
          {BUG_COPY.create}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void answer({ choice: "deny" })}>
          {BUG_COPY.cancel}
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
