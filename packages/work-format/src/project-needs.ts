/**
 * What each open project needs from the user (STORY-66): its waiting agents, and whether it has work to review. Pure,
 * so the server counts and the client reads what it sends with one copy of the rules.
 *
 * A waiting agent is a chat with at least one request open on the user: an approval or a question, whether it is
 * answered inline or in the Inbox, so the Inbox wait doesn't matter. The count is of chats, not requests. Any kind of
 * request the Inbox holds counts, so a new kind (STORY-68) counts once it is one. A finished turn holds nothing.
 *
 * A review is quieter and apart from the count: a draft feature an agent made for the user, or a story at Acceptance
 * the user can accept, as the Work list marks them.
 */
import { isRecord } from "./utils/guards.ts";
import type { WorkList } from "./work-list-types.ts";

/** One project's needs. `dir` is the project's folder as the project list has it. */
export interface ProjectNeeds {
  dir: string;
  /** How many of its agents wait on the user. */
  waiting: number;
  /** Whether it has a draft feature to review or a story at Acceptance. */
  review: boolean;
}

/** What `needs.watch` answers and pushes: every open project, in the project list's order. */
export interface NeedsList {
  projects: ProjectNeeds[];
}

export const EMPTY_NEEDS: NeedsList = { projects: [] };

/** How many agents the open requests stall: one per chat, however many requests it has open. */
export function waitingAgents(requests: Iterable<{ chat: string }>): number {
  return new Set([...requests].map((r) => r.chat)).size;
}

/**
 * How many agents wait on the user across every open project: the taskbar and Dock badge (STORY-67). Each agent is in
 * one project, so it is the sum of the switcher's counts. Reviews don't count.
 */
export const waitingTotal = (list: NeedsList): number => list.projects.reduce((sum, p) => sum + p.waiting, 0);

/** Whether the Work list has something for the user to review: a drafted feature, or a story waiting for Accept. */
export function hasReview(list: WorkList): boolean {
  const features = list.epics.flatMap((e) => e.features);
  return features.some((f) => f.review === true || f.stories.some((s) => s.awaiting));
}

/** Whether a project needs the user at all. */
export const needsYou = (p: ProjectNeeds): boolean => p.waiting > 0 || p.review;

/** The needs of the project at `dir`, or none when it isn't listed. */
export function needsOf(list: NeedsList, dir: string | undefined): ProjectNeeds | undefined {
  return dir === undefined ? undefined : list.projects.find((p) => p.dir === dir);
}

/** How many projects other than the current one need the user: the closed switcher shows a dot for any. */
export function othersNeedingYou(list: NeedsList, current: string | undefined): number {
  return list.projects.filter((p) => p.dir !== current && needsYou(p)).length;
}

function normalizeProjectNeeds(raw: unknown): ProjectNeeds | null {
  if (!isRecord(raw) || typeof raw.dir !== "string" || !raw.dir) return null;
  const n = raw.waiting;
  const waiting = typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : 0;
  return { dir: raw.dir, waiting, review: raw.review === true };
}

/** A needs list read from the socket; anything malformed in it is dropped. */
export function normalizeNeeds(raw: unknown): NeedsList {
  const projects = isRecord(raw) && Array.isArray(raw.projects) ? raw.projects : [];
  return { projects: projects.map(normalizeProjectNeeds).filter((p): p is ProjectNeeds => p !== null) };
}
