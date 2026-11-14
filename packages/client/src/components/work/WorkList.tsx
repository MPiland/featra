import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { ChatSummary } from "@featra/work-format";
import type { StoryRow } from "@featra/work-format/work-list";
import type { ProjectRef } from "../../projects.ts";
import {
  filterCounts,
  filterEpics,
  LIST_FILTERS,
  WORK_COPY,
  type ListFilter,
  type WorkBridge,
} from "../../work-list.ts";
import { SelectedCard } from "./card-selection.tsx";
import type { ChosenWidth } from "./PaneHandle.tsx";
import { SidePane, type Docked } from "./SidePane.tsx";
import { Epic } from "./Epic.tsx";
import { NewBug } from "./NewBug.tsx";
import { ProjectBugs } from "./ProjectBugs.tsx";
import { ReviewDraft } from "./review-draft.tsx";
import { StoryAgentsContext, type StoryAgents } from "./story-agents.tsx";
import { useDockedPane } from "./useDockedPane.ts";
import { StaleCopies } from "./StaleCopies.tsx";
import { StaleCards } from "./stale-mark.tsx";
import { useWorkList } from "./useWorkList.ts";

/**
 * The project's epics, features and stories, each from its owner (ADR 0002), kept live by the server (ADR 0016).
 * Filter chips narrow the features; stale copies are flagged above the list. A story opens in the card pane, docked
 * beside the list (ADR 0017); a feature's Progress opens its progress pane in the same place (STORY-24). Closing either
 * puts focus back on the row it came from. The pane's width is the user's choice, fitted
 * to the work area so the list keeps its minimum (`pane-width.ts`).
 */
export function WorkList(props: {
  work: WorkBridge;
  project: ProjectRef;
  paneWidth: ChosenWidth;
  /** Opens the chat that drafted a feature, with the draft pane (STORY-49). */
  onReviewDraft: (chat: string) => void;
  /** Whether the project has that chat; Review draft falls back to this pane when its chat is gone. */
  hasChat: (chat: string) => boolean;
  /** The project's chats, for a story row to say Queued (STORY-9). */
  chats?: readonly ChatSummary[];
  /** Opens a chat: a story row's link to its session (STORY-9). */
  onOpenChat?: (chat: string) => void;
}) {
  const { work, project, paneWidth, onReviewDraft, hasChat, chats = [], onOpenChat = () => {} } = props;
  const update = useWorkList(work, project.dir);
  const [filter, setFilter] = useState<ListFilter>("all");
  // One pane on the right: a card (with the card it was reached from, so it can go back) or a feature's progress.
  const [docked, setDocked] = useState<Docked | null>(null);
  const select = useCallback((id: string) => setDocked({ kind: "card", id, focus: true }), []);
  const openProgress = useCallback((feature: string) => setDocked({ kind: "progress", feature, focus: true }), []);
  const paneId = useId();
  const listRef = useRef<HTMLElement>(null);
  const { splitRef, split, width, onMove, choose } = useDockedPane(paneWidth);
  const reviewDraft = useCallback(
    (chat: string, feature: string) => (hasChat(chat) ? onReviewDraft(chat) : select(feature)),
    [hasChat, onReviewDraft, select],
  );
  const storyAgents = useMemo<StoryAgents>(() => {
    const rows = new Map<string, { story: StoryRow; featureActive: boolean }>();
    for (const epic of update?.list.epics ?? [])
      for (const f of epic.features)
        for (const story of f.stories) rows.set(story.id, { story, featureActive: f.status === "active" });
    for (const bug of update?.list.bugs ?? []) rows.set(bug.id, { story: bug, featureActive: false });
    return {
      row: (id) => rows.get(id) ?? null,
      queued: (id) => chats.some((c) => c.story?.id === id && c.queued === true),
      running: (id) => chats.some((c) => c.story?.id === id && c.running),
      stalled: (id) => chats.some((c) => c.story?.id === id && c.stalled === true),
      hasChat,
      stops: {
        stop: (id) => work.stopStory(project.dir, id),
        resume: (id) => work.resumeStory(project.dir, id),
      },
      acceptance: {
        accept: (id) => work.acceptStory(project.dir, id),
        sendBack: (id, reason, addCriterion) => work.sendBackStory(project.dir, id, reason, addCriterion),
      },
      merge: (id) => work.mergeStory(project.dir, id),
      start: (id) => work.startStory(project.dir, id),
      open: onOpenChat,
    };
  }, [update, chats, hasChat, work, project.dir, onOpenChat]);
  const selected = docked?.kind === "card" ? docked.id : null;
  const progress = docked?.kind === "progress" ? docked.feature : null;
  // Focus goes back to the row the pane was opened from: a story's, or the feature's progress button.
  const close = useCallback(() => {
    setDocked(null);
    if (!docked) return;
    const root = listRef.current;
    const feature = docked.kind === "progress" ? docked.feature : docked.progress;
    const row =
      (docked.kind === "card" ? root?.querySelector<HTMLElement>(`[data-card="${docked.id}"] .row-open`) : null) ??
      (feature ? root?.querySelector<HTMLElement>(`[data-card="${feature}"] .row-progress`) : null);
    row?.focus();
  }, [docked]);
  const selection = useMemo(
    () => ({ selected, paneId, open: select, progress, openProgress, close }),
    [selected, paneId, select, progress, openProgress, close],
  );
  const list = update?.list;
  const epics = list ? filterEpics(list.epics, filter) : [];
  const counts = filterCounts(list?.epics ?? []);
  let body;
  if (!list) body = <p className="meta">{WORK_COPY.loading}</p>;
  else if (!list.epics.length && !list.bugs?.length) body = <p className="meta">{WORK_COPY.empty}</p>;
  else {
    body = (
      <>
        <div className="wfilter" role="group" aria-label={WORK_COPY.filters}>
          {LIST_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? "fchip on" : "fchip"}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label} · {counts[f.id]}
            </button>
          ))}
        </div>
        {epics.length === 0 && <p className="meta">{WORK_COPY.noMatch}</p>}
        <StaleCards value={new Set(list.stale.map((s) => s.cardId))}>
          <SelectedCard.Provider value={selection}>
            <ReviewDraft.Provider value={reviewDraft}>
              <StoryAgentsContext.Provider value={storyAgents}>
                {epics.map((e) => (
                  <Epic key={`${filter}|${e.id ?? "none"}`} epic={e} />
                ))}
                <ProjectBugs bugs={list.bugs ?? []} />
              </StoryAgentsContext.Provider>
            </ReviewDraft.Provider>
          </SelectedCard.Provider>
        </StaleCards>
      </>
    );
  }
  return (
    <div ref={splitRef} className="work-split">
      <section
        ref={listRef}
        className="work-list"
        aria-label={WORK_COPY.region}
        data-view="work"
        data-project={project.dir}
      >
        {update?.error && (
          <p className="work-error" role="alert">
            {update.error}
          </p>
        )}
        {list && list.problems.length > 0 && (
          <details className="work-problems">
            <summary>{WORK_COPY.problems}</summary>
            <ul>
              {list.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
        )}
        {list && (
          <StaleCopies
            stale={list.stale}
            onApply={(key) => work.applyCopy(project.dir, key)}
            onDiscard={(key) => work.discardCopy(project.dir, key)}
          />
        )}
        {list && <NewBug bugs={work} dir={project.dir} list={list} />}
        {body}
      </section>
      {docked && (
        <StoryAgentsContext.Provider value={storyAgents}>
          <SidePane
            docked={docked}
            onDock={setDocked}
            onClose={close}
            work={work}
            dir={project.dir}
            layout={{ split, width, onMove, choose }}
            paneId={paneId}
            list={list}
            chats={chats}
            onOpenChat={onOpenChat}
            hasChat={hasChat}
          />
        </StoryAgentsContext.Provider>
      )}
    </div>
  );
}
