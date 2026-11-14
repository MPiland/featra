/**
 * The feature progress pane (STORY-24): which features a chat leads, and which stories wait on the user. Pure, over
 * the Work list the server sends (ADR 0016) and the chat list (ADR 0018), so the pane computes no second rollup.
 */
import { isAsk, type ChatSummary } from "./chat-list.ts";
import { parseId } from "./ids.ts";
import type { FeatureRow, StoryRow, WorkList } from "./work-list-types.ts";

/** Every feature in the list that has a card (not the row of stories without a feature). */
export const featureRows = (list: WorkList): FeatureRow[] =>
  list.epics.flatMap((e) => e.features).filter((f) => f.id !== null);

/** The feature `id` as the list has it, or null when the list has no such feature. */
export const featureRowOf = (list: WorkList, id: string): FeatureRow | null =>
  featureRows(list).find((f) => f.id === id) ?? null;

/** A led feature's rank: the one in progress first, then the next to start, a draft, and a finished one last. */
const LEAD_ORDER = ["active", "approved", "draft", "done"];
const rank = (f: FeatureRow) => {
  const at = LEAD_ORDER.indexOf(f.status ?? "");
  return at === -1 ? LEAD_ORDER.length : at;
};
const newest = (f: FeatureRow) => parseId(f.id ?? "")?.n ?? 0;
const leadFirst = (a: FeatureRow, b: FeatureRow) => rank(a) - rank(b) || newest(b) - newest(a);

/**
 * The features chat `chat` leads, the one it is working on first: active, then approved, draft and done, then the
 * newest id. So a chat leading an active feature that has just drafted the next one still shows the active one. The
 * Dev Lead of a feature is the chat that drafted it (`drafted-by`)
 * or the chat that spawned one of its story sessions (`story.parent`), as ADR 0027 and ADR 0028 say. A story session
 * leads nothing.
 */
export function featuresLedBy(chat: string, list: WorkList, chats: readonly ChatSummary[]): FeatureRow[] {
  const spawned = new Set(chats.filter((c) => c.story?.parent === chat).map((c) => c.story?.feature));
  return featureRows(list)
    .filter((f) => f.draftedBy === chat || spawned.has(f.id ?? ""))
    .toSorted(leadFirst);
}

/** What a feature's branch is, as its progress pane says it. */
export type FeatureBranch =
  | { kind: "branch"; name: string }
  | { kind: "not-started" }
  | { kind: "merged" }
  | { kind: "none" };

/**
 * A feature's branch: its name while the feature branch owns the feature's card (ADR 0002), not started before Start,
 * merged once the feature is done. Anything else (a cancelled feature, or one in progress that main still owns) has
 * none.
 */
export function featureBranch(row: Pick<FeatureRow, "branch" | "status">): FeatureBranch {
  if (row.branch) return { kind: "branch", name: row.branch };
  if (row.status === "draft" || row.status === "approved") return { kind: "not-started" };
  if (row.status === "done") return { kind: "merged" };
  return { kind: "none" };
}

/** The chat of a story's latest session, while the project still has it; null otherwise. */
export function storyChat(story: Pick<StoryRow, "session">, chats: readonly Pick<ChatSummary, "id">[]): string | null {
  const { session } = story;
  return session !== null && chats.some((c) => c.id === session) ? session : null;
}

/**
 * Whether a story waits on the user: it is in Acceptance for their Accept (`awaiting`), or its session waits on an
 * approval or a question (the chat list's waiting dot). A session waiting for a reply waits on its Dev Lead, not the
 * user (ADR 0028).
 */
export function waitsOnUser(story: Pick<StoryRow, "id" | "awaiting">, chats: readonly ChatSummary[]): boolean {
  if (story.awaiting) return true;
  return chats.some((c) => c.story?.id === story.id && isAsk(c.waiting));
}
