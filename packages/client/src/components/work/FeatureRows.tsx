import { useContext, useState } from "react";
import type { FeatureRow, StoryRow, Tone } from "@featra/work-format/work-list";
import { featureStatusLabel, PROGRESS_COPY, WORK_COPY } from "../../work-list.ts";
import { BugIcon, ChevronRightIcon, ProgressIcon } from "../icons.tsx";
import { Progress } from "./Bar.tsx";
import { useCardSelection } from "./card-selection.tsx";
import { useFeatureOpen } from "./open-features.tsx";
import { useReviewDraft } from "./review-draft.tsx";
import { ReviewButton } from "./ReviewButton.tsx";
import { StaleMark } from "./stale-mark.tsx";
import { MERGE_COPY } from "@featra/work-format/merge-copy";
import { AcceptStory } from "./AcceptStory.tsx";
import { HoldStory } from "./HoldStory.tsx";
import { MergeStory } from "./MergeStory.tsx";
import { PrChip } from "./PrChip.tsx";
import { StoryAgent, StoryAgentsContext } from "./story-agents.tsx";
import { shownCells } from "../../work-columns.ts";
import { useWorkColumns } from "./work-columns-context.tsx";

export const ticks = (c: { done: number; total: number }) => (c.total ? `${c.done} / ${c.total}` : WORK_COPY.none);

export function Status({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`st tone-${tone}`}>
      <span className="dot" aria-hidden="true" />
      <span className="st-label">{label}</span>
    </span>
  );
}

function Scope({ added, addedBreakdown, openBugs }: FeatureRow["scope"]) {
  const parts = [
    added > 0 && (
      <span key="added" className="scope-added">
        {addedBreakdown}
      </span>
    ),
    openBugs > 0 && (
      <span key="bugs" className="scope-bugs">
        {WORK_COPY.bugs(openBugs)}
      </span>
    ),
  ].filter(Boolean);
  if (!parts.length) return <span className="meta">{WORK_COPY.none}</span>;
  return <>{parts.flatMap((p, i) => (i ? [" · ", p] : [p]))}</>;
}

/** A story or bug row on the shared grid; a bug shows the bug icon (STORY-13). */
export function Story({ story }: { story: StoryRow }) {
  const { selected, paneId, open } = useCardSelection();
  const shown = selected === story.id;
  const agents = useContext(StoryAgentsContext);
  const columns = useWorkColumns();
  // Send back's form opens below the row, across its width, not in the name cell.
  const [below, setBelow] = useState<HTMLElement | null>(null);
  const pr = story.pr ? <PrChip url={story.pr} status={story.prStatus} compact /> : null;
  // With the PR column hidden (the pane open, or a narrow list), the PR moves to the story's line of marks.
  const prInMeta = pr !== null && !columns.includes("scope");
  const name = (
    <span key="name" role="cell" className="pn">
      <span className="pn-title">
        {story.type === "bug" && (
          <span className="row-bug" role="img" aria-label={WORK_COPY.bug}>
            <BugIcon />
          </span>
        )}
        <button
          type="button"
          className="row-open"
          aria-expanded={shown}
          aria-controls={shown ? paneId : undefined}
          onClick={() => open(story.id)}
        >
          {story.title}
        </button>
        {story.added && <span className="meta scope-added"> · {WORK_COPY.addedLater}</span>}
        <StaleMark id={story.id} />
      </span>
      {/* Its session, actions and marks: one line under the title, on the title's left edge, that never wraps. */}
      <span className="story-meta">
        <StoryAgent id={story.id} />
        {story.awaiting && <AcceptStory id={story.id} actions={agents.acceptance} into={below} />}
        <MergeStory id={story.id} mergeable={story.mergeable} merge={agents.merge} />
        <HoldStory id={story.id} held={story.held} hold={agents.hold} />
        {story.held && <span className="meta">· {MERGE_COPY.held}</span>}
        {story.merged && <span className="meta">· {MERGE_COPY.merged}</span>}
        {story.reported && <span className="meta">· {WORK_COPY.reported}</span>}
        {prInMeta && pr}
      </span>
    </span>
  );
  const cells = [
    name,
    <span key="stage" role="cell">
      <Status tone={story.tone} label={story.stage} />
    </span>,
    <span key="criteria" role="cell">
      {ticks(story.criteria)}
    </span>,
    <span key="tasks" role="cell">
      {ticks(story.tasks)}
    </span>,
    <span key="pr" role="cell">
      {pr ?? <span className="meta">{WORK_COPY.none}</span>}
    </span>,
  ];
  return (
    <>
      <div className={shown ? "prow shown" : "prow"} role="row" data-card={story.id}>
        <span aria-hidden="true" />
        {shownCells(cells, columns)}
      </div>
      <div role="none" ref={setBelow} className="prow-below" />
    </>
  );
}

/** A feature on the shared grid; it opens to its stories, which use the same columns. The list keeps it open (BUG-25). */
export function Feature({ feature }: { feature: FeatureRow }) {
  const [open, toggle] = useFeatureOpen(feature.id);
  const review = useReviewDraft();
  const { open: openCard, paneId, progress, openProgress, close } = useCardSelection();
  const title = feature.id === null ? WORK_COPY.noFeature : feature.title;
  const showing = feature.id !== null && progress === feature.id;
  const columns = useWorkColumns();
  const progressBar = (
    <Progress
      label={feature.progress.label}
      segments={feature.bar}
      total={feature.progress.total}
      breakdown={feature.breakdown}
    />
  );
  return (
    <>
      <div className={open ? "frow open" : "frow"} role="row" data-card={feature.id ?? undefined}>
        <span aria-hidden="true" />
        <span role="cell" className="fn">
          <button type="button" className="row-toggle" aria-expanded={open} onClick={toggle}>
            <ChevronRightIcon />
            <span>{title}</span>
          </button>
          {feature.review && (
            <span className="badge-review" role="img" aria-label={`${feature.id} draft, needs review`}>
              {WORK_COPY.review}
            </span>
          )}
          {feature.review && feature.draftedBy && (
            <button
              type="button"
              className="review-draft"
              aria-label={WORK_COPY.reviewDraftOf(feature.id ?? "")}
              onClick={() => review(feature.draftedBy ?? "", feature.id ?? "")}
            >
              {WORK_COPY.reviewDraft}
            </button>
          )}
          {(feature.status === "approved" || feature.ending) && feature.id && (
            // A feature has no story to open it from: this opens its card, where Start is (STORY-52), or Accept and
            // Merge to main once its end applies (STORY-14).
            <button
              type="button"
              className="review-draft"
              aria-label={WORK_COPY.openFeatureOf(feature.id)}
              onClick={() => openCard(feature.id ?? "")}
            >
              {WORK_COPY.openFeature}
            </button>
          )}
          <ReviewButton id={feature.id} status={feature.status} icon />
          {feature.id && openProgress && (
            // Its progress pane (STORY-24): counts, scope, branch and each story, docked like the card pane. An icon,
            // so the name cell still reads as the feature's title.
            <button
              type="button"
              className="row-progress"
              aria-label={PROGRESS_COPY.rowOf(feature.id)}
              title={PROGRESS_COPY.open}
              aria-expanded={showing}
              aria-controls={showing ? paneId : undefined}
              onClick={() => (showing && close ? close() : openProgress(feature.id ?? ""))}
            >
              <ProgressIcon />
            </button>
          )}
          <StaleMark id={feature.id} />
          {/* With the Progress column hidden (the pane open, or a narrow list), the progress joins the name cell at its
              end, as a story's PR joins its line of marks, so the row's room still says something (STORY-62). */}
          {!columns.includes("progress") && <span className="fn-progress">{progressBar}</span>}
        </span>
        {shownCells(
          [
            null,
            <span key="status" role="cell">
              <Status tone={feature.tone} label={featureStatusLabel(feature.status)} />
            </span>,
            <span key="progress" role="cell">
              {progressBar}
            </span>,
            <span key="tasks" role="cell">
              {ticks(feature.tasks)}
            </span>,
            <span key="scope" role="cell">
              <Scope {...feature.scope} />
            </span>,
          ],
          columns,
        )}
      </div>
      {open && (
        // Not a group of its own: the story rows are rows of the epic's table, on its columns.
        <div role="none" className="kidsbox">
          <ColumnHeaders names={WORK_COPY.storyColumns} className="prow phdr" />
          {feature.stories.map((s) => (
            <Story key={s.id} story={s} />
          ))}
        </div>
      )}
    </>
  );
}

/** A header row of the shared grid: the columns shown, by name. */
export function ColumnHeaders({ names, className }: { names: readonly string[]; className: string }) {
  const columns = useWorkColumns();
  return (
    <div className={className} role="row">
      <span aria-hidden="true" />
      {shownCells(names, columns).map((c) => (
        <span key={c} role="columnheader">
          {c}
        </span>
      ))}
    </div>
  );
}
