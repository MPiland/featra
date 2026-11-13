import { useId, useState } from "react";
import { FEATURE_END_COPY, type CardFeatureEnd } from "@featra/work-format/feature-end-copy";
import type { MergeResult, ReviewResult } from "../../card-pane.ts";
import { useAction } from "./useAction.ts";

export interface FeatureEndActions {
  accept: () => Promise<ReviewResult>;
  merge: () => Promise<MergeResult>;
}

/**
 * A feature's end in its card pane (STORY-14): Accept once every story and bug under it is Done or Cancelled, then
 * Merge to main (the project's base branch), which is off with the reason beside it, and as its description, until
 * nothing stops it. Both are the user's own action, with no confirmation. A refusal shows in one sentence next to the
 * button; once merged, what stays to do is said.
 */
export function FeatureEnd({
  id,
  end,
  actions,
}: {
  id: string;
  /** Undefined once the feature isn't in progress: what the merge left to do still shows. */
  end: CardFeatureEnd | undefined;
  actions: FeatureEndActions;
}) {
  const accepting = useAction();
  const merging = useAction();
  const [remains, setRemains] = useState<string[]>([]);
  const reasonId = useId();
  const merge = async () => {
    const result = await actions.merge();
    if (result.ok) setRemains(result.remains);
    return result;
  };
  const error = accepting.error ?? merging.error;
  if (!end && !error && remains.length === 0) return null;
  const accepted = end?.accepted === true;
  const reason = accepted && end.blocked && !merging.busy ? end.blocked : null;
  return (
    <span className="accept-story">
      {end?.acceptable && (
        <button
          type="button"
          className="review-draft"
          disabled={accepting.busy}
          aria-label={FEATURE_END_COPY.acceptOf(id)}
          onClick={() => void accepting.run(actions.accept)}
        >
          {FEATURE_END_COPY.accept}
        </button>
      )}
      {accepted && (
        <button
          type="button"
          className="review-draft"
          disabled={merging.busy || !end.mergeable}
          aria-label={FEATURE_END_COPY.mergeOf(id, end.base)}
          aria-describedby={reason ? reasonId : undefined}
          onClick={() => void merging.run(merge)}
        >
          {merging.busy ? FEATURE_END_COPY.merging : FEATURE_END_COPY.merge(end.base)}
        </button>
      )}
      {reason && (
        <span className="meta" id={reasonId}>
          {reason}
        </span>
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
