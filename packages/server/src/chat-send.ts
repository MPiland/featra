/**
 * Sending a message to a chat, and the one step every send to a story session goes through (STORY-54): a turn is
 * claimed before it is admitted, so `message_session` and Resume racing for an idle session never put two messages in
 * one turn. The first to claim wins; the other is refused as busy.
 */
import { CHAT_MESSAGES, errorMessage, type ChatEvent } from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import type { StoryRunner } from "./chat-stories.ts";
import type { Chat } from "./chat-state.ts";

export interface SendHost {
  chat: (id: string) => Chat;
  record: (c: Chat, event: ChatEvent) => void;
  stories: StoryRunner;
  log: (message: string) => void;
}

export function createSend({ chat, record, stories, log }: SendHost) {
  /** Chats with a turn being admitted that has not yet shown as running or queued. */
  const turning = new Set<string>();
  /** Working, being claimed, or its turn waiting for a slot. (A story that never started has no agent: its refusal says so.) */
  const busy = (c: Chat) => c.running || turning.has(c.id) || (c.summary.queued === true && c.agent !== null);

  return {
    /** Claims the chat's next turn; refused while one runs, waits or is being claimed. Call the result when admitted. */
    claim(c: Chat): () => void {
      if (busy(c)) throw new ChatError(CHAT_MESSAGES.busy);
      turning.add(c.id);
      return () => void turning.delete(c.id);
    },
    /** Sends the user's message, starting the agent first if it isn't running. */
    send(id: string, text: string) {
      const c = chat(id);
      if (busy(c)) throw new ChatError(CHAT_MESSAGES.busy);
      if (c.events === null) throw new Error("Open the chat before sending to it.");
      const agent = c.agent;
      if (!agent) throw new ChatError(c.refusal ?? CHAT_MESSAGES.noProvider);
      record(c, { type: "user", text });
      // A story session's turn, any turn, holds one of the project's story slots, or waits for one (STORY-9 AC5).
      if (c.summary.story) {
        stories
          .turn(c, () => agent.send(text))
          .catch((err: unknown) => {
            log(`A story session's turn couldn't wait for a slot: ${errorMessage(err)}`);
            agent.send(text);
          });
        return;
      }
      agent.send(text);
    },
  };
}
