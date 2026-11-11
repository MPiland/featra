/**
 * Starting a story's agent (STORY-9, ADR 0025): pure rules over cards. A story agent is a Featra-run provider session
 * in its own worktree, cut from the feature's branch. These say what the worktree and its branch are called, why a
 * story can't be started, what the story's card says once it has been, and the first message the agent is given.
 */
import { serializeCard } from "./card.ts";
import { setStatus } from "./history.ts";
import { parseId, slugify } from "./ids.ts";
import type { Card } from "./types.ts";
import { isRecord } from "./utils/guards.ts";

/** The status a story has while its agent works. */
export const IN_PROGRESS = "In Progress";
/** The statuses a story can be started from. */
const STARTABLE: ReadonlySet<string> = new Set(["New", "Ready"]);
/** The role a story's agent runs as when the caller names none. */
export const STORY_ROLE = "developer";
/** The most story sessions that run at once when no setting says. */
export const DEFAULT_MAX_STORY_AGENTS = 3;
/** The branch prefix of a story's worktree: `featra/story-<N>-<slug>`, which `itemIdOfBranch` maps back to the story. */
const BRANCH_PREFIX = "featra";

const number = (card: Pick<Card, "id">) => parseId(card.id)?.n ?? 0;

/** The worktree's folder name: `STORY-<N>-<slug of title>` (`STORY-<N>` when the title has no letters or digits). */
export function storyFolderName(card: Pick<Card, "id" | "title">): string {
  const slug = slugify(card.title);
  return slug ? `${card.id}-${slug}` : card.id;
}

/** The worktree's branch: `featra/story-<N>-<slug>`, so the branch names the story (`itemIdOfBranch`). */
export function storyBranchName(card: Pick<Card, "id" | "title">): string {
  const slug = slugify(card.title);
  return slug ? `${BRANCH_PREFIX}/story-${number(card)}-${slug}` : `${BRANCH_PREFIX}/story-${number(card)}`;
}

/** Why `story` can't be started under `feature`, or null when it can. `featureBranch` is the feature's branch if it exists. */
export function notSpawnableReason(
  story: Card | undefined,
  feature: Card | undefined,
  featureBranch: string | null,
  id: string,
): string | null {
  if (!story) return "That card is gone.";
  if (story.type !== "story") return `${id} isn't a story.`;
  if (!STARTABLE.has(story.status)) return `${id} is already ${story.status}.`;
  if (!feature || feature.type !== "feature") return `${id} has no feature to start it under.`;
  if (feature.status !== "active" || featureBranch === null) return `${feature.id} isn't started yet. Start it first.`;
  return null;
}

/** Who started it: `user`, or `session:<chat>` (as `starter` does for features). */
export const spawner = (chat: string | null): string => (chat === null ? "user" : `session:${chat}`);

/** What a started story's card records of its agent. */
export interface StoryStart {
  agent: string;
  model: string;
  reasoning: string;
  session: string;
  branch: string;
}

/** The story as started: In Progress with the status event, and its agent, model, reasoning, session and branch. */
export function startedStory(story: Card, start: StoryStart, by: string, at: string): Card {
  const moved = setStatus(story, IN_PROGRESS, by, at);
  return {
    ...moved,
    agent: start.agent,
    model: start.model,
    reasoning: start.reasoning,
    sessions: [...moved.sessions.filter((s) => s !== start.session), start.session],
    branch: start.branch,
  };
}

/** What the story's first message says; the caller read the role's template and the card. */
export interface FirstMessage {
  template: string;
  card: Card;
  branch: string;
  worktree: string;
  brief?: string | null;
}

/**
 * The story agent's first message: the role's template, the card (description, acceptance criteria, tasks and notes as
 * its file has them), its branch and worktree, pointers to CONTEXT.md and decisions.md, and the Dev Lead's brief.
 */
export function storyFirstMessage({ template, card, branch, worktree, brief }: FirstMessage): string {
  const parts = [
    template.trim(),
    `You are working on ${card.id}, "${card.title}". Its card:\n\n${serializeCard(card).trim()}`,
    `Branch: ${branch}\nWorktree: ${worktree}`,
    "Read CONTEXT.md for the project's language and decisions.md for what has been decided. Update only this card.",
    ...(brief?.trim() ? [`Brief from the Dev Lead:\n${brief.trim()}`] : []),
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** A `spawn_session` call: the story, and optionally the role, model, effort and a brief. */
export interface SpawnInput {
  story: string;
  role: string;
  model?: string;
  effort?: string;
  brief?: string;
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** The call's input, or why it isn't one. */
export function parseSpawnInput(input: unknown): { ok: true; value: SpawnInput } | { ok: false; error: string } {
  const raw = isRecord(input) ? input : {};
  const story = (text(raw.story) ?? "").toUpperCase();
  if (parseId(story)?.prefix !== "STORY")
    return { ok: false, error: "Give the story's id, such as STORY-9, as `story`." };
  const model = text(raw.model);
  const effort = text(raw.effort);
  const brief = text(raw.brief);
  return {
    ok: true,
    value: {
      story,
      role: text(raw.role) ?? STORY_ROLE,
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      ...(brief ? { brief } : {}),
    },
  };
}

/** The most story sessions a project runs at once: a positive whole number, else the default. */
export function storyAgentLimit(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : DEFAULT_MAX_STORY_AGENTS;
}
