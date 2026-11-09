// The local server's chat side, as a fake: each chat's event log held in memory, pushed to its watchers. What the
// view makes of the log is work-format's real fold; the events are the protocol's, as the server would send them.
import { act } from "react";
import { BUILT_IN_ROLES, foldChat, type ChatEvent, type Role } from "@featra/work-format";
import type { ChatBridge, ChatUpdate } from "../src/chats.ts";

export interface ChatHost {
  /** The roles the server offers. Default: the built-in five. */
  roles?: Role[];
  /** What `chat.start` refuses with, if anything. */
  startError?: string;
  /** What `chat.send` refuses with, if anything. */
  sendError?: string;
}

export function fakeChatServer(calls: string[], host: ChatHost = {}) {
  const logs = new Map<string, ChatEvent[]>();
  const watchers = new Map<string, Set<(u: ChatUpdate) => void>>();
  const update = (id: string): ChatUpdate => ({ chat: foldChat(logs.get(id) ?? []), error: null });
  const record = (id: string, event: ChatEvent) => {
    logs.get(id)?.push(event);
    for (const l of watchers.get(id) ?? []) l(update(id));
  };
  const bridge: ChatBridge = {
    roles: async () => host.roles ?? [...BUILT_IN_ROLES],
    start: async (dir, role) => {
      calls.push(`chat.start:${dir}:${role}`);
      if (host.startError) return { ok: false, error: host.startError };
      const id = `chat-${logs.size + 1}`;
      logs.set(id, []);
      return { ok: true, id };
    },
    watch: (id, listener) => {
      const set = watchers.get(id) ?? new Set();
      watchers.set(id, set.add(listener));
      queueMicrotask(() => listener(update(id)));
      return () => void set.delete(listener);
    },
    // What the server does with a message: records it, and the agent's turn starts.
    send: async (id, text) => {
      calls.push(`chat.send:${id}:${text}`);
      if (host.sendError) return host.sendError;
      record(id, { type: "user", text });
      return null;
    },
    stop: async (id) => void calls.push(`chat.stop:${id}`),
  };
  return {
    bridge,
    /** The agent says something: the server pushes each event to the chat's watchers. */
    emit: (id: string, ...events: ChatEvent[]) =>
      act(() => {
        for (const e of events) record(id, e);
      }),
    watching: (id: string) => watchers.get(id)?.size ?? 0,
  };
}
