/**
 * The Work list's bridge (ADR 0016): a live list of the project's epics, features and stories, read by the local
 * server from each card's owner, and the two actions on a stale copy. This module holds the bridge's shape, its
 * wording, the filters, and how the client calls the server.
 */
import { errorMessage } from "@featra/work-format/guards";
import type { CopyActionResult } from "@featra/work-format/protocol";
import { normalizeCopyActionResult } from "@featra/work-format/protocol-copy";
import {
  EMPTY_WORK_LIST,
  normalizeWorkList,
  type EpicRow,
  type FeatureRow,
  type StoryRow,
  type WorkFilter,
  type WorkList,
} from "@featra/work-format/work-list";
import { CONTAINER_STATUS_LABELS } from "@featra/work-format/card-view";
import { noCards, serverCards, type CardBridge } from "./card-pane.ts";
import type { ServerClient } from "./server-client.ts";
import { noBugs, serverBugs, type BugBridge } from "./bugs.ts";

export type { CopyActionResult, WorkList };

/** What a watch hears: the latest list, and why it is out of date when it is. */
export interface WorkUpdate {
  list: WorkList;
  error: string | null;
}

/** The list, the stale-copy actions, and the card pane's card (ADR 0017). */
export interface WorkBridge extends CardBridge, BugBridge {
  /** Calls back with the project's list now and on every change; returns the stop. */
  watch: (dir: string, listener: (update: WorkUpdate) => void) => () => void;
  /** Writes a stale copy's edit to the owner's card, then puts the copy back as git has it. */
  applyCopy: (dir: string, key: string) => Promise<CopyActionResult>;
  /** Puts a stale copy back as git has it. */
  discardCopy: (dir: string, key: string) => Promise<CopyActionResult>;
  /** Asks the server to read every open PR again soon: the window regained focus (STORY-11). */
  refreshPrs: () => void;
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
  bugs: (n: number) => (n === 1 ? "1 open bug" : `${n} open bugs`),
  addedLater: "added",
  review: "Review",
  reviewDraft: "Review draft",
  reviewDraftOf: (id: string) => `Review draft ${id}`,
  openFeature: "Open",
  openFeatureOf: (id: string) => `Open ${id}`,
  start: "Start",
  startOf: (id: string) => `Start ${id}`,
  queued: "Queued",
  reported: "Reported",
  stopped: "Stopped",
  stop: "Stop",
  resume: "Resume",
  stopOf: (id: string) => `Stop ${id}`,
  resumeOf: (id: string) => `Resume ${id}`,
  openSession: "Session",
  openSessionOf: (id: string) => `Open the session of ${id}`,
  none: "—",
  epic: "epic",
  bug: "Bug",
  showStories: (title: string) => `Show stories of ${title}`,
} as const;

/** How a feature's status reads in the list. */
export const featureStatusLabel = (status: string | null) =>
  status === null ? WORK_COPY.none : (CONTAINER_STATUS_LABELS[status] ?? status);

/** Every story and bug row in `list`: under features, and on the project bug list (STORY-13). */
export const storyRows = (list: WorkList): StoryRow[] => [
  ...list.epics.flatMap((e) => e.features).flatMap((f) => f.stories),
  ...(list.bugs ?? []),
];

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
    ...serverBugs(server),
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
    refreshPrs: () => void server.call("prs.refresh", {}).catch(() => {}),
  };
}

/** A browser tab has no folders, so no cards. */
export function noWork(error: string): WorkBridge {
  return {
    ...noCards(error),
    ...noBugs(error),
    watch(_dir, listener) {
      listener({ list: EMPTY_WORK_LIST, error });
      return () => {};
    },
    applyCopy: async () => ({ ok: false, error }),
    discardCopy: async () => ({ ok: false, error }),
    refreshPrs() {},
  };
}
