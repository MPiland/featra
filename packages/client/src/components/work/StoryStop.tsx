import type { ReviewResult } from "../../card-pane.ts";
import { WORK_COPY } from "../../work-list.ts";
import { useAction } from "./useAction.ts";

/** What Stop and Resume call: the story's id. Both are the user's own action, with no confirmation (STORY-53). */
export interface StopActions {
  stop: (id: string) => Promise<ReviewResult>;
  resume: (id: string) => Promise<ReviewResult>;
}

/** What the story's session is doing, as far as Stop and Resume go. */
export interface StopState {
  /** The card carries the Stopped mark. */
  stopped: boolean;
  /** Resume applies: the story is Stopped, or its idle session ended without finishing (and it is In Progress). */
  resumable: boolean;
  /** The session has a turn running, or waiting for a slot. */
  active: boolean;
}

/**
 * A story agent's Stop while its turn runs or waits, its Stopped mark, and Resume once the turn is over (never before,
 * so it can't be pressed on a turn that is still ending). A refusal shows in one sentence next to the button, which
 * stays. Shown in the story's Work row and in its session, from the same state.
 */
export function StoryStop({ id, state, actions }: { id: string; state: StopState; actions: StopActions }) {
  const { busy, error, run } = useAction();
  const { stopped, resumable, active } = state;
  const resume = resumable && !active;
  if (!stopped && !active && !resume) return null;
  return (
    <span className="story-stop">
      {stopped && (
        <span className="meta" role="status">
          {WORK_COPY.stopped}
        </span>
      )}{" "}
      {resume && (
        <button
          type="button"
          className="review-draft"
          disabled={busy}
          aria-label={WORK_COPY.resumeOf(id)}
          onClick={() => void run(() => actions.resume(id))}
        >
          {WORK_COPY.resume}
        </button>
      )}
      {active && !stopped && (
        <button
          type="button"
          className="review-draft"
          disabled={busy}
          aria-label={WORK_COPY.stopOf(id)}
          onClick={() => void run(() => actions.stop(id))}
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
