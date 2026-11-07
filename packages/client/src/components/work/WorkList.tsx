import { useId, useMemo, useRef, useState } from "react";
import { paneWidthFor } from "../../pane-width.ts";
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
import { CardPane } from "./CardPane.tsx";
import { PaneHandle, useMeasuredWidth, type ChosenWidth } from "./PaneHandle.tsx";
import { Epic } from "./Epic.tsx";
import { StaleCopies } from "./StaleCopies.tsx";
import { StaleCards } from "./stale-mark.tsx";
import { useWorkList } from "./useWorkList.ts";

/**
 * The project's epics, features and stories, each from its owner (ADR 0002), kept live by the server (ADR 0016).
 * Filter chips narrow the features; stale copies are flagged above the list. A story opens in the card pane, docked
 * beside the list (ADR 0017); closing it puts focus back on the story. The pane's width is the user's choice, fitted
 * to the work area so the list keeps its minimum (`pane-width.ts`).
 */
export function WorkList(props: { work: WorkBridge; project: ProjectRef; paneWidth: ChosenWidth }) {
  const { work, project, paneWidth } = props;
  const update = useWorkList(work, project.dir);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const paneId = useId();
  const listRef = useRef<HTMLElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const split = useMeasuredWidth(splitRef);
  // The width while the handle is dragged; kept in the UI state when the drag ends.
  const [dragged, setDragged] = useState<number | null>(null);
  const width = paneWidthFor(dragged ?? paneWidth.chosen, split);
  const choose = (w: number) => {
    setDragged(null);
    paneWidth.choose(w);
  };
  const selection = useMemo(() => ({ selected, paneId, open: setSelected }), [selected, paneId]);
  const close = () => {
    const id = selected;
    setSelected(null);
    const row = id && listRef.current?.querySelector<HTMLElement>(`[data-card="${id}"] .row-open`);
    if (row) row.focus();
  };
  const list = update?.list;
  const epics = list ? filterEpics(list.epics, filter) : [];
  const counts = filterCounts(list?.epics ?? []);
  let body;
  if (!list) body = <p className="meta">{WORK_COPY.loading}</p>;
  else if (!list.epics.length) body = <p className="meta">{WORK_COPY.empty}</p>;
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
            {epics.map((e) => (
              <Epic key={`${filter}|${e.id ?? "none"}`} epic={e} />
            ))}
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
        {body}
      </section>
      {selected && (
        <>
          <PaneHandle
            width={width}
            split={split}
            paneId={paneId}
            onMove={setDragged}
            onChoose={choose}
            onClose={close}
          />
          <CardPane
            key={selected}
            work={work}
            dir={project.dir}
            id={selected}
            paneId={paneId}
            width={width}
            onClose={close}
          />
        </>
      )}
    </div>
  );
}
