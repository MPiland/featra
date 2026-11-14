import { useId } from "react";
import type { ChatSummary } from "@featra/work-format/chat-list";
import { featureBranch, waitsOnUser, type FeatureBranch } from "@featra/work-format/feature-progress";
import type { FeatureRow, StoryRow } from "@featra/work-format/work-list";
import { CARD_COPY } from "../../card-pane.ts";
import { CHAT_COPY } from "../../chats.ts";
import { featureStatusLabel, PROGRESS_COPY, WORK_COPY } from "../../work-list.ts";
import { BugIcon } from "../icons.tsx";
import { Progress } from "./Bar.tsx";
import { BurnUpChart } from "./BurnUpChart.tsx";
import { DockedAside } from "./DockedAside.tsx";
import { Status, ticks } from "./FeatureRows.tsx";
import { PrChip } from "./PrChip.tsx";

export interface FeatureProgressProps {
  id: string;
  /** The feature's row of the live Work list (ADR 0016); null while the list loads, or when the feature is gone. */
  feature: FeatureRow | null;
  loading: boolean;
  /** The project's chats: a story whose session waits on an approval or a question is marked. */
  chats: readonly ChatSummary[];
  paneId: string;
  /** In CSS px: chosen by the handle beside it, as the card pane's is. */
  width: number;
  /** Take focus on open (default). */
  focusOnOpen?: boolean;
  /** A story's row was clicked: its host opens the story's chat, or its card. */
  onStory: (story: StoryRow) => void;
  /** Opens the feature's own card in the pane. */
  onCard: () => void;
  onClose: () => void;
  /** The clock the burn-up ends at, read on each render (the list pushes every change); tests give a fixed one. */
  now?: () => Date;
}

/** One story: a button that opens it, its waiting mark, then its stage, criteria, tasks and PR. */
function StoryLine({ story, waiting, onOpen }: { story: StoryRow; waiting: boolean; onOpen: () => void }) {
  return (
    <li className="fp-story" data-card={story.id}>
      <span className="fp-name">
        {story.type === "bug" && (
          <span className="row-bug" role="img" aria-label={WORK_COPY.bug}>
            <BugIcon />
          </span>
        )}
        <button type="button" className="card-link fp-open" onClick={onOpen}>
          <span className="card-id">{story.id}</span> {story.title}
        </button>
        {waiting && <span className="badge-review">{CHAT_COPY.waiting}</span>}
      </span>
      <span className="fp-meta">
        <Status tone={story.tone} label={story.stage} />
        <span>
          {PROGRESS_COPY.criteria} {ticks(story.criteria)}
        </span>
        <span>
          {PROGRESS_COPY.tasks} {ticks(story.tasks)}
        </span>
        {story.pr && <PrChip url={story.pr} status={story.prStatus} compact />}
      </span>
    </li>
  );
}

/** A feature's branch as the pane says it: its name, Not started, Merged or None. */
function branchText(branch: FeatureBranch): string {
  if (branch.kind === "branch") return branch.name;
  if (branch.kind === "not-started") return PROGRESS_COPY.notStarted;
  return branch.kind === "merged" ? PROGRESS_COPY.merged : CARD_COPY.none;
}

/**
 * A feature's progress (STORY-24), docked on the right like the card pane, from the same live Work list row (ADR 0003,
 * ADR 0016): its counts and bar, added scope, open bugs and branch, its burn-up (STORY-16), and each story's stage,
 * criteria, tasks and PR. It
 * reads nothing else and calls no agent. Escape closes it unless something inside is using Escape itself.
 */
export function FeatureProgress(props: FeatureProgressProps) {
  const { id, feature, loading, chats, paneId, width, focusOnOpen = true, onStory, onCard, onClose } = props;
  const { now = () => new Date() } = props;
  const storiesHead = useId();
  let body;
  if (!feature) body = <p className="meta">{loading ? CARD_COPY.loading : PROGRESS_COPY.gone}</p>;
  else {
    const { scope } = feature;
    body = (
      <>
        <div className="card-head">
          <h2 className="card-title">{feature.title}</h2>
          <Status tone={feature.tone} label={featureStatusLabel(feature.status)} />
          <Progress
            label={feature.progress.label}
            segments={feature.bar}
            total={feature.progress.total}
            breakdown={feature.breakdown}
          />
          <dl className="fp-facts">
            <dt>{PROGRESS_COPY.added}</dt>
            <dd>{scope.added > 0 ? scope.addedBreakdown : CARD_COPY.none}</dd>
            <dt>{PROGRESS_COPY.openBugs}</dt>
            <dd>{scope.openBugs > 0 ? WORK_COPY.bugs(scope.openBugs) : CARD_COPY.none}</dd>
            <dt>{PROGRESS_COPY.branch}</dt>
            <dd>{branchText(featureBranch(feature))}</dd>
          </dl>
        </div>
        {feature.burnUp ? (
          <BurnUpChart chart={feature.burnUp} current={feature.progress} now={now()} />
        ) : (
          <p className="meta fp-burnup-wait">{PROGRESS_COPY.chartStarts}</p>
        )}
        <section className="card-sec" aria-labelledby={storiesHead}>
          <h3 className="sh" id={storiesHead}>
            {PROGRESS_COPY.stories}
          </h3>
          {feature.stories.length ? (
            <ul className="fp-stories" aria-labelledby={storiesHead}>
              {feature.stories.map((s) => (
                <StoryLine key={s.id} story={s} waiting={waitsOnUser(s, chats)} onOpen={() => onStory(s)} />
              ))}
            </ul>
          ) : (
            <p className="meta">{PROGRESS_COPY.noStories}</p>
          )}
        </section>
      </>
    );
  }
  return (
    <DockedAside
      paneId={paneId}
      label={PROGRESS_COPY.pane(id)}
      id={id}
      width={width}
      focusOnOpen={focusOnOpen}
      closeLabel={PROGRESS_COPY.close}
      onClose={onClose}
      actions={
        feature && (
          <button type="button" className="card-link" aria-label={PROGRESS_COPY.cardOf(id)} onClick={onCard}>
            {PROGRESS_COPY.card}
          </button>
        )
      }
    >
      <div className="card-body">{body}</div>
    </DockedAside>
  );
}
