// Work lists as the server builds them: real work-format cards through the real `buildWorkList`. No product logic here.
import {
  buildWorkList,
  DEFAULT_CONFIG,
  MAIN,
  newCard,
  setStatus,
  type Card,
  type CardType,
  type OwnedCard,
  type StaleCopy,
  type WorkList,
} from "@featra/work-format";

const AT = "2026-11-01T00:00:00Z";
const LATER = "2026-11-02T00:00:00Z";

export interface CardSpec {
  id: string;
  type: CardType;
  parent?: string | null;
  status?: string;
  title?: string;
  /** Ticked / total acceptance criteria and tasks. */
  acs?: [number, number];
  tasks?: [number, number];
  pr?: string;
}

const items = (n: [number, number] | undefined) =>
  Array.from({ length: n?.[1] ?? 0 }, (_, i) => ({ text: `item ${i + 1}`, done: i < (n?.[0] ?? 0), test: null }));

const defaultStatus = (type: CardType) => (type === "epic" || type === "feature" ? "active" : "New");

export function cardOf(spec: CardSpec): Card {
  const start = newCard(
    {
      id: spec.id,
      type: spec.type,
      title: spec.title ?? spec.id,
      status: defaultStatus(spec.type),
      parent: spec.parent ?? null,
      acs: items(spec.acs),
      tasks: items(spec.tasks),
      origin: spec.type === "bug" ? "bug" : "planned",
    },
    "user",
    AT,
  );
  const moved = spec.status && spec.status !== start.status ? setStatus(start, spec.status, "user", LATER) : start;
  return { ...moved, pr: spec.pr ?? null };
}

const owned = (card: Card): OwnedCard => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` });

/** The list for `specs` and for `more`: cards that are already whole, such as a draft the real planner made. */
export function workList(
  specs: CardSpec[],
  stale: StaleCopy[] = [],
  problems: string[] = [],
  more: Card[] = [],
  canEdit?: (owned: OwnedCard) => boolean,
): WorkList {
  return buildWorkList({ cards: [...specs.map(cardOf), ...more].map(owned), stale, problems }, DEFAULT_CONFIG, canEdit);
}

/** A small project: one epic with three features in different states, and a loose story. */
export const PLAN: CardSpec[] = [
  { id: "EPIC-1", type: "epic", title: "Prove the core" },
  { id: "FEAT-1", type: "feature", parent: "EPIC-1", status: "done", title: "Provider spike" },
  { id: "FEAT-2", type: "feature", parent: "EPIC-1", status: "active", title: "Cards and the feature list" },
  { id: "FEAT-3", type: "feature", parent: "EPIC-1", status: "draft", title: "Burn-up" },
  { id: "STORY-1", type: "story", parent: "FEAT-1", status: "Done", acs: [3, 3], tasks: [6, 6], title: "Spike" },
  {
    id: "STORY-2",
    type: "story",
    parent: "FEAT-2",
    status: "In Progress",
    acs: [1, 3],
    tasks: [4, 6],
    title: "Open a folder",
    // A PR is recorded as its URL; the window shows its number (STORY-11).
    pr: "https://github.com/acme/app/pull/15",
  },
  { id: "STORY-3", type: "story", parent: "FEAT-2", status: "In Review", acs: [4, 4], title: "Home feature list" },
  { id: "STORY-4", type: "story", parent: "FEAT-3", status: "New", title: "Draw the chart" },
  { id: "STORY-9", type: "story", parent: null, status: "Ready", title: "Loose story" },
];

/** A story from before STORY-11, whose `pr` was written as the PR's number alone. */
export const LEGACY_PR: CardSpec = {
  id: "STORY-5",
  type: "story",
  parent: "FEAT-2",
  status: "In Review",
  title: "Older card",
  pr: "15",
};
