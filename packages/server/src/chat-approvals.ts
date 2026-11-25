/**
 * The manager's answers to what a chat waits on (STORY-45, STORY-46) and the approvals the app asks for itself
 * (STORY-12's `request_merge`, STORY-68's `request_action`). Every request is held by the approval desk; this only
 * finds the chat that holds it. A `request_action` ends with its call, through `signal`, not with the turn (review B1).
 */
import { APPROVAL_CANCELLED, type ActionOutcome, type Answers } from "@featra/work-format";
import type { ApprovalDesk } from "./approval-desk.ts";
import type { AppApproval, AppQuestion, ChatManager, ChoiceAnswer } from "./chat-manager-types.ts";
import type { Chat } from "./chat-state.ts";
import type { StoryMirror } from "./story-mirror.ts";

export type ChatApprovals = Pick<
  ChatManager,
  "askApproval" | "askChoice" | "askAction" | "askQuestion" | "approve" | "answer"
>;

export function chatApprovals(
  desk: ApprovalDesk,
  mirror: Pick<StoryMirror, "holder">,
  chat: (id: string) => Chat,
  open: (id: string) => Promise<void>,
): ChatApprovals {
  /** Holds the app's request in chat `id` until the user answers it, or `signal` cancels it. */
  async function ask(id: string, request: AppApproval, signal: AbortSignal) {
    await open(id);
    return desk.approve({ ...request, chat: id, cwd: chat(id).cwd, forChat: false, app: true }, signal);
  }

  async function askChoice(id: string, request: AppApproval): Promise<ChoiceAnswer> {
    const decision = await ask(id, request, new AbortController().signal);
    if (decision.allow) return decision.input;
    // The chat ending settles what it waited on as cancelled; only the user's Deny is a denial.
    return decision.message === APPROVAL_CANCELLED ? "cancelled" : "denied";
  }

  async function askAction(id: string, request: AppApproval, signal: AbortSignal): Promise<ActionOutcome | null> {
    const decision = await ask(id, request, signal);
    if (decision.allow) return { outcome: "done" };
    if (decision.message === APPROVAL_CANCELLED) return null;
    return decision.reason ? { outcome: "cant", reason: decision.reason } : { outcome: "cant" };
  }

  async function askQuestion(id: string, request: AppQuestion): Promise<Answers | null> {
    await open(id);
    const decision = await desk.ask({ ...request, chat: id }, new AbortController().signal);
    return decision.allow ? decision.answers : null;
  }

  return {
    askChoice,
    askQuestion,
    askAction,
    askApproval: async (id, request) => typeof (await askChoice(id, request)) === "object",
    // A story session's approval shown in its parent chat is answered from there too.
    approve: (id, tool, answer) => desk.answer(mirror.holder(chat(id).id, tool) ?? chat(id).id, tool, answer),
    answer: (id, tool, answers) => desk.reply(chat(id).id, tool, answers),
  };
}
