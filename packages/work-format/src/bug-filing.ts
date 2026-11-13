/**
 * Filing a bug (STORY-13, ADR 0036): where it can go, what Featra proposes, and what it makes. `routeProblem` is the
 * one source of the proposal; the user confirms it or picks another place before anything is written. A bug card
 * under a feature in progress is added scope (origin `bug`); a task goes on a story still being worked; anything else
 * goes on the project bug list. Nothing here reopens or reparents a Done feature: it is never offered, and a place
 * that stopped being offered is refused at create time.
 */
import { BUG_COPY, BUG_DESCRIPTION_MAX, BUG_TITLE_MAX } from "./bug-copy.ts";
import type { BugPlacements, BugReport, PlacementChoice, PlacementKey } from "./bug-copy.ts";
import { recorded } from "./card-edit.ts";
import { newCard } from "./card.ts";
import { routeProblem, takesBug, takesTask, type ProblemRoute } from "./bugs.ts";
import { parseId } from "./ids.ts";
import type { Card, ProjectConfig } from "./types.ts";
import { isRecord } from "./utils/guards.ts";

export const REPORT_BUG_MESSAGES = {
  badTitle: "Give the bug a short title as `title`.",
  longTitle: `Keep the title under ${BUG_TITLE_MAX} characters; put the rest in \`description\`.`,
  longDescription: `Keep the description under ${BUG_DESCRIPTION_MAX} characters.`,
  badDescription: "Give the description as text, or leave `description` out.",
  badCause: "Give the suspected cause as a card id, such as STORY-9, or leave `cause` out.",
  unknownCause: (id: string) => `${id} isn't a card in this project.`,
  badPlacement: "That isn't a place this bug can go.",
  placeGone: (key: PlacementKey) => `${key.replace(/^\w+:/, "")} can't take this bug now. Pick another place.`,
  asked: "Asked the user where to file the bug. A notice tells you where it went, or that they cancelled it.",
} as const;

/** The key for `route`, as the confirm and the server share it. */
export function placementKey(route: ProblemRoute): PlacementKey {
  if (route.kind === "task") return `task:${route.card}`;
  if (route.kind === "feature-bug") return `feature:${route.feature}`;
  return "project";
}

/** The route `key` names, or null when it names none. */
export function routeOf(key: unknown): ProblemRoute | null {
  if (key === "project") return { kind: "project-bug" };
  if (typeof key !== "string") return null;
  const [kind, id = "", ...rest] = key.split(":");
  if (rest.length > 0 || parseId(id) === null) return null;
  if (kind === "task") return { kind: "task", card: id };
  if (kind === "feature") return { kind: "feature-bug", feature: id };
  return null;
}

/** Every place a bug can go now: a bug under each feature in progress, a task on each story being worked, the list. */
function choices(cards: readonly Card[], config: ProjectConfig): PlacementChoice[] {
  const features = cards
    .filter(takesBug)
    .map((c) => ({ key: `feature:${c.id}`, label: BUG_COPY.feature(c.id, c.title) }));
  const tasks = cards
    .filter((c) => takesTask(c, config))
    .map((c) => ({ key: `task:${c.id}`, label: BUG_COPY.task(c.id, c.title) }));
  return [...features, ...tasks, { key: "project", label: BUG_COPY.project }];
}

/** What the confirm shows for a bug believed to come from `cause`: `routeProblem`'s proposal and every choice. */
export function bugPlacements(cause: string | null, cards: readonly Card[], config: ProjectConfig): BugPlacements {
  return { proposed: placementKey(routeProblem(cause, cards, config)), choices: choices(cards, config) };
}

/** Why the bug can't go to `key` now (it names no place, or one no longer offered, such as a feature now Done); null if it can. */
export function placementRefusal(key: unknown, cards: readonly Card[], config: ProjectConfig): string | null {
  if (routeOf(key) === null) return REPORT_BUG_MESSAGES.badPlacement;
  return choices(cards, config).some((c) => c.key === key) ? null : REPORT_BUG_MESSAGES.placeGone(String(key));
}

/** A bug report from the Dev Lead's tool or New bug, checked; the cause only as an id, which the server looks up. */
export function parseBugReport(input: unknown): { ok: true; value: BugReport } | { ok: false; error: string } {
  const raw = isRecord(input) ? input : {};
  const title = typeof raw.title === "string" ? raw.title.trim().replace(/\s+/g, " ") : "";
  if (!title) return { ok: false, error: REPORT_BUG_MESSAGES.badTitle };
  if (title.length > BUG_TITLE_MAX) return { ok: false, error: REPORT_BUG_MESSAGES.longTitle };
  if (raw.description !== undefined && typeof raw.description !== "string") {
    return { ok: false, error: REPORT_BUG_MESSAGES.badDescription };
  }
  const description = (raw.description ?? "").trim();
  if (description.length > BUG_DESCRIPTION_MAX) return { ok: false, error: REPORT_BUG_MESSAGES.longDescription };
  const given = raw.cause === undefined || raw.cause === null ? "" : raw.cause;
  if (typeof given !== "string") return { ok: false, error: REPORT_BUG_MESSAGES.badCause };
  const cause = given.trim().toUpperCase();
  if (cause && parseId(cause) === null) return { ok: false, error: REPORT_BUG_MESSAGES.badCause };
  return { ok: true, value: { title, description, cause: cause || null } };
}

/** `bug.propose`'s `{ dir, cause }` params, or null; the cause as `parseBugReport` reads it. */
export function bugProposeParams(params: unknown): { dir: string; cause: string | null } | null {
  if (!isRecord(params) || typeof params.dir !== "string") return null;
  const read = parseBugReport({ title: "-", cause: params.cause });
  return read.ok ? { dir: params.dir, cause: read.value.cause } : null;
}

/** `bug.file`'s `{ dir, title, description, cause, placement }` params, or why they can't be filed. */
export function bugFileParams(
  params: unknown,
): { ok: true; dir: string; report: BugReport; placement: PlacementKey } | { ok: false; error: string } {
  if (!isRecord(params) || typeof params.dir !== "string" || typeof params.placement !== "string") {
    return { ok: false, error: "Expected { dir, title, description, cause, placement }." };
  }
  const read = parseBugReport(params);
  return read.ok ? { ok: true, dir: params.dir, report: read.value, placement: params.placement } : read;
}

/** The line a bug's description ends with, naming the card believed to have caused it. */
export const causeLine = (cause: Pick<Card, "id" | "title">): string => BUG_COPY.causedBy(`${cause.id} ${cause.title}`);

/** What filing makes: a new bug card, or the story given a task. */
export type FiledBug = { kind: "card"; card: Card } | { kind: "task"; card: Card };

export interface FileBugContext {
  cards: readonly Card[];
  config: ProjectConfig;
  /** The id the server allocated, used when the bug is a card. */
  id: string;
  by: string;
  at: string;
}

/** The text of the task a bug adds to the story it came from. */
export const bugTaskText = (title: string): string => `Fix bug: ${title}`;

/**
 * The bug `report` filed at `key`, which `placementRefusal` allowed: a new card at the first stage, with the suspected
 * cause in its description, under the feature or on the project list; or the story with a task added, logged in its
 * history.
 */
export function fileBug(report: BugReport, key: PlacementKey, ctx: FileBugContext): FiledBug {
  const route = routeOf(key);
  if (!route) throw new Error(REPORT_BUG_MESSAGES.badPlacement);
  const cause = report.cause ? ctx.cards.find((c) => c.id === report.cause) : undefined;
  if (route.kind === "task") {
    const story = ctx.cards.find((c) => c.id === route.card);
    if (!story) throw new Error(REPORT_BUG_MESSAGES.placeGone(key));
    const edited = { ...story, tasks: [...story.tasks, { text: bugTaskText(report.title), done: false }] };
    return { kind: "task", card: recorded(story, edited, "task", ctx.by, ctx.at) };
  }
  const parent = route.kind === "feature-bug" ? route.feature : null;
  const siblings = ctx.cards.filter((c) => c.parent === parent && (c.type === "story" || c.type === "bug"));
  const order = Math.max(0, ...siblings.map((c) => c.order)) + 1;
  const description = [report.description, cause ? causeLine(cause) : ""].filter(Boolean).join("\n\n");
  const status = ctx.config.stages[0]?.name ?? "New";
  const card = newCard(
    { id: ctx.id, type: "bug", title: report.title, status, parent, order, origin: "bug", description },
    ctx.by,
    ctx.at,
  );
  return { kind: "card", card };
}

/** The message of the commit that files a bug where its owner isn't checked out. */
export const bugCommitMessage = (filed: FiledBug): string =>
  filed.kind === "card" ? `${filed.card.id}: bug filed` : `${filed.card.id}: bug task added`;
