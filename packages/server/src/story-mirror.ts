/**
 * A story session's approvals in the Dev Lead's chat (STORY-9, ADR 0025): the approval a story session still needs is
 * shown in its parent's chat too, labelled with the story, and answered from either. The session's own request is the
 * one that escalates to the Inbox; the copy never does.
 */
import type { ChatEvent } from "@featra/work-format";
import type { Chat } from "./chat-state.ts";

export interface StoryMirror {
  /** Copies an approval event of a story session into its parent chat, when the parent is open. */
  mirror: (child: Chat, event: ChatEvent) => void;
  /** The story session that holds the request `tool` the parent chat shows, or null when it is the parent's own. */
  holder: (parent: string, tool: string) => string | null;
  /** The session ended with requests unanswered: its parent shows them cancelled. */
  clear: (child: Chat) => void;
}

interface Forwarded {
  parent: string;
  tool: string;
  holder: string;
}

const keyOf = (parent: string, tool: string) => `${parent}\n${tool}`;

/** `record` adds an event to a chat's log without telling the Inbox: the copy isn't a request of its own. */
export function createStoryMirror(chats: Map<string, Chat>, record: (c: Chat, event: ChatEvent) => void): StoryMirror {
  /** The requests shown in a parent, by parent and tool call, and the session that holds each. */
  const forwarded = new Map<string, Forwarded>();

  return {
    mirror(child, event) {
      const story = child.summary.story;
      const parent = story?.parent ? chats.get(story.parent) : undefined;
      if (!story || !parent || parent.closed || parent.events === null) return;
      if (event.type === "approval") {
        forwarded.set(keyOf(parent.id, event.id), { parent: parent.id, tool: event.id, holder: child.id });
        record(parent, { ...event, story: story.id });
        return;
      }
      if (event.type !== "tool-allowed" && event.type !== "tool-denied" && event.type !== "approval-cancelled") return;
      const key = keyOf(parent.id, event.id);
      if (forwarded.get(key)?.holder !== child.id) return;
      forwarded.delete(key);
      record(parent, event);
    },
    holder: (parent, tool) => forwarded.get(keyOf(parent, tool))?.holder ?? null,
    clear(child) {
      for (const [key, shown] of forwarded) {
        if (shown.holder !== child.id) continue;
        forwarded.delete(key);
        const c = chats.get(shown.parent);
        if (c && !c.closed && c.events !== null) record(c, { type: "approval-cancelled", id: shown.tool });
      }
    },
  };
}
