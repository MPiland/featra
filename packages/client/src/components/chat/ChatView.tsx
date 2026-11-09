import { useEffect, useState } from "react";
import { EMPTY_CHAT } from "@featra/work-format/chat";
import { CHAT_MESSAGES } from "@featra/work-format/chat-events";
import { ASK_MODE, modeLabel, modeWhere } from "@featra/work-format/modes";
import { type ChatBridge, type ChatRoleRef, type ChatUpdate } from "../../chats.ts";
import { Composer } from "./Composer.tsx";
import { Transcript } from "./Transcript.tsx";

/** The chat the user opened: its id and the role it started from. */
export interface OpenChat {
  id: string;
  role: ChatRoleRef;
}

interface ChatViewProps {
  chats: ChatBridge;
  chat: OpenChat;
  /** The project folder, where a new chat with the same role starts. */
  dir: string;
  /** A new chat started from this one's role. */
  onStarted: (id: string, role: ChatRoleRef) => void;
}

/** One chat: the role it runs as, its transcript, and the composer. A chat whose history is gone offers a new one. */
export function ChatView({ chats, chat, dir, onStarted }: ChatViewProps) {
  const [update, setUpdate] = useState<ChatUpdate>({ chat: EMPTY_CHAT, error: null });
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => chats.watch(chat.id, setUpdate), [chats, chat.id]);
  const { items, running, model } = update.chat;
  const mode = update.mode ?? ASK_MODE;
  const error = update.error ?? actionError;
  const gone = items.some((item) => item.kind === "notice" && item.notice.type === "gone");
  const newChat = async () => {
    const started = await chats.start(dir, chat.role.id);
    if (started.ok) onStarted(started.id, chat.role);
    else setActionError(started.error);
  };
  return (
    <section className="chat" aria-label={chat.role.name} data-chat={chat.id}>
      <header className="chat-head">
        <span className="chat-role">{chat.role.name}</span>
        <span className="chat-meta">
          {model ?? chat.role.model} · {chat.role.effort} ·{" "}
          <span className="chat-mode" title={modeWhere(mode) ?? undefined}>
            {modeLabel(mode)}
          </span>
        </span>
      </header>
      {update.note && <p className="chat-note">{update.note}</p>}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <Transcript
        items={items}
        running={running}
        actions={{
          onNewChat: () => void newChat(),
          onAnswer: (tool, answer) => chats.approve(chat.id, tool, answer),
          onAnswerQuestion: (tool, answers) => chats.answer(chat.id, tool, answers),
          onUndoLog: (entry) => chats.undoLog(chat.id, entry),
        }}
      />
      {!gone && (
        <Composer
          running={running}
          fullAccess={mode.fullAccess}
          onSend={(text) => chats.send(chat.id, text)}
          onStop={() => {
            setActionError(null);
            void chats.stop(chat.id).then(setActionError);
          }}
        />
      )}
    </section>
  );
}

/**
 * The chat history points at: its view, or a line saying the server doesn't have it. Switching project leaves the old
 * project's chats (`leaveChats`), so it never shows one of them.
 */
export function ChatPane({ chat, ...props }: Omit<ChatViewProps, "chat"> & { chat: OpenChat | null }) {
  return chat ? (
    <ChatView key={chat.id} chat={chat} {...props} />
  ) : (
    <p className="chat-error" role="alert">
      {CHAT_MESSAGES.noChat}
    </p>
  );
}
