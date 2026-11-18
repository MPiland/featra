import { useId } from "react";
import { BUG_COPY } from "@featra/work-format/bug-copy";
import type { StoryRow } from "@featra/work-format/work-list";
import { WORK_COPY } from "../../work-list.ts";
import { ColumnHeaders, Story } from "./FeatureRows.tsx";

/**
 * The project bug list (STORY-13): bugs under no feature, on the story columns, after the epics. A bug filed on a
 * feature stays under it; a Done feature's bugs land here, so the feature stays Done.
 */
export function ProjectBugs({ bugs }: { bugs: readonly StoryRow[] }) {
  const heading = useId();
  return (
    <section className="epicblk project-bugs" aria-labelledby={heading}>
      <div className="epich">
        <h2 id={heading}>{BUG_COPY.projectBugs}</h2>
      </div>
      {bugs.length === 0 ? (
        <p className="meta">{BUG_COPY.noProjectBugs}</p>
      ) : (
        <div className="fl" role="table" aria-label={BUG_COPY.projectBugs}>
          <ColumnHeaders names={WORK_COPY.storyColumns} className="prow phdr" />

          {bugs.map((b) => (
            <Story key={b.id} story={b} />
          ))}
        </div>
      )}
    </section>
  );
}
