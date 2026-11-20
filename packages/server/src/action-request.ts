/**
 * An agent's `request_action` (STORY-68): it asks the user to do something only they can do, and waits. The request is
 * an app approval in the agent's chat (and its Dev Lead's, for a story session) that goes to the Inbox after the same
 * wait as any other, so it counts as waiting everywhere a tool approval does. Done or Can't do it, with the user's
 * reason, is the call's answer. Featra runs nothing: the commands are only shown, for the user to copy.
 *
 * A request lives as long as its call (review B1): it ends as cancelled when the agent's host drops the call (its tool
 * timeout, or Stop, sent as `action.cancel`), when the MCP's connection closes (its process died), or when the chat
 * ends. A turn ending doesn't end it: a background subagent can ask with no turn running.
 */
import { randomUUID } from "node:crypto";
import { APPROVAL_CANCELLED, REQUEST_ACTION_TOOL, type ActionOutcome, type ActionRequest } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { ChatManager } from "./chat-manager.ts";

export interface ActionRequestDeps {
  chats: Pick<ChatManager, "askAction">;
  newId?: () => string;
}

/** Which call a request is: the MCP's connection it came on, and the call's name there, when it gave one. */
export interface ActionCall {
  link: object;
  call?: string;
}

/** The call's name the MCP gave with `action.request` or `action.cancel`, if it gave one that can be. */
export function callName(params: unknown): string | undefined {
  const call = typeof params === "object" && params !== null ? (params as { call?: unknown }).call : undefined;
  return typeof call === "string" && call.length > 0 && call.length <= 100 ? call : undefined;
}

export function createActionRequest({ chats, newId = randomUUID }: ActionRequestDeps) {
  /** The calls in flight on each MCP connection, by the call's name there. */
  const inflight = new Map<object, Map<string, AbortController>>();

  return {
    /** Asks the user in `chat`; answers with how they answered, and is refused when the request ended unanswered. */
    async request(chat: string, input: ActionRequest, from: ActionCall = { link: {} }): Promise<ActionOutcome> {
      const stop = new AbortController();
      const key = from.call ?? `unnamed-${newId()}`;
      const calls = inflight.get(from.link) ?? new Map<string, AbortController>();
      inflight.set(from.link, calls.set(key, stop));
      try {
        // What it is about keeps it open past the turn, as any app request's is: the call, not the turn, ends it.
        const ask = { id: `action-${newId()}`, name: REQUEST_ACTION_TOOL, input: { ...input }, subject: input.title };
        const outcome = await chats.askAction(chat, ask, stop.signal);
        if (!outcome) throw new ApiError(APPROVAL_CANCELLED);
        return outcome;
      } finally {
        if (calls.get(key) === stop) calls.delete(key);
        if (calls.size === 0 && inflight.get(from.link) === calls) inflight.delete(from.link);
      }
    },
    /** The agent's host dropped the call: its request ends as cancelled. Unknown calls are ignored. */
    cancel({ link, call }: ActionCall): void {
      if (call !== undefined) inflight.get(link)?.get(call)?.abort();
    },
    /** The MCP's connection closed: every request it has in flight ends as cancelled. */
    dropped(link: object): void {
      const calls = inflight.get(link);
      inflight.delete(link);
      for (const stop of calls?.values() ?? []) stop.abort();
    },
  };
}

export type ActionRequestService = ReturnType<typeof createActionRequest>;
