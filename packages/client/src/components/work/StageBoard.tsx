import { useId, useState } from "react";
import type { ChatSummary } from "@featra/work-format/chat-list";
import { waitsOnUser } from "@featra/work-format/feature-progress";
import { boardFeatures, boardFilter, stageBoard, type BoardCard } from "@featra/work-format/stage-board";
import type { WorkList } from "@featra/work-format/work-list";
import { CHAT_COPY } from "../../chats.ts";
import { BOARD_COPY, WORK_COPY } from "../../work-list.ts";
import { BugIcon } from "../icons.tsx";
import { useCardSelection } from "./card-selection.tsx";
import { Status } from "./FeatureRows.tsx";
import { PrChip } from "./PrChip.tsx";

/** A compact card: its ID and title open its card pane; then its feature, its PR and whether it waits on the user. */
function Card({ card, tagged, waiting }: { card: BoardCard; tagged: boolean; waiting: boolean }) {
  const { selected, paneId, open } = useCardSelection();
  const { story, feature } = card;
  const shown = selected === story.id;
  return (
    <li className={shown ? "bcard shown" : "bcard"} data-card={story.id}>
      <button
        type="button"
        className="bcard-open"
        aria-expanded={shown}
        aria-controls={shown ? paneId : undefined}
        onClick={() => open(story.id)}
      >
        <span className="card-id">{story.id}</span> {story.title}
      </button>
      <span className="bcard-meta">
        {story.type === "bug" && (
          <span className="row-bug" role="img" aria-label={WORK_COPY.bug}>
            <BugIcon />
          </span>
        )}
        {tagged && feature && (
          <span
            className="bcard-feature"
            title={BOARD_COPY.feature(feature.id, feature.title)}
            aria-label={BOARD_COPY.feature(feature.id, feature.title)}
          >
            {feature.id}
          </span>
        )}
        {story.pr && <PrChip url={story.pr} status={story.prStatus} compact />}
        {waiting && <span className="badge-review">{CHAT_COPY.waiting}</span>}
      </span>
    </li>
  );
}

/**
 * The stage board (STORY-17): one column per stage of the project, with its count, holding the stories and bugs of
 * every feature or of the one the filter picks, from the live Work list (ADR 0016). Read-only: nothing drags, and a
 * card's stage changes only through agents, merges and the card pane. A card opens its card pane.
 */
export function StageBoard({ list, chats }: { list: WorkList; chats: readonly ChatSummary[] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const feature = boardFilter(list, chosen);
  const features = boardFeatures(list);
  const columns = stageBoard(list, feature);
  const ids = useId();
  const chip = (id: string | null, label: string) => (
    <button
      key={id ?? ""}
      type="button"
      className={feature === id ? "fchip on" : "fchip"}
      aria-pressed={feature === id}
      onClick={() => setChosen(id)}
    >
      {label}
    </button>
  );
  return (
    <>
      <div className="wfilter" role="group" aria-label={BOARD_COPY.features}>
        {chip(null, BOARD_COPY.allFeatures)}
        {features.map((f) => chip(f.id, BOARD_COPY.feature(f.id, f.title)))}
      </div>
      <section className="stage-board" aria-label={BOARD_COPY.region}>
        {columns.map((c, i) => (
          <section key={c.name} className="bcol" aria-labelledby={`${ids}-${i}`} data-stage={c.name}>
            <h2 className="bcol-head">
              <span id={`${ids}-${i}`}>
                <Status tone={c.tone} label={c.name} />
              </span>
              <span className="bcol-count">{c.cards.length}</span>
            </h2>
            <ul className="bcol-cards" aria-labelledby={`${ids}-${i}`}>
              {c.cards.map((card) => (
                <Card
                  key={card.story.id}
                  card={card}
                  tagged={feature === null}
                  waiting={waitsOnUser(card.story, chats)}
                />
              ))}
            </ul>
          </section>
        ))}
      </section>
    </>
  );
}
