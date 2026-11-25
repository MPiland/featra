/**
 * The Dev Lead's `message_session` (STORY-54, ADR 0028): a message to a story's session, which goes on in the same
 * provider session, taking a story slot or waiting for one like any turn. Only the chat that started the story may send
 * it, and a session the user Stopped is not messaged: Stop is the user's, and only Resume clears it. The Dev Lead's
 * design findings (STORY-73) go the same way, in two steps so the card write can sit between them.
 */
import { leadMessage, messageRefusal, MESSAGE_MESSAGES, type MessageInput } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { ChatManager } from "./chat-manager.ts";
import { ChatError } from "./chat-error.ts";
import { storyCardIn } from "./story-card.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryMessageDeps {
  scan: (dir: string) => Promise<Scan | null>;
  chats: Pick<ChatManager, "storySession" | "list" | "open" | "send">;
  /** Why the story takes no message now (STORY-12, STORY-58): it is merging or being abandoned, so its session is about to end. Null when it does. */
  busy?: (dir: string, id: string) => string | null;
}

/** Runs `step` with the chat's own refusal (busy, failed) said as the API's. */
async function asApi<T>(step: () => T | Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (err) {
    if (err instanceof ChatError) throw new ApiError(err.message);
    throw err;
  }
}

export function createStoryMessage({ scan, chats, busy = () => null }: StoryMessageDeps) {
  /** The story's session, when `lead` may message it now; throws why not otherwise. */
  async function sessionOf(dir: string, story: string, lead: string): Promise<string> {
    const { card, tone } = storyCardIn(await scan(dir), story);
    const chat = chats.storySession(dir, story);
    const row = chat === null ? undefined : chats.list(dir).find((c) => c.id === chat);
    const state = row ? { running: row.running, queued: row.queued === true, lead: row.story?.parent ?? null } : null;
    const refusal = messageRefusal(card, tone, story, state, lead);
    if (refusal !== null || chat === null) throw new ApiError(refusal ?? MESSAGE_MESSAGES.noSession(story));
    const ending = busy(dir, story);
    if (ending !== null) throw new ApiError(ending);
    return chat;
  }

  return {
    /** Sends `input.text` to the story's session on behalf of the chat `lead`. */
    async send(dir: string, input: MessageInput, lead: string): Promise<{ story: string }> {
      const chat = await sessionOf(dir, input.story, lead);
      await asApi(async () => {
        await chats.open(chat);
        chats.send(chat, leadMessage(input.text));
      });
      return { story: input.story };
    },

    /** Opens the story's session for a message from `lead`, which can be slow; throws when it can't take one. */
    async ready(dir: string, story: string, lead: string): Promise<void> {
      const chat = await sessionOf(dir, story, lead);
      await asApi(() => chats.open(chat));
    },

    /** Sends `text` to the story's session, opened by `ready`, from `lead`; throws when it can't take it now. */
    async deliver(dir: string, story: string, lead: string, text: string): Promise<void> {
      const chat = await sessionOf(dir, story, lead);
      await asApi(() => chats.send(chat, leadMessage(text)));
    },
  };
}

export type StoryMessage = ReturnType<typeof createStoryMessage>;
