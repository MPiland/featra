/**
 * What filing a bug says (STORY-13), kept apart from the rules so the client reads it without the card parser. Short,
 * sentence case, provider neutral, and the same words in the Dev Lead's request card and Work's New bug.
 */
import { isRecord } from "./utils/guards.ts";

/** The approval the Dev Lead's `report_bug` puts in its chat: the tool row's name. */
export const REPORT_BUG_TOOL = "report_bug";

/** The longest bug title taken. */
export const BUG_TITLE_MAX = 120;
/** The longest bug description taken. */
export const BUG_DESCRIPTION_MAX = 4000;

/**
 * Where a bug goes, as a key the client and the server share: `project`, `feature:FEAT-6` or `task:STORY-9`.
 * The rules (work-format's `bug-filing`) say which keys a project offers and what each one makes.
 */
export type PlacementKey = string;

/** One place a bug can go, as the confirm offers it. */
export interface PlacementChoice {
  key: PlacementKey;
  label: string;
}

/** A bug to file, before it has a place: what the Dev Lead's tool and New bug both send. */
export interface BugReport {
  title: string;
  description: string;
  /** The card believed to have caused it, or null when unknown. */
  cause: string | null;
}

/** What the placement confirm shows: the proposal, and every place the bug can go. */
export interface BugPlacements {
  proposed: PlacementKey;
  choices: PlacementChoice[];
}

export const BUG_COPY = {
  newBug: "New bug",
  title: "Title",
  description: "Description",
  cause: "Suspected cause",
  noCause: "Not known",
  placement: "Place it",
  proposed: "Proposed",
  create: "Create",
  creating: "Creating…",
  cancel: "Cancel",
  /** The request card's line about who asks. */
  asked: "The Dev Lead reports a bug.",
  ask: (title: string) => `File the bug "${title}"?`,
  causedBy: (cause: string) => `Suspected cause: ${cause}`,
  projectBugs: "Project bugs",
  noProjectBugs: "No project bugs",
  /** A choice's label. */
  project: "The project bug list",
  feature: (id: string, title: string) => `A bug under ${id} ${title}`,
  task: (id: string, title: string) => `A task on ${id} ${title}`,
  /** What New bug says once it's done. */
  filedCard: (id: string) => `Filed ${id}.`,
  filedTask: (id: string) => `Added a task to ${id}.`,
} as const;

/** Placements as they cross the socket, checked: every choice whole, and the proposal one of them; null if not. */
export function normalizeBugPlacements(raw: unknown): BugPlacements | null {
  if (!isRecord(raw) || typeof raw.proposed !== "string" || !Array.isArray(raw.choices)) return null;
  const { proposed, choices } = raw;
  const valid = choices.filter(
    (c): c is PlacementChoice => isRecord(c) && typeof c.key === "string" && typeof c.label === "string",
  );
  if (valid.length !== choices.length || !valid.some((c) => c.key === proposed)) return null;
  return { proposed, choices: valid.map(({ key, label }) => ({ key, label })) };
}

/** The request card's input, as the client reads it from the approval: the report and its placements; null if not one. */
export function bugAsk(input: unknown): (BugReport & BugPlacements) | null {
  if (!isRecord(input)) return null;
  const { title, description, cause } = input;
  if (typeof title !== "string" || typeof description !== "string") return null;
  if (cause !== null && typeof cause !== "string") return null;
  const placements = normalizeBugPlacements(input);
  return placements && { title, description, cause, ...placements };
}
