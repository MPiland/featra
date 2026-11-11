/**
 * Story agents report to the Dev Lead (STORY-54, ADR 0028). When a story session's turn ends, stops or fails, or the
 * session asks a question, the app writes a short notice and puts it in the chat that started the story, as a message
 * the Dev Lead can act on: no model call writes it. A notice that arrives while the Dev Lead is busy waits, and the ones
 * that waited go in one message when its turn ends. A story's question goes to the Dev Lead, never to the user.
 */
import {
  ASKED_LEAD,
  errorMessage,
  noticeMessage,
  outcomeOf,
  questionSummary,
  turnSummary,
  type Notice,
  type TurnOutcome,
} from "@featra/work-format";
import type { Chat } from "./chat-state.ts";
import type { QuestionRequest, Refusal } from "./provider.ts";

export interface NoticeHost {
  chats: Map<string, Chat>;
  open: (id: string) => Promise<void>;
  /** Sends the chat a message as the user would; refused while it runs. */
  send: (id: string, text: string) => void;
  log: (message: string) => void;
}

export interface StoryNotices {
  /**
   * A story session asks the user to choose. The question goes to its Dev Lead with the notice of the turn, and the
   * session is told so (a refusal, so its turn ends); null when it has no Dev Lead to ask, and the user is asked.
   */
  asked: (c: Chat, request: Pick<QuestionRequest, "questions">) => Refusal | null;
  /** A chat's turn ended: a story session reports to its Dev Lead, and a Dev Lead gets the notices that waited. */
  turnEnded: (c: Chat, outcome: TurnOutcome) => void;
  /** A story session that never started was taken off the queue by the user. */
  removed: (c: Chat) => void;
}

export function createStoryNotices({ chats, open, send, log }: NoticeHost): StoryNotices {
  const pending = new Map<string, Notice[]>();
  const chains = new Map<string, Promise<void>>();
  /** The question a story session's turn asked its Dev Lead, until the turn ends. */
  const asking = new Map<string, string>();

  /** The chat that started the story, when it can still be told: not gone, not closed, and a chat that can run. */
  function leadOf(c: Chat): Chat | null {
    const parent = c.summary.story?.parent;
    const lead = parent ? chats.get(parent) : undefined;
    return lead && lead !== c && !lead.closed && lead.summary.story === undefined && lead.refusal === null
      ? lead
      : null;
  }

  async function flush(id: string) {
    if (!pending.get(id)?.length) return;
    const lead = chats.get(id);
    if (!lead || lead.closed) {
      pending.delete(id);
      return;
    }
    await open(id);
    // Its turn is on: the notices wait, and go when it ends.
    if (lead.running) return;
    const notices = pending.get(id) ?? [];
    pending.delete(id);
    if (notices.length > 0) send(id, noticeMessage(notices));
  }

  /** One delivery after another per chat, so two notices at once are never two messages. */
  function deliver(id: string) {
    const next = (chains.get(id) ?? Promise.resolve())
      .then(() => flush(id))
      .catch((err: unknown) => {
        pending.delete(id);
        log(`A story notice couldn't reach the Dev Lead's chat: ${errorMessage(err)}`);
      });
    chains.set(id, next);
    void next.then(() => {
      if (chains.get(id) === next) chains.delete(id);
    });
  }

  function post(lead: Chat, notice: Notice) {
    pending.set(lead.id, [...(pending.get(lead.id) ?? []), notice]);
    deliver(lead.id);
  }

  return {
    asked(c, { questions }) {
      if (!c.summary.story || !leadOf(c)) return null;
      asking.set(c.id, questionSummary(questions));
      return { allow: false, message: ASKED_LEAD };
    },
    turnEnded(c, outcome) {
      if (pending.has(c.id)) deliver(c.id);
      const story = c.summary.story;
      const asked = asking.get(c.id);
      asking.delete(c.id);
      const lead = story ? leadOf(c) : null;
      if (!story || !lead) return;
      // A question is what the Dev Lead needs to hear of a turn that ended on one; a stop or a failure outranks it.
      if (asked !== undefined && outcome === "done") post(lead, { story: story.id, outcome: "asks", summary: asked });
      else post(lead, { story: story.id, outcome: outcomeOf(outcome), summary: turnSummary(c.events ?? [], outcome) });
    },
    removed(c) {
      const story = c.summary.story;
      const lead = story ? leadOf(c) : null;
      if (story && lead) {
        post(lead, { story: story.id, outcome: "stopped", summary: "Taken off the queue before it started." });
      }
    },
  };
}
