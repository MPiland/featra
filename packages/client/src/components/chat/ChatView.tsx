import { useEffect, useState } from "react";
import { EMPTY_CHAT } from "@featra/work-format/chat";
import { CHAT_COPY, type ChatBridge, type ChatUpdate, type Role } from "../../chats.ts";
import { Composer } from "./Composer.tsx";
import { Transcript } from "./Transcript.tsx";

/** The chat the user opened: its id and the role it started from. */
export interface OpenChat {
  id: string;
  role: Role;
}

/** One chat: the role it runs as, its transcript, and the composer. */
export function ChatView({ chats, chat }: { chats: ChatBridge; chat: OpenChat }) {
  const [update, setUpdate] = useState<ChatUpdate>({ chat: EMPTY_CHAT, error: null });
  const [stopError, setStopError] = useState<string | null>(null);
  useEffect(() => chats.watch(chat.id, setUpdate), [chats, chat.id]);
  const { items, running, model } = update.chat;
  const error = update.error ?? stopError;
  return (
    <section className="chat" aria-label={chat.role.name} data-chat={chat.id}>
      <header className="chat-head">
        <span className="chat-role">{chat.role.name}</span>
        <span className="chat-meta">
          {model ?? chat.role.model} · {chat.role.effort} · <span className="chat-mode">{CHAT_COPY.ask}</span>
        </span>
      </header>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <Transcript items={items} running={running} />
      <Composer
        running={running}
        onSend={(text) => chats.send(chat.id, text)}
        onStop={() => {
          setStopError(null);
          void chats.stop(chat.id).then(setStopError);
        }}
      />
    </section>
  );
}
