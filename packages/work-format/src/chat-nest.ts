/**
 * How the sidebar nests story sessions (STORY-9 AC4): a session sits under its Dev Lead's chat while that chat is listed,
 * and otherwise under a group named after its feature. Pure, so the sidebar and its tests share one copy of the rule.
 */
import type { ChatSummary } from "./chat-list.ts";

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
}

/** `chats` (already in display order) as branches and feature groups. A chat with no story keeps its place. */
export function nestChats(
  chats: readonly ChatSummary[],
  listed: ReadonlySet<string> = new Set(chats.map((c) => c.id)),
) {
  const nested: NestedChats = { branches: [], groups: [] };
  const children = new Map<string, ChatSummary[]>();
  // A session is itself nested (or grouped), so it never holds sessions of its own: one whose parent is a session
  // falls back to the feature group, and none goes missing.
  const sessions = new Set(chats.filter((c) => c.story).map((c) => c.id));
  for (const chat of chats) {
    const parent = chat.story?.parent;
    if (parent && listed.has(parent) && parent !== chat.id && !sessions.has(parent))
      children.set(parent, [...(children.get(parent) ?? []), chat]);
  }
  const nestedIds = new Set([...children.values()].flat().map((c) => c.id));
  for (const chat of chats) {
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
