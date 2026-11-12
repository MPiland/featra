/**
 * The Dev Lead's `message_session` (STORY-54, ADR 0028): a message to a story's session, which goes on in the same
 * provider session, taking a story slot or waiting for one like any turn. Only the chat that started the story may send
 * it, and a session the user Stopped is not messaged: Stop is the user's, and only Resume clears it.
 */
import { leadMessage, MERGE_MESSAGES, messageRefusal, MESSAGE_MESSAGES, type MessageInput } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { ChatManager } from "./chat-manager.ts";
import { ChatError } from "./chat-error.ts";
import { storyCardIn } from "./story-card.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryMessageDeps {
  scan: (dir: string) => Promise<Scan | null>;
  chats: Pick<ChatManager, "storySession" | "list" | "open" | "send">;
  /** Whether the story is merging (STORY-12): its session is about to end, so it takes no message. */
  merging?: (dir: string, id: string) => boolean;
}

export function createStoryMessage({ scan, chats, merging = () => false }: StoryMessageDeps) {
  return {
    /** Sends `input.text` to the story's session on behalf of the chat `lead`. */
    async send(dir: string, input: MessageInput, lead: string): Promise<{ story: string }> {
      const { card, tone } = storyCardIn(await scan(dir), input.story);
      const chat = chats.storySession(dir, input.story);
      const row = chat === null ? undefined : chats.list(dir).find((c) => c.id === chat);
      const state = row ? { running: row.running, queued: row.queued === true, lead: row.story?.parent ?? null } : null;
      const refusal = messageRefusal(card, tone, input.story, state, lead);
      if (refusal !== null || chat === null) throw new ApiError(refusal ?? MESSAGE_MESSAGES.noSession(input.story));
      if (merging(dir, input.story)) throw new ApiError(MERGE_MESSAGES.busy(input.story));
      try {
        await chats.open(chat);
        chats.send(chat, leadMessage(input.text));
      } catch (err) {
        if (err instanceof ChatError) throw new ApiError(err.message);
        throw err;
      }
      return { story: input.story };
    },
  };
}

export type StoryMessage = ReturnType<typeof createStoryMessage>;
