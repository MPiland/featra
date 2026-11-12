/**
 * The approval desk (STORY-45, ADR 0018): holds each tool request, and each question the agent asks (STORY-46), until
 * the user answers it in the chat, and remembers each chat's Allow for this chat in memory only, so it ends with the
 * chat's agent and never outlives the server. Every outcome is a chat event, so the log, the row's waiting dot and the
 * view follow from one place.
 */
import {
  APPROVAL_CANCELLED,
  CHAT_MESSAGES,
  chatRule,
  denyMessage,
  validAnswers,
  type Answers,
  type ApprovalAnswer,
  type ChatRule,
  type ChatEvent,
} from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import type {
  ApprovalHandler,
  QuestionDecision,
  QuestionHandler,
  QuestionRequest,
  Refusal,
  SuggestedRule,
  ToolDecision,
  ToolRequest,
} from "./provider.ts";
import { realPath } from "./real-path.ts";

/** A request that ended unanswered because the turn or the chat did: the agent stops rather than try another step. */
const CANCELLED: Refusal = { allow: false, message: APPROVAL_CANCELLED, interrupt: true };

/** A request asked again for the same call: the first ends so its caller isn't left waiting, and the turn goes on. */
const REPLACED: Refusal = { allow: false, message: APPROVAL_CANCELLED };

/** Allow for this chat on a request: the provider's rule, which it applies, or Featra's own, kept here. */
type Offer = { suggested: SuggestedRule } | { own: ChatRule };

/** Featra's own rule for a request, deciding Write and Edit on real paths; none unless it may be allowed for the chat. */
const ownRule = (request: ToolRequest): ChatRule | null =>
  request.forChat === true ? chatRule(request.name, request.input, request.cwd, realPath) : null;

/**
 * What Allow for this chat would remember for a request: the provider's suggestion first, else Featra's rule `own`.
 * None when the request doesn't say it may be allowed for the chat (or says it may only be allowed once).
 */
function offerFor(request: ToolRequest, own: ChatRule | null): Offer | null {
  if (request.forChat !== true) return null;
  if (request.suggested) return { suggested: request.suggested };
  return own ? { own } : null;
}

/** Ends a request with `decision`, telling the chat `event` (none when the chat itself ended). */
type Settle<D> = (decision: D | Refusal, event: ChatEvent | null) => void;

type Waiting =
  | {
      kind: "tool";
      request: ToolRequest;
      /** What Allow for this chat would remember, or null when it isn't offered. */
      offer: Offer | null;
      settle: Settle<ToolDecision>;
    }
  | { kind: "question"; request: QuestionRequest; settle: Settle<QuestionDecision> };

export interface ApprovalDesk {
  /** Asks the user about a call, unless the chat's Allow for this chat already covers it. */
  approve: ApprovalHandler;
  /** Shows the agent's questions in the chat and holds them until the user answers. */
  ask: QuestionHandler;
  /** The user's answer to a request the chat waits on; refused when it isn't waiting. */
  answer: (chat: string, tool: string, answer: ApprovalAnswer) => void;
  /** The user's answers to a question the chat waits on; refused when it isn't waiting, or isn't fully answered. */
  reply: (chat: string, tool: string, answers: Answers) => void;
  /**
   * Gives `to` the Allow for this chat rules `from` has (STORY-9): Featra's own are copied, and the provider's own
   * rules, which its session applies, are returned for the new session to start with.
   */
  inherit: (from: string, to: string) => unknown[];
  /** The chat's agent ended: its requests end unanswered, quietly, and its Allow for this chat is forgotten. */
  forget: (chat: string) => void;
}

/** `tell` records an event in the chat it names. */
export function createApprovalDesk(tell: (chat: string, event: ChatEvent) => void): ApprovalDesk {
  const waiting = new Map<string, Map<string, Waiting>>();
  const rules = new Map<string, Set<string>>();
  /** The provider's own rules the user allowed for the chat: the provider applies them, Featra keeps them to hand on. */
  const provided = new Map<string, unknown[]>();

  const requestsOf = (chat: string) => {
    let found = waiting.get(chat);
    if (!found) waiting.set(chat, (found = new Map()));
    return found;
  };

  /** The request `id` of `chat`, held until it settles; `opening` tells the chat it waits. A stopped turn cancels it. */
  function hold<D>(
    chat: string,
    id: string,
    signal: AbortSignal,
    opening: ChatEvent,
    make: (settle: Settle<D>) => Waiting,
  ): Promise<D | Refusal> {
    return new Promise((resolve) => {
      const requests = requestsOf(chat);
      requests.get(id)?.settle(REPLACED, null);
      const cancel = () => settle(CANCELLED, { type: "approval-cancelled", id });
      function settle(decision: D | Refusal, event: ChatEvent | null) {
        if (requests.get(id) !== entry) return;
        requests.delete(id);
        signal.removeEventListener("abort", cancel);
        if (event) tell(chat, event);
        resolve(decision);
      }
      const entry = make(settle);
      requests.set(id, entry);
      signal.addEventListener("abort", cancel, { once: true });
      tell(chat, opening);
    });
  }

  return {
    approve(request, signal) {
      const { chat, id, name, input } = request;
      // A stopped turn allows nothing, not even what a rule covers.
      if (signal.aborted) return Promise.resolve(CANCELLED);
      // Featra's own rules; a provider's rule is matched by the provider, so its calls don't reach here.
      const own = ownRule(request);
      const offer = offerFor(request, own);
      if (own && rules.get(chat)?.has(own.key)) {
        tell(chat, { type: "tool-allowed", id, name, input, scope: "chat" });
        return Promise.resolve({ allow: true, input });
      }
      const covers = offer ? ("own" in offer ? offer.own.covers : offer.suggested.covers) : null;
      const opening: ChatEvent = {
        type: "approval",
        id,
        name,
        input,
        forChat: covers !== null,
        ...(covers ? { covers } : {}),
        ...(request.subagent ? { subagent: request.subagent } : {}),
        ...(request.story ? { story: request.story } : {}),
      };
      return hold<ToolDecision>(chat, id, signal, opening, (settle) => ({ kind: "tool", request, offer, settle }));
    },
    ask(request, signal) {
      const { chat, id, name, questions } = request;
      if (signal.aborted) return Promise.resolve(CANCELLED);
      const opening: ChatEvent = {
        type: "question",
        id,
        name,
        questions,
        ...(request.subagent ? { subagent: request.subagent } : {}),
      };
      return hold<QuestionDecision>(chat, id, signal, opening, (settle) => ({
        kind: "question",
        request,
        settle,
      }));
    },
    answer(chat, tool, { choice, reason }) {
      const entry = waiting.get(chat)?.get(tool);
      if (entry?.kind !== "tool") throw new ChatError(CHAT_MESSAGES.noRequest);
      const { id, name, input } = entry.request;
      if (choice === "deny") {
        const event: ChatEvent = { type: "tool-denied", id, name, input, ...(reason ? { reason } : {}) };
        return entry.settle({ allow: false, message: denyMessage(reason) }, event);
      }
      const { offer } = entry;
      if (choice === "allow-chat") {
        if (!offer) throw new ChatError(CHAT_MESSAGES.onceOnly);
        if ("own" in offer) {
          let set = rules.get(chat);
          if (!set) rules.set(chat, (set = new Set()));
          set.add(offer.own.key);
        }
      }
      const rule = choice === "allow-chat" && offer && "suggested" in offer ? offer.suggested.rule : undefined;
      if (rule !== undefined)
        provided.set(chat, [...(provided.get(chat) ?? []), ...(Array.isArray(rule) ? rule : [rule])]);
      entry.settle(rule === undefined ? { allow: true, input } : { allow: true, input, rule }, {
        type: "tool-allowed",
        id,
        name,
        input,
        scope: choice === "allow" ? "once" : "chat",
      });
    },
    reply(chat, tool, given) {
      const entry = waiting.get(chat)?.get(tool);
      if (entry?.kind !== "question") throw new ChatError(CHAT_MESSAGES.noRequest);
      // Only an answer that answers each question as it asks is taken; the question stays waiting otherwise.
      const answers = validAnswers(entry.request.questions, given);
      if (!answers) throw new ChatError(CHAT_MESSAGES.badAnswer);
      entry.settle({ allow: true, answers }, { type: "question-answered", id: entry.request.id, answers });
    },
    inherit(from, to) {
      const own = rules.get(from);
      if (own && own.size > 0) rules.set(to, new Set(own));
      const given = [...(provided.get(from) ?? [])];
      if (given.length > 0) provided.set(to, [...given]);
      return given;
    },
    forget(chat) {
      rules.delete(chat);
      provided.delete(chat);
      const requests = waiting.get(chat);
      waiting.delete(chat);
      for (const entry of requests?.values() ?? []) entry.settle(CANCELLED, null);
    },
  };
}
