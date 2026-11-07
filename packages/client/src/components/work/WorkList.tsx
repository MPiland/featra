import { useState } from "react";
import type { ProjectRef } from "../../projects.ts";
import {
  filterCounts,
  filterEpics,
  LIST_FILTERS,
  WORK_COPY,
  type ListFilter,
  type WorkBridge,
} from "../../work-list.ts";
import { Epic } from "./Epic.tsx";
import { StaleCopies } from "./StaleCopies.tsx";
import { StaleCards } from "./stale-mark.tsx";
import { useWorkList } from "./useWorkList.ts";

/**
 * The project's epics, features and stories, each from its owner (ADR 0002), kept live by the server (ADR 0016).
 * Filter chips narrow the features; stale copies are flagged above the list.
 */
export function WorkList({ work, project }: { work: WorkBridge; project: ProjectRef }) {
  const update = useWorkList(work, project.dir);
  const [filter, setFilter] = useState<ListFilter>("all");
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
          {epics.map((e) => (
            <Epic key={`${filter}|${e.id ?? "none"}`} epic={e} />
          ))}
        </StaleCards>
      </>
    );
  }
  return (
    <section className="work-list" aria-label={WORK_COPY.region} data-view="work" data-project={project.dir}>
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
  );
}
