import { MERGE_COPY } from "@featra/work-format/merge-copy";

/** Why a story didn't merge on its own (STORY-60), in its card pane and its session: one warning-colored line. */
export function NotMerged({ reason }: { reason: string }) {
  return (
    <p className="meta not-merged" role="status">
      {MERGE_COPY.notMerged(reason)}
    </p>
  );
}
