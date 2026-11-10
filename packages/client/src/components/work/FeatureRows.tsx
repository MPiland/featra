import { useState } from "react";
import type { FeatureRow, StoryRow, Tone } from "@featra/work-format/work-list";
import { featureStatusLabel, WORK_COPY } from "../../work-list.ts";
import { ChevronRightIcon } from "../icons.tsx";
import { Progress } from "./Bar.tsx";
import { useCardSelection } from "./card-selection.tsx";
import { StaleMark } from "./stale-mark.tsx";

const ticks = (c: { done: number; total: number }) => (c.total ? `${c.done} / ${c.total}` : WORK_COPY.none);

function Status({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`st tone-${tone}`}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function Scope({ added, openBugs }: FeatureRow["scope"]) {
  const parts = [
    added > 0 && (
      <span key="added" className="scope-added">
        {WORK_COPY.added(added)}
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

function Story({ story }: { story: StoryRow }) {
  const { selected, paneId, open } = useCardSelection();
  const shown = selected === story.id;
  return (
    <div className={shown ? "prow shown" : "prow"} role="row" data-card={story.id}>
      <span aria-hidden="true" />
      <span role="cell" className="pn">
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
      <span role="cell">
        <Status tone={story.tone} label={story.stage} />
      </span>
      <span role="cell">{ticks(story.criteria)}</span>
      <span role="cell">{ticks(story.tasks)}</span>
      <span role="cell">{story.pr ?? <span className="meta">{WORK_COPY.none}</span>}</span>
    </div>
  );
}

/** A feature on the shared grid; it opens to its stories, which use the same columns. */
export function Feature({ feature }: { feature: FeatureRow }) {
  const [open, setOpen] = useState(false);
  const title = feature.id === null ? WORK_COPY.noFeature : feature.title;
  return (
    <>
      <div className={open ? "frow open" : "frow"} role="row" data-card={feature.id ?? undefined}>
        <span aria-hidden="true" />
        <span role="cell" className="fn">
          <button type="button" className="row-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <ChevronRightIcon />
            <span>{title}</span>
          </button>
          {feature.review && <span className="badge-review">{WORK_COPY.review}</span>}
          <StaleMark id={feature.id} />
        </span>
        <span role="cell">
          <Status tone={feature.tone} label={featureStatusLabel(feature.status)} />
        </span>
        <span role="cell">
          <Progress label={feature.progress.label} segments={feature.bar} total={feature.progress.total} />
        </span>
        <span role="cell">{ticks(feature.tasks)}</span>
        <span role="cell">
          <Scope {...feature.scope} />
        </span>
      </div>
      {open && (
        // Not a group of its own: the story rows are rows of the epic's table, on its columns.
        <div role="none" className="kidsbox">
          <div className="prow phdr" role="row">
            <span aria-hidden="true" />
            {WORK_COPY.storyColumns.map((c) => (
              <span key={c} role="columnheader">
                {c}
              </span>
            ))}
          </div>
          {feature.stories.map((s) => (
            <Story key={s.id} story={s} />
          ))}
        </div>
      )}
    </>
  );
}
