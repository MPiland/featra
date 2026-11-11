import { useState } from "react";
import type { ReviewResult } from "../../card-pane.ts";
import { WORK_COPY } from "../../work-list.ts";

/** What Stop and Resume call: the story's id. Both are the user's own action, with no confirmation (STORY-53). */
export interface StopActions {
  stop: (id: string) => Promise<ReviewResult>;
  resume: (id: string) => Promise<ReviewResult>;
}

/**
 * A story agent's Stopped mark with Resume, or Stop while its turn runs or waits. A refusal shows in one sentence next to
 * the button, which stays. Shown in the story's Work row and in its session, from the same state.
 */
export function StoryStop({
  id,
  stopped,
  running,
  actions,
}: {
  id: string;
  stopped: boolean;
  running: boolean;
  actions: StopActions;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (call: (id: string) => Promise<ReviewResult>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await call(id);
      if (!result.ok) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  if (!stopped && !running) return null;
  return (
    <span className="story-stop">
      {stopped ? (
        <>
          <span className="meta" role="status">
            {WORK_COPY.stopped}
          </span>{" "}
          <button
            type="button"
            className="review-draft"
            disabled={busy}
            aria-label={WORK_COPY.resumeOf(id)}
            onClick={() => void run(actions.resume)}
          >
            {WORK_COPY.resume}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="review-draft"
          disabled={busy}
          aria-label={WORK_COPY.stopOf(id)}
          onClick={() => void run(actions.stop)}
        >
          {WORK_COPY.stop}
        </button>
      )}
      {error && (
        <span className="card-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
