/**
 * The manager's answers to what a chat waits on (STORY-45, STORY-46) and the approvals the app asks for itself
 * (STORY-12's `request_merge`). Every request is held by the approval desk; this only finds the chat that holds it.
 */
import type { ApprovalDesk } from "./approval-desk.ts";
import type { AppApproval, ChatManager } from "./chat-manager-types.ts";
import type { Chat } from "./chat-state.ts";
import type { StoryMirror } from "./story-mirror.ts";

export function chatApprovals(
  desk: ApprovalDesk,
  mirror: Pick<StoryMirror, "holder">,
  chat: (id: string) => Chat,
  open: (id: string) => Promise<void>,
): Pick<ChatManager, "askApproval" | "askChoice" | "approve" | "answer"> {
  async function askChoice(id: string, request: AppApproval) {
    await open(id);
    const ask = { ...request, chat: id, cwd: chat(id).cwd, forChat: false };
    const decision = await desk.approve(ask, new AbortController().signal);
    return decision.allow ? decision.input : null;
  }
  return {
    askChoice,
    askApproval: async (id, request) => (await askChoice(id, request)) !== null,
    // A story session's approval shown in its parent chat is answered from there too.
    approve: (id, tool, answer) => desk.answer(mirror.holder(chat(id).id, tool) ?? chat(id).id, tool, answer),
    answer: (id, tool, answers) => desk.reply(chat(id).id, tool, answers),
  };
}
