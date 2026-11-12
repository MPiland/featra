/**
 * How the sidebar nests story sessions (STORY-9 AC4): a session sits under its Dev Lead's chat while that chat is listed,
 * and otherwise under a group named after its feature. A subagent a session spawned for itself sits under that session
 * (STORY-55), whichever row the session is on. Pure, so the sidebar and its tests share one copy of the rule.
 */
import type { ChatList, ChatSummary, ProviderInfo } from "./chat-list.ts";

/** The most ended subagents a session keeps listed; the oldest ended go first (STORY-55). */
export const MAX_ENDED_SUBAGENTS = 20;

/** A chat of the list with the story sessions nested under it, in the order given. */
export interface ChatBranch {
  chat: ChatSummary;
  children: ChatSummary[];
}

/** Story sessions whose Dev Lead's chat isn't listed: named after the feature they belong to. */
export interface FeatureGroup {
  feature: string;
  title: string;
  sessions: ChatSummary[];
}

export interface NestedChats {
  branches: ChatBranch[];
  groups: FeatureGroup[];
  /** The subagents under each session, by the session's chat id, in the order given. */
  subagents: ReadonlyMap<string, ChatSummary[]>;
}

/** `chats` (already in display order) as branches and feature groups. A chat with no story keeps its place. */
export function nestChats(
  chats: readonly ChatSummary[],
  listed: ReadonlySet<string> = new Set(chats.map((c) => c.id)),
) {
  const subagents = new Map<string, ChatSummary[]>();
  // A subagent whose session isn't listed falls back to a row of its own, so none goes missing.
  const isSubagent = (chat: ChatSummary) => chat.subagent !== undefined && listed.has(chat.subagent.parent);
  for (const chat of chats.filter(isSubagent)) {
    const parent = chat.subagent?.parent ?? "";
    subagents.set(parent, [...(subagents.get(parent) ?? []), chat]);
  }
  const rest = chats.filter((chat) => !isSubagent(chat));
  const nested: NestedChats = { branches: [], groups: [], subagents };
  const children = new Map<string, ChatSummary[]>();
  // A session is itself nested (or grouped), so it never holds sessions of its own: one whose parent is a session
  // falls back to the feature group, and none goes missing.
  const sessions = new Set(rest.filter((c) => c.story).map((c) => c.id));
  for (const chat of rest) {
    const parent = chat.story?.parent;
    if (parent && listed.has(parent) && parent !== chat.id && !sessions.has(parent))
      children.set(parent, [...(children.get(parent) ?? []), chat]);
  }
  const nestedIds = new Set([...children.values()].flat().map((c) => c.id));
  for (const chat of rest) {
    if (nestedIds.has(chat.id)) continue;
    if (chat.story) {
      const { feature, featureTitle } = chat.story;
      const group = nested.groups.find((g) => g.feature === feature);
      if (group) group.sessions.push(chat);
      else nested.groups.push({ feature, title: featureTitle, sessions: [chat] });
    } else nested.branches.push({ chat, children: children.get(chat.id) ?? [] });
  }
  return nested;
}

export interface ChatGroup {
  provider: ProviderInfo;
  chats: ChatSummary[];
}

/**
 * The list as the sidebar shows it: one group per installed provider, in the order the server lists them, plus any
 * provider that isn't installed but still has chats (so none go missing). Newest chat first in each group.
 */
const newestFirst = (a: ChatSummary, b: ChatSummary) =>
  b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id);

export function groupChats(list: ChatList): ChatGroup[] {
  return list.providers
    .map((provider) => ({
      provider,
      chats: list.chats.filter((c) => c.provider === provider.id).toSorted(newestFirst),
    }))
    .filter((g) => g.provider.installed || g.chats.length > 0);
}
