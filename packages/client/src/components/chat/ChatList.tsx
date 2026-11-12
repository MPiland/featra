import { Fragment, useEffect, useState } from "react";
import { chatName, EMPTY_CHAT_LIST, type ChatList as Chats } from "@featra/work-format/chat-list";
import { groupChats, nestChats } from "@featra/work-format/chat-nest";
import { CHAT_COPY, type ChatBridge, type ChatRoleRef } from "../../chats.ts";
import type { OpenChat } from "./ChatView.tsx";

/** The project's chat list, as the server last sent it; empty without a project. */
function useChatList(chats: ChatBridge, dir: string | null): Chats {
  const [list, setList] = useState<{ dir: string | null; list: Chats }>({ dir, list: EMPTY_CHAT_LIST });
  useEffect(() => {
    // A dropped connection keeps the last list: the watch starts again and sends a fresh one.
    return dir ? chats.list(dir, (update) => setList({ dir, list: update.list })) : undefined;
  }, [chats, dir]);
  // Another project's chats never show, even for the moment before its own list arrives.
  return list.dir === dir && dir ? list.list : EMPTY_CHAT_LIST;
}

/**
 * The project's chats, and the one `id` names (null when there is no such chat), from the list or, until the list
 * has it, from `started`: the list's push can come after the start's answer. When the project changes, the chats
 * started in the old one are forgotten and `onProjectChange` runs, before anything of the new project is drawn.
 */
export function useChats(chats: ChatBridge, dir: string | null, id: string | null, onProjectChange: () => void) {
  const list = useChatList(chats, dir);
  const [started, setStarted] = useState<Readonly<Record<string, OpenChat>>>({});
  const [shownDir, setShownDir] = useState(dir);
  if (shownDir !== dir) {
    setShownDir(dir);
    setStarted({});
    onProjectChange();
  }
  const listed = list.chats.find((c) => c.id === id);
  const chat: OpenChat | null = listed
    ? {
        id: listed.id,
        role: listed.role,
        story: listed.story?.id,
        ...(listed.subagent ? { subagent: { stoppable: listed.subagent.stoppable } } : {}),
      }
    : id
      ? (started[id] ?? null)
      : null;
  const remember = (newId: string, role: ChatRoleRef) => setStarted((s) => ({ ...s, [newId]: { id: newId, role } }));
  return { list, chat, remember };
}

interface ChatListProps {
  list: Chats;
  /** The chat in front, if any. */
  current: string | null;
  onOpen: (id: string) => void;
  /** Removes an ended subagent's row (STORY-55). */
  onArchive?: (id: string) => void;
}

type Chat = Chats["chats"][number];

interface RowProps {
  chat: Chat;
  current: string | null;
  nested?: boolean;
  onOpen: (id: string) => void;
  onArchive?: (id: string) => void;
}

function ChatRow({ chat, current, nested = false, onOpen, onArchive }: RowProps) {
  return (
    <li>
      <button
        type="button"
        className={chat.id === current ? "nav chat-row on" : "nav chat-row"}
        aria-current={chat.id === current ? "page" : undefined}
        data-chat={chat.id}
        data-nested={nested ? "" : undefined}
        onClick={() => onOpen(chat.id)}
      >
        <span className="chat-row-title">{chatName(chat)}</span>
        {chat.queued && <span className="meta">{CHAT_COPY.queued}</span>}
        {chat.subagent && !chat.running && <span className="meta">{CHAT_COPY.ended}</span>}
        {chat.waiting && (
          <span className="chat-dot" data-waiting={chat.waiting}>
            <span className="sr-only">{CHAT_COPY.waiting}</span>
          </span>
        )}
      </button>
      {chat.subagent && !chat.running && onArchive && (
        <button
          type="button"
          className="btn chat-archive"
          aria-label={CHAT_COPY.archiveSubagent(chatName(chat))}
          onClick={() => onArchive(chat.id)}
        >
          {CHAT_COPY.archive}
        </button>
      )}
    </li>
  );
}

/** The subagents a session spawned (STORY-55), under its row. */
function Subagents({
  of,
  subagents,
  current,
  onOpen,
  onArchive,
}: Pick<RowProps, "current" | "onOpen" | "onArchive"> & { of: Chat; subagents: Chat[] | undefined }) {
  if (!subagents?.length) return null;
  return (
    <li role="none">
      <ul className="navlist chat-children" aria-label={CHAT_COPY.subagentsOf(chatName(of))}>
        {subagents.map((s) => (
          <ChatRow key={s.id} chat={s} current={current} nested onOpen={onOpen} onArchive={onArchive} />
        ))}
      </ul>
    </li>
  );
}

/** The sidebar's chats, one group per provider the user has installed; a chat waiting on the user has a dot. */
export function ChatList({ list, current, onOpen, onArchive }: ChatListProps) {
  const listed = new Set(list.chats.map((c) => c.id));
  return groupChats(list).map(({ provider, chats }) => {
    // A story session sits under its Dev Lead's chat, or under a group named after its feature when that chat is gone.
    // A subagent a session spawned sits under that session, wherever the session is.
    const { branches, groups, subagents } = nestChats(chats, listed);
    const row = (chat: Chat, nested = false) => (
      <Fragment key={chat.id}>
        <ChatRow chat={chat} current={current} nested={nested} onOpen={onOpen} />
        <Subagents
          of={chat}
          subagents={subagents.get(chat.id)}
          current={current}
          onOpen={onOpen}
          onArchive={onArchive}
        />
      </Fragment>
    );
    return (
      <div key={provider.id} className="chat-group" role="group" aria-labelledby={`chat-group-${provider.id}`}>
        <h2 id={`chat-group-${provider.id}`} className="chat-group-name">
          {provider.name}
        </h2>
        <ul className="navlist">
          {branches.map(({ chat, children }) => (
            <Fragment key={chat.id}>
              {row(chat)}
              {children.length > 0 && (
                <li role="none">
                  <ul className="navlist chat-children" aria-label={CHAT_COPY.storySessions(chatName(chat))}>
                    {children.map((c) => row(c, true))}
                  </ul>
                </li>
              )}
            </Fragment>
          ))}
          {groups.map((g) => (
            <li key={g.feature} role="none">
              <div role="group" aria-label={g.title}>
                <h3 className="chat-group-name">{g.title}</h3>
                <ul className="navlist chat-children">{g.sessions.map((c) => row(c, true))}</ul>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  });
}
