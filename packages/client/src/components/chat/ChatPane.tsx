import { CHAT_MESSAGES } from "@featra/work-format/chat-events";
import type { ChatDraftProps } from "./ChatDraft.tsx";
import { ChatDraft } from "./ChatDraft.tsx";
import type { OpenChat } from "./ChatView.tsx";

type ChatPaneProps = Omit<ChatDraftProps, "chat" | "chats" | "work"> & {
  chat: OpenChat | null;
  /** The app's bridge: the chat's own, and Work's for the draft beside it. */
  bridge: Pick<ChatDraftProps, "work"> & { chats: ChatDraftProps["chats"] };
};

/**
 * The chat history points at: its view, or a line saying the server doesn't have it. Switching project leaves the old
 * project's chats (`leaveChats`), so it never shows one of them.
 */
export function ChatPane({ chat, bridge, ...props }: ChatPaneProps) {
  return chat ? (
    <ChatDraft key={chat.id} chat={chat} chats={bridge.chats} work={bridge.work} {...props} />
  ) : (
    <p className="chat-error" role="alert">
      {CHAT_MESSAGES.noChat}
    </p>
  );
}
