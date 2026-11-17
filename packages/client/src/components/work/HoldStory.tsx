import { MERGE_COPY } from "@featra/work-format/merge-copy";
import type { ReviewResult } from "../../card-pane.ts";
import { useAction } from "./useAction.ts";

/** What Hold calls: the story's id, and whether it is to be held. */
export type HoldAction = (id: string, held: boolean) => Promise<ReviewResult>;

/**
 * Hold, a toggle that keeps a story from merging on its own (STORY-61), in its card pane and its Work row while
 * auto-merge is on (`held` is left out otherwise). A held story's Work row says Held, so it is easy to spot. The user's own
 * action, with no confirmation; a refusal shows in one sentence next to the toggle, which stays.
 */
export function HoldStory({ id, held, hold }: { id: string; held: boolean | undefined; hold: HoldAction }) {
  const { busy, error, run } = useAction();
  if (held === undefined && !error) return null;
  return (
    <span className="story-action">
      {held !== undefined && (
        <button
          type="button"
          className="review-draft"
          disabled={busy}
          aria-pressed={held}
          aria-label={MERGE_COPY.holdOf(id)}
          onClick={() => void run(() => hold(id, !held))}
        >
          {MERGE_COPY.hold}
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
