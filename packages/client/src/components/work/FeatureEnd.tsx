import { useId, useState, type ReactNode } from "react";
import { FEATURE_END_COPY, type FeatureApproval } from "@featra/work-format/feature-end-copy";
import type { MergeResult } from "../../card-pane.ts";
import { useAction } from "./useAction.ts";

export interface FeatureEndActions {
  approve: () => Promise<MergeResult>;
  merge: () => Promise<MergeResult>;
}

/**
 * A feature's end on its review screen (STORY-70): Approve accepts it and merges it to main in one click, off with the
 * first reason that stops it beside it, and as its description. Once accepted without the merge (it failed), Merge to
 * main is the retry, with the same reasons. A PR merged on GitHub that the click finishes says so in the reason's place.
 * Both are the user's own action, with no confirmation. A failure shows in one sentence; once merged, the screen says
 * so, with what stays to do. children ("Not yet", STORY-71) sit beside the button until the feature is merged.
 */
export function FeatureEnd({
  id,
  approval,
  actions,
  children,
}: {
  id: string;
  approval: FeatureApproval | null;
  actions: FeatureEndActions;
  children?: ReactNode;
}) {
  const action = useAction();
  const [remains, setRemains] = useState<string[]>([]);
  const reasonId = useId();
  const run = (call: () => Promise<MergeResult>) => async () => {
    const result = await call();
    if (result.ok) setRemains(result.remains);
    return result;
  };
  if (!approval) return null;
  const { step, base } = approval;
  const reason = step !== "merged" && !action.busy ? (approval.reason ?? approval.note ?? null) : null;
  const approving = step === "approve";
  return (
    <div className="rv-end" role="group" aria-label={FEATURE_END_COPY.approve}>
      {step === "merged" ? (
        <span className="rv-merged" role="status">
          {FEATURE_END_COPY.merged(base)}
        </span>
      ) : (
        <button
          type="button"
          className="btn primary"
          disabled={action.busy || !approval.ready}
          aria-label={approving ? FEATURE_END_COPY.approveOf(id) : FEATURE_END_COPY.mergeOf(id, base)}
          aria-describedby={reason ? reasonId : undefined}
          onClick={() => void action.run(run(approving ? actions.approve : actions.merge))}
        >
          {action.busy ? FEATURE_END_COPY.merging : approving ? FEATURE_END_COPY.approve : FEATURE_END_COPY.merge(base)}
        </button>
      )}
      {step !== "merged" && children}
      {reason && (
        <span className="meta" id={reasonId}>
          {reason}
        </span>
      )}
      {action.error && (
        <span className="card-error" role="alert">
          {action.error}
        </span>
      )}
      {remains.length > 0 && <span className="meta rv-remains">{remains.join(" ")}</span>}
    </div>
  );
}
