/**
 * The manager's answers to what a chat waits on (STORY-45, STORY-46) and the approvals the app asks for itself
 * (STORY-12's `request_merge`, STORY-68's `request_action`). Every request is held by the approval desk; this only
 * finds the chat that holds it, and ends a turn's own requests with the turn.
 */
import { APPROVAL_CANCELLED, type ActionOutcome } from "@featra/work-format";
import type { ApprovalDesk } from "./approval-desk.ts";
import type { AppApproval, ChatManager, ChoiceAnswer, TurnAsk } from "./chat-manager-types.ts";
import type { Chat } from "./chat-state.ts";
import type { StoryMirror } from "./story-mirror.ts";

export type ChatApprovals = Pick<ChatManager, "askApproval" | "askChoice" | "askAction" | "approve" | "answer"> & {
  /** The chat's turn ended (Stop among the ways): what it asked and still waits on is cancelled first. */
  turnEnded: (id: string) => void;
};

export function chatApprovals(
  desk: ApprovalDesk,
  mirror: Pick<StoryMirror, "holder">,
  chat: (id: string) => Chat,
  open: (id: string) => Promise<void>,
): ChatApprovals {
  /** The requests each chat's running turn waits on, which end with it. */
  const turns = new Map<string, Set<AbortController>>();

  /** Holds the app's request in chat `id` until the user answers it, or `signal` cancels it. */
  async function ask(id: string, request: TurnAsk & Partial<AppApproval>, signal: AbortSignal) {
    await open(id);
    return desk.approve({ ...request, chat: id, cwd: chat(id).cwd, forChat: false, app: true }, signal);
  }

  async function askChoice(id: string, request: AppApproval): Promise<ChoiceAnswer> {
    const decision = await ask(id, request, new AbortController().signal);
    if (decision.allow) return decision.input;
    // The chat ending settles what it waited on as cancelled; only the user's Deny is a denial.
    return decision.message === APPROVAL_CANCELLED ? "cancelled" : "denied";
  }

  async function askAction(id: string, request: TurnAsk): Promise<ActionOutcome | null> {
    const stop = new AbortController();
    const held = turns.get(id) ?? new Set<AbortController>();
    turns.set(id, held.add(stop));
    try {
      const decision = await ask(id, request, stop.signal);
      if (decision.allow) return { outcome: "done" };
      if (decision.message === APPROVAL_CANCELLED) return null;
      return decision.reason ? { outcome: "cant", reason: decision.reason } : { outcome: "cant" };
    } finally {
      held.delete(stop);
      if (held.size === 0 && turns.get(id) === held) turns.delete(id);
    }
  }

  return {
    askChoice,
    askAction,
    askApproval: async (id, request) => typeof (await askChoice(id, request)) === "object",
    // A story session's approval shown in its parent chat is answered from there too.
    approve: (id, tool, answer) => desk.answer(mirror.holder(chat(id).id, tool) ?? chat(id).id, tool, answer),
    answer: (id, tool, answers) => desk.reply(chat(id).id, tool, answers),
    turnEnded(id) {
      const held = turns.get(id);
      turns.delete(id);
      for (const stop of held ?? []) stop.abort();
    },
  };
}
