/**
 * An agent's `request_action` (STORY-68): it asks the user to do something only they can do, and waits. The request is
 * an app approval in the agent's chat (and its Dev Lead's, for a story session) that goes to the Inbox after the same
 * wait as any other, so it counts as waiting everywhere a tool approval does. Done or Can't do it, with the user's
 * reason, is the call's answer. Featra runs nothing: the commands are only shown, for the user to copy.
 */
import { randomUUID } from "node:crypto";
import { APPROVAL_CANCELLED, REQUEST_ACTION_TOOL, type ActionOutcome, type ActionRequest } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { ChatManager } from "./chat-manager.ts";

export interface ActionRequestDeps {
  chats: Pick<ChatManager, "askAction">;
  newId?: () => string;
}

export function createActionRequest({ chats, newId = randomUUID }: ActionRequestDeps) {
  return {
    /** Asks the user in `chat`; answers with how they answered, and is refused when the request ended unanswered. */
    async request(chat: string, input: ActionRequest): Promise<ActionOutcome> {
      const ask = { id: `action-${newId()}`, name: REQUEST_ACTION_TOOL, input: { ...input } };
      const outcome = await chats.askAction(chat, ask);
      if (!outcome) throw new ApiError(APPROVAL_CANCELLED);
      return outcome;
    },
  };
}

export type ActionRequestService = ReturnType<typeof createActionRequest>;
