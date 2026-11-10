/**
 * The Work list's bridge (ADR 0016): a live list of the project's epics, features and stories, read by the local
 * server from each card's owner, and the two actions on a stale copy. This module holds the bridge's shape, its
 * wording, the filters, and how the client calls the server.
 */
import { errorMessage } from "@featra/work-format/guards";
import { normalizeCopyActionResult, type CopyActionResult } from "@featra/work-format/protocol";
import {
  EMPTY_WORK_LIST,
  normalizeWorkList,
  type EpicRow,
  type FeatureRow,
  type WorkFilter,
  type WorkList,
} from "@featra/work-format/work-list";
import { CONTAINER_STATUS_LABELS } from "@featra/work-format/card-view";
import { noCards, serverCards, type CardBridge } from "./card-pane.ts";
import type { ServerClient } from "./server-client.ts";

export type { CopyActionResult, WorkList };

/** What a watch hears: the latest list, and why it is out of date when it is. */
export interface WorkUpdate {
  list: WorkList;
  error: string | null;
}

/** The list, the stale-copy actions, and the card pane's card (ADR 0017). */
export interface WorkBridge extends CardBridge {
  /** Calls back with the project's list now and on every change; returns the stop. */
  watch: (dir: string, listener: (update: WorkUpdate) => void) => () => void;
  /** Writes a stale copy's edit to the owner's card, then puts the copy back as git has it. */
  applyCopy: (dir: string, key: string) => Promise<CopyActionResult>;
  /** Puts a stale copy back as git has it. */
  discardCopy: (dir: string, key: string) => Promise<CopyActionResult>;
}

export type ListFilter = "all" | WorkFilter;

export const LIST_FILTERS: readonly { id: ListFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in-progress", label: "In progress" },
  { id: "needs-review", label: "Needs review" },
  { id: "backlog", label: "Backlog" },
  { id: "done", label: "Done" },
];

export const WORK_COPY = {
  region: "Work list",
  filters: "Filter features",
  noEpic: "No epic",
  noFeature: "No feature",
  loading: "Loading…",
  empty: "No cards yet.",
  noMatch: "No features match this filter.",
  columns: ["Feature", "Status", "Progress", "Tasks", "Scope"],
  storyColumns: ["Story", "Stage", "Criteria", "Tasks", "PR"],
  stale: "Edited outside its owner",
  staleMark: "Edited elsewhere",
  staleDetail: (where: string, owner: string) => `Changed in ${where}. The card is owned by ${owner}.`,
  apply: "Apply to owner",
  discard: "Discard",
  problems: "Some cards can't be shown",
  added: (n: number) => `+${n} added`,
  bugs: (n: number) => (n === 1 ? "1 open bug" : `${n} open bugs`),
  addedLater: "added",
  review: "Review",
  reviewDraft: "Review draft",
  reviewDraftOf: (id: string) => `Review draft ${id}`,
  none: "—",
  epic: "epic",
  showStories: (title: string) => `Show stories of ${title}`,
} as const;

/** How a feature's status reads in the list. */
export const featureStatusLabel = (status: string | null) =>
  status === null ? WORK_COPY.none : (CONTAINER_STATUS_LABELS[status] ?? status);

/** How many features each chip shows. A feature can count under more than one. */
export function filterCounts(epics: readonly EpicRow[]): Record<ListFilter, number> {
  const features = epics.flatMap((e) => e.features);
  const n = (filter: WorkFilter) => features.filter((f) => f.filters.includes(filter)).length;
  return {
    all: features.length,
    "in-progress": n("in-progress"),
    "needs-review": n("needs-review"),
    backlog: n("backlog"),
    done: n("done"),
  };
}

/** The epics with only the features under `filter`; epics left with none are dropped. */
export function filterEpics(epics: readonly EpicRow[], filter: ListFilter): EpicRow[] {
  if (filter === "all") return [...epics];
  const keep = (f: FeatureRow) => f.filters.includes(filter);
  return epics.flatMap((e) => {
    const features = e.features.filter(keep);
    return features.length ? [{ ...e, features }] : [];
  });
}

const copyError = (err: unknown): CopyActionResult => ({ ok: false, error: errorMessage(err) });

/** The bridge's work methods over the server client. */
export function serverWork(server: ServerClient): WorkBridge {
  return {
    ...serverCards(server),
    watch(dir, listener) {
      let last = EMPTY_WORK_LIST;
      return server.watch(
        "work.watch",
        { dir },
        {
          data: (raw) => {
            last = normalizeWorkList(raw);
            listener({ list: last, error: null });
          },
          error: (message) => listener({ list: last, error: message }),
        },
      );
    },
    applyCopy: (dir, key) => server.call("work.applyCopy", { dir, key }).then(normalizeCopyActionResult, copyError),
    discardCopy: (dir, key) => server.call("work.discardCopy", { dir, key }).then(normalizeCopyActionResult, copyError),
  };
}

/** A browser tab has no folders, so no cards. */
export function noWork(error: string): WorkBridge {
  return {
    ...noCards(error),
    watch(_dir, listener) {
      listener({ list: EMPTY_WORK_LIST, error });
      return () => {};
    },
    applyCopy: async () => ({ ok: false, error }),
    discardCopy: async () => ({ ok: false, error }),
  };
}
