import { useState } from "react";
import { MERGE_COPY } from "@featra/work-format/merge-copy";
import type { MergeResult } from "../../card-pane.ts";
import { useAction } from "./useAction.ts";

/** What Merge calls: the story's id. */
export type MergeAction = (id: string) => Promise<MergeResult>;

/**
 * Merge for a Verified story (STORY-12), beside Accept and Send back: in its card pane, its Work row and its session,
 * from the same state. The user's own action, with no confirmation. A refusal or conflict shows in one sentence next to
 * the button, which stays; once merged, what couldn't be removed is said in its place.
 */
export function MergeStory({ id, mergeable, merge }: { id: string; mergeable: boolean; merge: MergeAction }) {
  const { busy, error, run } = useAction();
  const [remains, setRemains] = useState<string[]>([]);
  if (!mergeable && !busy && !error && remains.length === 0) return null;
  const go = async () => {
    const result = await merge(id);
    if (result.ok) setRemains(result.remains);
    return result;
  };
  return (
    <span className="accept-story">
      {(mergeable || busy) && (
        <button
          type="button"
          className="review-draft"
          disabled={busy}
          aria-label={`${MERGE_COPY.merge} ${id}`}
          onClick={() => void run(go)}
        >
          {busy ? MERGE_COPY.merging : MERGE_COPY.merge}
        </button>
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
