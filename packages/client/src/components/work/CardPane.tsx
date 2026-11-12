import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CARD_COPY, type CardBridge, type CardEdit } from "../../card-pane.ts";
import { Dropdown } from "../controls/Dropdown.tsx";
import { InlineText } from "../controls/InlineText.tsx";
import { CloseIcon } from "../icons.tsx";
import { DraftReview } from "./DraftReview.tsx";
import { SendBack } from "./SendBack.tsx";
import { StartFeature } from "./StartFeature.tsx";
import { StoryChecks } from "./StoryChecks.tsx";
import { AcceptStory } from "./AcceptStory.tsx";
import { StoryAgent } from "./story-agents.tsx";
import { StoriesSection } from "./StoriesSection.tsx";
import { useCard } from "./useCard.ts";
import { AcSection, Evidence, TaskSection, TextSection, type SaveEdit } from "./CardSections.tsx";

export interface CardPaneProps {
  work: CardBridge;
  dir: string;
  id: string;
  paneId: string;
  /** In CSS px: chosen by the handle beside it, fitted to the work area. */
  width: number;
  onClose: () => void;
  /** Opens another card in the pane: a feature's stories, and the way back (STORY-49). Left out, they aren't offered. */
  onOpen?: (id: string) => void;
  /** The card this one was opened from, which a way back leads to. */
  openedFrom?: string;
  /** Take focus on open (default). A pane that opens beside a chat being typed in leaves it. */
  focusOnOpen?: boolean;
  /** Whether the project still has a chat. Send back is off for a draft whose chat is gone; default: it has. */
  hasChat?: (chat: string) => boolean;
}

const anyChat = () => true;

// A null parent goes through the dropdown as "", since its values are strings.
const toChoice = (v: string | null) => v ?? "";
const fromChoice = (v: string) => (v === "" ? null : v);

/**
 * The docked card pane (ADR 0017): one card from its owner copy, beside the list. Text fields edit in place; status
 * and parent are chosen from what the rules allow, and every save goes to the owner copy. Escape closes it unless a
 * field or list inside is using Escape itself.
 */
export function CardPane({
  work,
  dir,
  id,
  paneId,
  width,
  onClose,
  onOpen,
  openedFrom,
  focusOnOpen = true,
  hasChat = anyChat,
}: CardPaneProps) {
  const card = useCard(work, dir, id);
  const pane = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { view, setView } = card;

  // Mounted once per card (keyed by id), so focus moves in each time a story is opened.
  useEffect(() => {
    if (focusOnOpen) pane.current?.focus();
  }, [focusOnOpen]);

  const send = async (edit: CardEdit) => {
    const r = await work.updateCard(dir, id, edit);
    if (r.view) setView(r.view);
    return r;
  };
  const save: SaveEdit = async (edit, pick) => {
    const r = await send(edit);
    if (r.ok) return null;
    return { error: r.error, current: r.view ? pick(r.view) : (edit.from ?? "") };
  };
  const move = async (edit: CardEdit) => {
    if (edit.from === edit.to) return;
    const r = await send(edit);
    setError(r.ok ? null : r.error);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    onClose();
  };

  let body;
  if (!view) body = <p className="meta">{card.loading ? CARD_COPY.loading : CARD_COPY.gone}</p>;
  else {
    const readOnly = view.readOnly !== null;
    const status = view.statusOptions.find((o) => o.value === view.status)?.label ?? view.status;
    body = (
      <>
        <div className="card-head">
          <InlineText
            label={CARD_COPY.title}
            value={view.title}
            className="card-title"
            readOnly={readOnly}
            nowLabel={CARD_COPY.now}
            onSave={(to, from) => save({ field: "title", from, to }, (v) => v.title)}
          />
          <div className="card-fields">
            {readOnly ? (
              <span>
                {CARD_COPY.status}: {status}
              </span>
            ) : (
              <Dropdown
                name={CARD_COPY.status}
                value={view.status}
                options={view.statusOptions.map((o) => ({ value: toChoice(o.value), label: o.label }))}
                onChange={(to) => void move({ field: "status", from: view.status, to })}
              />
            )}
            {view.parentOptions.length > 0 && !readOnly && (
              <Dropdown
                name={CARD_COPY.parent}
                value={toChoice(view.parent)}
                options={view.parentOptions.map((o) => ({ value: toChoice(o.value), label: o.label }))}
                onChange={(to) => void move({ field: "parent", from: view.parent, to: fromChoice(to) })}
              />
            )}
          </div>
          <Evidence evidence={view.evidence} />
          <p className="meta">{view.readOnly ?? CARD_COPY.owner(view.owner)}</p>
          {view.draftChat && !readOnly && (
            <div className="draft-actions">
              <SendBack
                key={id}
                unavailable={hasChat(view.draftChat) ? null : CARD_COPY.sendBackGone}
                onSend={(reason) => work.sendBack(dir, id, reason)}
              />
              <DraftReview
                key={`review-${id}`}
                id={id}
                stories={view.draftStories ?? view.stories.length}
                onApprove={() => work.approve(dir, id)}
                onReject={() => work.reject(dir, id)}
                onRejected={onClose}
              />
            </div>
          )}
          {view.type === "story" && (
            <div className="draft-actions">
              <StoryAgent id={id} />
            </div>
          )}
          {view.awaiting && !readOnly && (
            <div className="draft-actions">
              <AcceptStory
                key={`accept-${id}`}
                id={id}
                actions={{
                  accept: (story) => work.acceptStory(dir, story),
                  sendBack: (story, reason, addCriterion) => work.sendBackStory(dir, story, reason, addCriterion),
                }}
              />
            </div>
          )}
          {view.startable && (
            <div className="draft-actions">
              <StartFeature
                key={`start-${id}`}
                onStart={() => work.start(dir, id)}
                onStarted={() => pane.current?.focus()}
              />
            </div>
          )}
          {error && (
            <p className="card-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <TextSection
          view={view}
          save={save}
          field="description"
          title={CARD_COPY.story}
          placeholder={CARD_COPY.storyEmpty}
        />
        {onOpen && <StoriesSection stories={view.stories} onOpen={onOpen} />}
        {view.checks && (
          <StoryChecks checks={view.checks} readOnly={readOnly} onRerun={() => work.rerunChecks(dir, id)} />
        )}
        <AcSection view={view} save={save} />
        <TaskSection view={view} save={save} />
        <TextSection view={view} save={save} field="notes" title={CARD_COPY.notes} placeholder={CARD_COPY.notesEmpty} />
        <section className="card-sec" aria-label={CARD_COPY.pr}>
          <h3 className="sh">{CARD_COPY.pr}</h3>
          <p>{view.pr ?? <span className="meta">{CARD_COPY.none}</span>}</p>
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
      aria-label={CARD_COPY.pane(id)}
      tabIndex={-1}
      onKeyDown={onKey}
    >
      <div className="card-bar">
        <span className="card-id">{id}</span>
        {onOpen && openedFrom && (
          <button type="button" className="card-link" onClick={() => onOpen(openedFrom)}>
            {CARD_COPY.backTo(openedFrom)}
          </button>
        )}
        <button
          type="button"
          className="card-close"
          aria-label={CARD_COPY.close}
          title={CARD_COPY.close}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      {card.error && (
        <p className="card-error" role="alert">
          {card.error}
        </p>
      )}
      <div className="card-body">{body}</div>
    </aside>
  );
}
