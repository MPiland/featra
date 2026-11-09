/**
 * The approval desk (STORY-45, ADR 0018): holds each tool request until the user answers it in the chat, and
 * remembers each chat's Allow for this chat in memory only, so it ends with the chat's agent and never outlives the
 * server. Every outcome is a chat event, so the log, the row's waiting dot and the view follow from one place.
 */
import {
  APPROVAL_CANCELLED,
  CHAT_MESSAGES,
  chatRuleKey,
  denyMessage,
  type ApprovalAnswer,
  type ChatEvent,
} from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import type { ApprovalHandler, ToolDecision, ToolRequest } from "./provider.ts";

/** A request that ended unanswered because the turn or the chat did: the agent stops rather than try another step. */
const CANCELLED: ToolDecision = { allow: false, message: APPROVAL_CANCELLED, interrupt: true };

interface Waiting {
  request: ToolRequest;
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
      // Allow for this chat only where the request says it may; one that says it may only be allowed once, or
      // doesn't say, is always asked about.
      const forChat = request.forChat === true;
      if (forChat && rules.get(chat)?.has(chatRuleKey(name, input))) {
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
        const entry: Waiting = { request, settle };
        requests.set(id, entry);
        signal.addEventListener("abort", cancel, { once: true });
        tell(chat, { type: "approval", id, name, input, forChat });
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
      if (choice === "allow-chat") {
        if (entry.request.forChat !== true) throw new ChatError(CHAT_MESSAGES.onceOnly);
        let set = rules.get(chat);
        if (!set) rules.set(chat, (set = new Set()));
        set.add(chatRuleKey(name, input));
      }
      entry.settle(
        { allow: true, input },
        {
          type: "tool-allowed",
          id,
          name,
          input,
          scope: choice === "allow" ? "once" : "chat",
        },
      );
    },
    forget(chat) {
      rules.delete(chat);
      const requests = waiting.get(chat);
      waiting.delete(chat);
      for (const entry of requests?.values() ?? []) entry.settle(CANCELLED, null);
    },
  };
}
