import { MERGE_COPY } from "@featra/work-format/merge-copy";
import { WarningIcon } from "../icons.tsx";

/**
 * Why a story didn't merge on its own (STORY-60), in its card pane and its session: a warning, not an error. The warn
 * colour, an icon and a light warn wash with a left rule, so it reads as a problem without alarm (STORY-62).
 */
export function NotMerged({ reason }: { reason: string }) {
  return (
    <p className="not-merged" role="status">
      <WarningIcon />
      {MERGE_COPY.notMerged(reason)}
    </p>
  );
}
