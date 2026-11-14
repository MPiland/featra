import { useEffect, useRef, type KeyboardEvent } from "react";
import type { ChatSummary } from "@featra/work-format/chat-list";
import { waitsOnUser } from "@featra/work-format/feature-progress";
import type { FeatureRow, StoryRow } from "@featra/work-format/work-list";
import { CARD_COPY } from "../../card-pane.ts";
import { CHAT_COPY } from "../../chats.ts";
import { featureStatusLabel, PROGRESS_COPY, WORK_COPY } from "../../work-list.ts";
import { BugIcon, CloseIcon } from "../icons.tsx";
import { Progress } from "./Bar.tsx";
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
        {waiting && <span className="badge-wait">{CHAT_COPY.waiting}</span>}
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

/**
 * A feature's progress (STORY-24), docked on the right like the card pane, from the same live Work list row (ADR 0003,
 * ADR 0016): its counts and bar, added scope, open bugs and branch, and each story's stage, criteria, tasks and PR. It
 * reads nothing else and calls no agent. Escape closes it unless something inside is using Escape itself.
 */
export function FeatureProgress(props: FeatureProgressProps) {
  const { id, feature, loading, chats, paneId, width, focusOnOpen = true, onStory, onCard, onClose } = props;
  const pane = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusOnOpen) pane.current?.focus();
  }, [focusOnOpen]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    onClose();
  };
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
            <dd>{feature.branch ?? CARD_COPY.none}</dd>
          </dl>
        </div>
        {/* STORY-16: the burn-up goes here, between the counts and the stories. */}
        <section className="card-sec" aria-label={PROGRESS_COPY.stories}>
          <h3 className="sh">{PROGRESS_COPY.stories}</h3>
          {feature.stories.length ? (
            <ul className="fp-stories" aria-label={PROGRESS_COPY.stories}>
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
    // The pane takes focus on open so Escape reaches it; it isn't a stop in the Tab order.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      id={paneId}
      ref={pane}
      className="card-pane"
      style={{ width }}
      aria-label={PROGRESS_COPY.pane(id)}
      tabIndex={-1}
      onKeyDown={onKey}
    >
      <div className="card-bar">
        <span className="card-id">{id}</span>
        <span className="fp-actions">
          {feature && (
            <button type="button" className="card-link" onClick={onCard}>
              {PROGRESS_COPY.card}
            </button>
          )}
          <button
            type="button"
            className="card-close"
            aria-label={PROGRESS_COPY.close}
            title={PROGRESS_COPY.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </span>
      </div>
      <div className="card-body">{body}</div>
    </aside>
  );
}
