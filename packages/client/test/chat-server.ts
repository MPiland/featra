// The local server's chat side, as a fake: each chat's event log held in memory, pushed to its watchers. What the
// view makes of the log is work-format's real fold; the events are the protocol's, as the server would send them.
import { act } from "react";
import {
  BUILT_IN_ROLES,
  foldChat,
  newSummary,
  reduceRow,
  type ApprovalAnswer,
  type ChatEvent,
  type ChatRow,
  type ProviderInfo,
  type Role,
} from "@featra/work-format";
import type { ChatBridge, ChatListUpdate, ChatUpdate } from "../src/chats.ts";

/** Claude, installed: what the server reports on a machine with `claude` on the PATH. */
export const CLAUDE_INSTALLED: ProviderInfo = { id: "claude", name: "Claude Code", installed: true };

export interface ChatHost {
  /** The roles the server offers. Default: the built-in five. */
  roles?: Role[];
  /** What `chat.start` refuses with, if anything. */
  startError?: string;
  /** What `chat.send` refuses with, if anything. */
  sendError?: string;
  /** What `chat.stop` refuses with, if anything. */
  stopError?: string;
  /** What `chat.approve` refuses with, if anything. */
  approveError?: string;
  /** What `chat.answer` refuses with, if anything. */
  answerError?: string;
  /** The providers `chat.list` reports. Default: Claude, installed. */
  providers?: ProviderInfo[];
  /** The clock a chat's start is stamped with. Default: one second per chat from 2026-11-09T10:00:00Z. */
  now?: () => string;
}

export function fakeChatServer(calls: string[], host: ChatHost = {}) {
  const logs = new Map<string, ChatEvent[]>();
  const watchers = new Map<string, Set<(u: ChatUpdate) => void>>();
  // Each chat's row and project, kept with work-format's real fold, as the server keeps them.
  const rows = new Map<string, ChatRow & { dir: string }>();
  const listWatchers = new Set<{ dir: string; listener: (u: ChatListUpdate) => void }>();
  const providers = host.providers ?? [CLAUDE_INSTALLED];
  const now = host.now ?? (() => new Date(Date.UTC(2026, 10, 9, 10, 0, rows.size)).toISOString());
  let listsSent = 0;
  const listOf = (dir: string): ChatListUpdate => ({
    list: { providers, chats: [...rows.values()].filter((r) => r.dir === dir).map((r) => r.summary) },
    error: null,
  });
  const sendList = (w: { dir: string; listener: (u: ChatListUpdate) => void }) => {
    listsSent += 1;
    w.listener(listOf(w.dir));
  };
  const listChanged = (dir: string) => {
    for (const w of listWatchers) if (w.dir === dir) sendList(w);
  };
  const update = (id: string): ChatUpdate => ({ chat: foldChat(logs.get(id) ?? []), error: null });
  const record = (id: string, event: ChatEvent) => {
    logs.get(id)?.push(event);
    for (const l of watchers.get(id) ?? []) l(update(id));
    const row = rows.get(id);
    if (!row) return;
    const next = reduceRow(row, event);
    row.asks = next.asks;
    if (next.summary === row.summary) return;
    row.summary = next.summary;
    listChanged(row.dir);
  };
  const bridge: ChatBridge = {
    roles: async () => host.roles ?? [...BUILT_IN_ROLES],
    start: async (dir, role) => {
      calls.push(`chat.start:${dir}:${role}`);
      if (host.startError) return { ok: false, error: host.startError };
      const id = `chat-${logs.size + 1}`;
      logs.set(id, []);
      const found = (host.roles ?? BUILT_IN_ROLES).find((r) => r.id === role);
      if (found) rows.set(id, { dir, summary: newSummary(id, found.provider, found, now()), asks: [] });
      listChanged(dir);
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
    stop: async (id) => {
      calls.push(`chat.stop:${id}`);
      return host.stopError ?? null;
    },
    // The answer is recorded; what the server then tells the chat, the test emits as the agent would go on.
    approve: async (id, tool, answer: ApprovalAnswer) => {
      calls.push(`chat.approve:${id}:${tool}:${answer.choice}${answer.reason ? `:${answer.reason}` : ""}`);
      return host.approveError ?? null;
    },
    answer: async (id, tool, answers) => {
      calls.push(`chat.answer:${id}:${tool}:${JSON.stringify(answers)}`);
      return host.answerError ?? null;
    },
    list: (dir, listener) => {
      const watcher = { dir, listener };
      listWatchers.add(watcher);
      queueMicrotask(() => listWatchers.has(watcher) && sendList(watcher));
      return () => void listWatchers.delete(watcher);
    },
  };
  return {
    bridge,
    /** The agent says something: the server pushes each event to the chat's watchers. */
    emit: (id: string, ...events: ChatEvent[]) =>
      act(() => {
        for (const e of events) record(id, e);
      }),
    watching: (id: string) => watchers.get(id)?.size ?? 0,
    /** How many chat lists the server has sent, so a test can wait until the list has arrived. */
    listsSent: () => listsSent,
  };
}
