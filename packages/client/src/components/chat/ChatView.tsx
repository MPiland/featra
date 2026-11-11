import { useEffect, useState, type ReactNode } from "react";
import { EMPTY_CHAT } from "@featra/work-format/chat";
import { ASK_MODE, modeLabel, modeWhere } from "@featra/work-format/modes";
import { CHAT_COPY, type ChatBridge, type ChatRoleRef, type ChatUpdate } from "../../chats.ts";
import { Composer } from "./Composer.tsx";
import { ComposerControls } from "./ComposerControls.tsx";
import { ContextMeter } from "./ContextMeter.tsx";
import { useChatControls } from "./use-chat-controls.ts";
import { Transcript } from "./Transcript.tsx";
import { StoryStop, type StopActions, type StopState } from "../work/StoryStop.tsx";

/** The chat the user opened: its id and the role it started from. */
export interface OpenChat {
  id: string;
  role: ChatRoleRef;
  /** The story this chat is the session of: its transcript is shown read-only (STORY-53). */
  story?: string;
}

export interface ChatViewProps {
  chats: ChatBridge;
  chat: OpenChat;
  /** The project folder, where a new chat with the same role starts. */
  dir: string;
  /** A new chat started from this one's role. */
  onStarted: (id: string, role: ChatRoleRef) => void;
  /** What the header offers beside the chat's settings (STORY-49: Review draft). */
  headerExtra?: ReactNode;
  /** A story session's Stop and Resume, and whether its story is Stopped (STORY-53). */
  story?: Omit<StopState, "active"> & { queued: boolean; actions: StopActions };
}

/** One chat: the role it runs as, its transcript, and the composer. A chat whose history is gone offers a new one. */
export function ChatView({ chats, chat, dir, onStarted, headerExtra, story }: ChatViewProps) {
  const [update, setUpdate] = useState<ChatUpdate>({ chat: EMPTY_CHAT, error: null });
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => chats.watch(chat.id, setUpdate), [chats, chat.id]);
  const controls = useChatControls(chats, chat.id, dir, chat.role.id);
  const { items, running, model, usage } = update.chat;
  const settings = controls.state?.settings;
  // Once a setting has been changed here, the header shows what the chat now runs with.
  const mine = (key: keyof NonNullable<typeof settings>) => (controls.changed.has(key) ? settings?.[key] : undefined);
  const modeChoice = controls.state?.controls.modes.find((m) => m.value === mine("mode"));
  const mode = update.mode ?? ASK_MODE;
  const fullAccess = modeChoice ? modeChoice.fullAccess === true : mode.fullAccess;
  const roleName = controls.roles.find((r) => r.id === mine("role"))?.name ?? chat.role.name;
  const error = update.error ?? actionError;
  const gone = items.some((item) => item.kind === "notice" && item.notice.type === "gone");
  const newChat = async () => {
    const started = await chats.start(dir, chat.role.id);
    if (started.ok) onStarted(started.id, chat.role);
    else setActionError(started.error);
  };
  return (
    <section className="chat" aria-label={roleName} data-chat={chat.id}>
      <header className="chat-head">
        <span className="chat-role">{roleName}</span>
        <span className="chat-meta">
          {mine("model") ?? model ?? chat.role.model} · {mine("effort") ?? chat.role.effort} ·{" "}
          <span className="chat-mode" title={modeChoice ? undefined : (modeWhere(mode) ?? undefined)}>
            {modeChoice ? modeChoice.label : modeLabel(mode)}
          </span>
        </span>
        {headerExtra}
        {chat.story && story && (
          <StoryStop
            id={chat.story}
            state={{ stopped: story.stopped, resumable: story.resumable, active: running || story.queued }}
            actions={story.actions}
          />
        )}
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
      {chat.story && (
        <p className="chat-note" role="note">
          {CHAT_COPY.watching}
        </p>
      )}
      {!gone && !chat.story && (
        <Composer
          running={running}
          fullAccess={fullAccess}
          above={
            <>
              <ComposerControls model={controls} onError={setActionError} />
              <ContextMeter usage={usage} />
            </>
          }
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
