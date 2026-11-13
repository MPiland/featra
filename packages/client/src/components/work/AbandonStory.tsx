import { useEffect, useRef, useState } from "react";
import { ABANDON_COPY, atRisk, warningLines, type AbandonWarning } from "@featra/work-format/abandon-copy";
import type { AbandonCheck, MergeResult } from "../../card-pane.ts";
import { ConfirmAsk } from "./ConfirmAsk.tsx";

/** What Abandon calls: the warning for story `id`, then the abandon the user confirmed with its token. */
export interface AbandonActions {
  check: (id: string) => Promise<AbandonCheck>;
  abandon: (id: string, keep: boolean, token: string) => Promise<MergeResult>;
}

export interface AbandonStoryProps {
  id: string;
  abandonable: boolean;
  actions: AbandonActions;
  /** Called once the card is discarded, so the pane around it can close. */
  onDiscarded: () => void;
}

/**
 * Abandon for a story that isn't merged or done (STORY-58), in its card pane only: it can't be undone, so it asks
 * first, in the inline question a draft's Reject uses. The question says what would be lost (uncommitted files,
 * commits not pushed, the PR it closes) and what goes, and offers Keep as Cancelled or Discard card. A refusal shows in
 * one sentence and focus goes back to Abandon; once abandoned, what couldn't be removed is said in its place.
 */
export function AbandonStory({ id, abandonable, actions, onDiscarded }: AbandonStoryProps) {
  const [warning, setWarning] = useState<AbandonWarning | null>(null);
  const [busy, setBusy] = useState<"checking" | "abandoning" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remains, setRemains] = useState<string[]>([]);
  const button = useRef<HTMLButtonElement>(null);
  const back = useRef(false);

  useEffect(() => {
    if (warning === null && busy === null && back.current) {
      back.current = false;
      button.current?.focus();
    }
  }, [warning, busy]);

  if (!abandonable && busy === null && warning === null && !error && remains.length === 0) return null;

  /** Says why, and puts focus back on Abandon. */
  const refused = (why: unknown) => {
    setError(why instanceof Error ? why.message : String(why));
    back.current = true;
  };

  const ask = async () => {
    if (busy) return;
    setBusy("checking");
    setError(null);
    setRemains([]);
    try {
      const result = await actions.check(id);
      if (result.ok) setWarning(result.warning);
      else refused(result.error);
    } catch (err) {
      refused(err);
    } finally {
      setBusy(null);
    }
  };

  const go = async (keep: boolean) => {
    if (busy || !warning) return;
    setBusy("abandoning");
    setError(null);
    try {
      const result = await actions.abandon(id, keep, warning.token);
      if (!result.ok) refused(result.error);
      else if (keep) setRemains(result.remains);
      else onDiscarded();
    } catch (err) {
      refused(err);
    } finally {
      setWarning(null);
      setBusy(null);
    }
  };

  const close = () => {
    back.current = true;
    setWarning(null);
  };

  const lines = warning ? warningLines(warning) : null;
  return (
    <span className="accept-story">
      {warning === null && (abandonable || busy !== null) && (
        <button
          ref={button}
          type="button"
          className="btn"
          disabled={busy !== null}
          aria-label={ABANDON_COPY.abandonOf(id)}
          onClick={() => void ask()}
        >
          {busy === "checking" ? ABANDON_COPY.checking : ABANDON_COPY.abandon}
        </button>
      )}
      {warning && lines && (
        <ConfirmAsk
          label={ABANDON_COPY.abandon}
          cancel={ABANDON_COPY.cancel}
          onCancel={close}
          actions={
            <>
              <button type="button" className="btn" aria-disabled={busy !== null} onClick={() => void go(true)}>
                {busy === "abandoning" ? ABANDON_COPY.abandoning : ABANDON_COPY.keep}
              </button>
              <button type="button" className="btn" aria-disabled={busy !== null} onClick={() => void go(false)}>
                {ABANDON_COPY.discard}
              </button>
            </>
          }
        >
          <p>{ABANDON_COPY.ask(id)}</p>
          {atRisk(warning) && (
            <>
              <p>{ABANDON_COPY.loses}</p>
              <ul className="meta">
                {lines.risks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
          <p className="meta">{lines.removes}</p>
        </ConfirmAsk>
      )}
      {error && (
        <span className="card-error" role="alert">
          {error}
        </span>
      )}
      {remains.length > 0 && (
        <span className="meta" role="status">
          {remains.join(" ")}
        </span>
      )}
    </span>
  );
}
