/**
 * What the user does to a story session's agent from outside its transcript (STORY-53, ADR 0026): stop its turn, drop
 * it from the queue before it starts, and resume it. The session manager's own pieces, kept here so it stays small.
 */
import { CHAT_MESSAGES, errorMessage, RESUME_MESSAGE, type ChatEvent, type ProviderId } from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import type { ChatManager } from "./chat-manager-types.ts";
import type { StoryRunner } from "./chat-stories.ts";
import type { StoryNotices } from "./story-notices.ts";
import type { Chat } from "./chat-state.ts";
import type { ProviderAdapter } from "./provider.ts";

export interface StoryControlHost {
  chat: (id: string) => Chat;
  open: (id: string) => Promise<void>;
  provider: (id: ProviderId) => ProviderAdapter | undefined;
  record: (c: Chat, event: ChatEvent) => void;
  stories: StoryRunner;
  notices: StoryNotices;
  /** Claims the session's next turn, refused when one runs or is claimed (see chat-send.ts). */
  claim: (c: Chat) => () => void;
  listChanged: (dir: string) => void;
  log: (message: string) => void;
}

export function storyControl({
  chat,
  open,
  provider,
  record,
  stories,
  notices,
  claim,
  listChanged,
  log,
}: StoryControlHost): Pick<ChatManager, "resume" | "stop" | "dropQueued"> {
  return {
    async resume(id, before = async () => {}) {
      await open(id);
      const c = chat(id);
      if (!provider(c.summary.provider)?.resumes) throw new ChatError(CHAT_MESSAGES.noResume);
      if (!c.summary.story) throw new ChatError(CHAT_MESSAGES.noSession);
      const agent = c.agent;
      if (!agent) throw new ChatError(c.refusal ?? CHAT_MESSAGES.noProvider);
      if (!(c.session ?? agent.sessionId())) throw new ChatError(CHAT_MESSAGES.unsaved);
      if (c.running || c.summary.queued) throw new ChatError(CHAT_MESSAGES.busy);
      // Every check is made: the caller's own step (the card) comes before anything is sent.
      await before();
      // The card step let others in: a message the Dev Lead sent meanwhile has the turn, and this Resume is busy.
      const release = claim(c);
      // The message joins the transcript when the turn starts, so a turn stopped while it waits for a slot leaves none.
      const run = () => {
        record(c, { type: "user", text: RESUME_MESSAGE });
        agent.send(RESUME_MESSAGE);
      };
      try {
        await stories.turn(c, run);
      } catch (err) {
        log(`A story session's turn couldn't wait for a slot: ${errorMessage(err)}`);
        run();
      } finally {
        release();
      }
    },
    async stop(id) {
      const c = chat(id);
      if (!c.running && !c.summary.queued) return;
      // A turn still waiting for a slot just leaves the queue: it never started, so it has no end to record.
      if (await stories.cancelTurn(c)) {
        if (c.running) record(c, { type: "turn-end", outcome: "stopped" });
        return;
      }
      if (c.running) await c.agent?.interrupt();
    },
    dropQueued(id) {
      const c = chat(id);
      if (!c.summary.queued || c.agent) return false;
      notices.removed(c);
      stories.dropped(c);
      listChanged(c.dir);
      return true;
    },
  };
}
