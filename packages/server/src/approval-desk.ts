/**
 * The approval desk (STORY-45, ADR 0018): holds each tool request until the user answers it in the chat, and
 * remembers each chat's Allow for this chat in memory only, so it ends with the chat's agent and never outlives the
 * server. Every outcome is a chat event, so the log, the row's waiting dot and the view follow from one place.
 */
import {
  APPROVAL_CANCELLED,
  CHAT_MESSAGES,
  chatRule,
  denyMessage,
  type ApprovalAnswer,
  type ChatRule,
  type ChatEvent,
} from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import type { ApprovalHandler, SuggestedRule, ToolDecision, ToolRequest } from "./provider.ts";
import { realPath } from "./real-path.ts";

/** A request that ended unanswered because the turn or the chat did: the agent stops rather than try another step. */
const CANCELLED: ToolDecision = { allow: false, message: APPROVAL_CANCELLED, interrupt: true };

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

interface Waiting {
  request: ToolRequest;
  /** What Allow for this chat would remember, or null when it isn't offered. */
  offer: Offer | null;
  /** Ends the request with `decision`, telling the chat `event` (none when the chat itself ended). */
  settle: (decision: ToolDecision, event: ChatEvent | null) => void;
}

export interface ApprovalDesk {
  /** Asks the user about a call, unless the chat's Allow for this chat already covers it. */
  approve: ApprovalHandler;
  /** The user's answer to a request the chat waits on; refused when it isn't waiting. */
  answer: (chat: string, tool: string, answer: ApprovalAnswer) => void;
  /** The chat's agent ended: its requests end unanswered, quietly, and its Allow for this chat is forgotten. */
  forget: (chat: string) => void;
}

/** `tell` records an event in the chat it names. */
export function createApprovalDesk(tell: (chat: string, event: ChatEvent) => void): ApprovalDesk {
  const waiting = new Map<string, Map<string, Waiting>>();
  const rules = new Map<string, Set<string>>();

  const requestsOf = (chat: string) => {
    let found = waiting.get(chat);
    if (!found) waiting.set(chat, (found = new Map()));
    return found;
  };

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
      return new Promise<ToolDecision>((resolve) => {
        const requests = requestsOf(chat);
        // The same call asked again replaces the first request, which ends so its caller isn't left waiting.
        requests.get(id)?.settle({ allow: false, message: APPROVAL_CANCELLED }, null);
        const cancel = () => settle(CANCELLED, { type: "approval-cancelled", id });
        function settle(decision: ToolDecision, event: ChatEvent | null) {
          if (requests.get(id)?.settle !== entry.settle) return;
          requests.delete(id);
          signal.removeEventListener("abort", cancel);
          if (event) tell(chat, event);
          resolve(decision);
        }
        const entry: Waiting = { request, offer, settle };
        requests.set(id, entry);
        signal.addEventListener("abort", cancel, { once: true });
        const covers = offer ? ("own" in offer ? offer.own.covers : offer.suggested.covers) : null;
        tell(chat, { type: "approval", id, name, input, forChat: covers !== null, ...(covers ? { covers } : {}) });
      });
    },
    answer(chat, tool, { choice, reason }) {
      const entry = waiting.get(chat)?.get(tool);
      if (!entry) throw new ChatError(CHAT_MESSAGES.noRequest);
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
      entry.settle(rule === undefined ? { allow: true, input } : { allow: true, input, rule }, {
        type: "tool-allowed",
        id,
        name,
        input,
        scope: choice === "allow" ? "once" : "chat",
      });
    },
    forget(chat) {
      rules.delete(chat);
      const requests = waiting.get(chat);
      waiting.delete(chat);
      for (const entry of requests?.values() ?? []) entry.settle(CANCELLED, null);
    },
  };
}
