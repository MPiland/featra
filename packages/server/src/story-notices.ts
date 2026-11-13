/**
 * Story agents report to the Dev Lead (STORY-54, ADR 0028). When a story session's turn ends, stops or fails, or the
 * session asks a question, the app writes a short notice and puts it in the chat that started the story, as a message
 * the Dev Lead can act on: no model call writes it. A notice that arrives while the Dev Lead is busy waits, and the ones
 * that waited go in one message when its turn ends (not when the user stopped that turn: they wait for the next).
 * A story's question goes to the Dev Lead, never to the user, unless there is no Dev Lead left to take it.
 */
import {
  askedSummary,
  ASKED_LEAD,
  errorMessage,
  noticeMessage,
  oneLine,
  outcomeOf,
  turnSummary,
  userAnswerMessage,
  type Notice,
  type TurnOutcome,
} from "@featra/work-format";
import type { Chat } from "./chat-state.ts";
import type { QuestionDecision, QuestionRequest, Refusal } from "./provider.ts";

type Asked = Omit<QuestionRequest, "chat">;

export interface NoticeHost {
  chats: Map<string, Chat>;
  open: (id: string) => Promise<void>;
  /** Sends the chat a message as the user would; refused while it runs. */
  send: (id: string, text: string) => void;
  /** Asks the user a story session's question in its own chat (the path of a story with no Dev Lead). */
  askUser: (c: Chat, request: Asked) => Promise<QuestionDecision>;
  log: (message: string) => void;
}

export interface StoryNotices {
  /**
   * A story session asks the user to choose. The question goes to its Dev Lead with the notice of the turn, and the
   * session is told so (a refusal, so its turn ends); null when it has no Dev Lead to ask, and the user is asked.
   */
  asked: (c: Chat, request: Asked) => Refusal | null;
  /** A chat's turn ended: a story session reports to its Dev Lead, and a Dev Lead gets the notices that waited. */
  turnEnded: (c: Chat, outcome: TurnOutcome) => void;
  /** A story session that never started was taken off the queue by the user. */
  removed: (c: Chat) => void;
  /** A story session that waited for a slot could not start. */
  failedStart: (c: Chat, reason: string) => void;
  /** Puts `notice` in the Dev Lead's chat `id`, when it can still be told (STORY-12: how a merge it asked for went). */
  tell: (id: string, notice: Notice) => void;
  /** A chat's agent ended: what it held, notices and questions, goes with it. */
  forget: (c: Chat) => void;
}

export function createStoryNotices({ chats, open, send, askUser, log }: NoticeHost): StoryNotices {
  const pending = new Map<string, Notice[]>();
  const chains = new Map<string, Promise<void>>();
  /** The questions a story session's turn asked its Dev Lead, until the turn ends. */
  const asking = new Map<string, Asked[]>();
  /** Dev Leads whose last turn the user stopped: their notices wait for a turn that isn't a stop. */
  const stopped = new Set<string>();

  /** The chat that started the story, when it can still be told: not gone, not closed, and a chat that can run. */
  function leadOf(c: Chat): Chat | null {
    const parent = c.summary.story?.parent;
    const lead = parent ? chats.get(parent) : undefined;
    return lead && lead !== c && !lead.closed && lead.summary.story === undefined && lead.refusal === null
      ? lead
      : null;
  }

  async function flush(id: string) {
    if (!pending.get(id)?.length || stopped.has(id)) return;
    const lead = chats.get(id);
    if (!lead || lead.closed) {
      pending.delete(id);
      return;
    }
    await open(id);
    // Its turn is on: the notices wait, and go when it ends.
    if (lead.running) return;
    const notices = pending.get(id) ?? [];
    if (notices.length === 0) return;
    send(id, noticeMessage(notices));
    // Only what was sent goes: a send that threw leaves them for the next idle, and a notice that came meanwhile stays.
    const rest = (pending.get(id) ?? []).slice(notices.length);
    if (rest.length > 0) pending.set(id, rest);
    else pending.delete(id);
  }

  /** One delivery after another per chat, so two notices at once are never two messages. */
  function deliver(id: string) {
    const next = (chains.get(id) ?? Promise.resolve())
      .then(() => flush(id))
      .catch((err: unknown) => {
        // Only a Dev Lead that can't be told again loses them; a transient error keeps them for the next idle.
        const lead = chats.get(id);
        if (!lead || lead.closed || lead.refusal !== null) pending.delete(id);
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

  /** The Dev Lead is gone: the user is asked each question held, and the answer goes to the session. */
  function askTheUser(c: Chat, requests: readonly Asked[]) {
    for (const request of requests) {
      void askUser(c, request)
        .then(async (decision) => {
          if (!decision.allow) return;
          await open(c.id);
          send(c.id, userAnswerMessage(decision.answers));
        })
        .catch((err: unknown) => log(`A story's question couldn't reach the user: ${errorMessage(err)}`));
    }
  }

  return {
    asked(c, request) {
      if (!c.summary.story || !leadOf(c)) return null;
      asking.set(c.id, [...(asking.get(c.id) ?? []), request]);
      return { allow: false, message: ASKED_LEAD };
    },
    turnEnded(c, outcome) {
      const story = c.summary.story;
      if (!story) {
        // A Dev Lead's turn the user stopped is not the time to put more in front of it.
        if (outcome === "stopped") stopped.add(c.id);
        else {
          stopped.delete(c.id);
          if (pending.has(c.id)) deliver(c.id);
        }
        return;
      }
      const requests = asking.get(c.id);
      asking.delete(c.id);
      const lead = leadOf(c);
      if (!lead) {
        if (requests && outcome === "done") askTheUser(c, requests);
        return;
      }
      // A question is what the Dev Lead needs to hear of a turn that ended on one; a stop or a failure outranks it.
      if (requests && outcome === "done") {
        post(lead, {
          story: story.id,
          outcome: "asks",
          summary: askedSummary(
            requests.map((r) => r.questions),
            requests.map((r) => r.subagent),
          ),
        });
      } else {
        post(lead, { story: story.id, outcome: outcomeOf(outcome), summary: turnSummary(c.events ?? [], outcome) });
      }
    },
    removed(c) {
      const story = c.summary.story;
      const lead = story ? leadOf(c) : null;
      if (story && lead) {
        post(lead, { story: story.id, outcome: "stopped", summary: "Taken off the queue before it started." });
      }
    },
    failedStart(c, reason) {
      const story = c.summary.story;
      const lead = story ? leadOf(c) : null;
      if (story && lead) post(lead, { story: story.id, outcome: "failed", summary: oneLine(reason) });
    },
    tell(id, notice) {
      const lead = chats.get(id);
      if (lead && !lead.closed && lead.summary.story === undefined && lead.refusal === null) post(lead, notice);
    },
    forget(c) {
      asking.delete(c.id);
      pending.delete(c.id);
      stopped.delete(c.id);
    },
  };
}
