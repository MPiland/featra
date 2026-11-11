// The local server's chat side, as a fake: each chat's event log held in memory, pushed to its watchers. What the
// view makes of the log is work-format's real fold; the events are the protocol's, as the server would send them.
import { act } from "react";
import {
  BUILT_IN_ROLES,
  chatName,
  foldChat,
  newSummary,
  reduceRow,
  retitle,
  type ApprovalAnswer,
  type Card,
  type TitleBy,
  type ChatEvent,
  type ChatRow,
  type ProviderInfo,
  type Role,
} from "@featra/work-format";
import type { ChatControls, ChatSettings } from "@featra/work-format/chat-controls";
import type { ModeInfo } from "@featra/work-format/modes";
import type { ChatBridge, ChatListUpdate, ChatUpdate } from "../src/chats.ts";
import { fakeInboxServer } from "./inbox-server.ts";

/** What the fake server's agent offers: Claude's own names, as its adapter lists them. */
export const CLAUDE_CONTROLS: ChatControls = {
  models: ["sonnet", "opus", "haiku"].map((value) => ({ value, label: value })),
  efforts: ["low", "medium", "high"].map((value) => ({ value, label: value })),
  modes: [
    { value: "default", label: "default (Ask)" },
    { value: "plan", label: "plan" },
    { value: "bypassPermissions", label: "bypassPermissions", fullAccess: true },
  ],
};

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
  /** What `chat.undoLog` refuses with, if anything. */
  undoError?: string;
  /** What `chat.answer` refuses with, if anything. */
  answerError?: string;
  /** What `chat.configure` refuses with, if anything. */
  configureError?: string;
  /** The providers `chat.list` reports. Default: Claude, installed. */
  providers?: ProviderInfo[];
  /** The mode the server reports a chat started in, from the provider's settings. Default: none (Ask). */
  chatMode?: ModeInfo;
  /** The one-line note the server reports a chat started with. Default: none. */
  chatNote?: string;
  /** The card each chat the fake server starts is for, by role id (STORY-7). Default: none. */
  chatCards?: Record<string, string>;
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
  const inbox = fakeInboxServer();
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
  const update = (id: string): ChatUpdate => ({
    chat: foldChat(logs.get(id) ?? []),
    error: null,
    ...(host.chatMode ? { mode: host.chatMode } : {}),
    ...(host.chatNote ? { note: host.chatNote } : {}),
  });
  const record = (id: string, event: ChatEvent) => {
    logs.get(id)?.push(event);
    for (const l of watchers.get(id) ?? []) l(update(id));
    const row = rows.get(id);
    if (!row) return;
    const next = reduceRow(row, event);
    row.asks = next.asks;
    inbox.heard(
      { id, dir: row.dir, chatName: chatName(next.summary), ...(row.summary.card ? { card: row.summary.card } : {}) },
      event,
      next.asks,
    );
    if (next.summary === row.summary) return;
    row.summary = next.summary;
    listChanged(row.dir);
  };
  // Each chat's settings, as the server keeps them: its role's, then what `chat.configure` changed.
  const settings = new Map<string, ChatSettings>();
  const settingsOf = (id: string): ChatSettings | null => {
    const kept = settings.get(id);
    if (kept) return kept;
    const role = rows.get(id)?.summary.role;
    if (!role) return null;
    const fresh = { role: role.id, model: role.model, effort: role.effort, mode: "default" };
    settings.set(id, fresh);
    return fresh;
  };
  const bridge: ChatBridge = {
    roles: async () => host.roles ?? [...BUILT_IN_ROLES],
    start: async (dir, role, card = host.chatCards?.[role]) => {
      calls.push(`chat.start:${dir}:${role}`);
      if (host.startError) return { ok: false, error: host.startError };
      const id = `chat-${logs.size + 1}`;
      logs.set(id, []);
      const found = (host.roles ?? BUILT_IN_ROLES).find((r) => r.id === role);
      if (found) rows.set(id, { dir, summary: newSummary(id, found.provider, found, now(), card), asks: [] });
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
    undoLog: async (id, entry) => {
      calls.push(`chat.undoLog:${id}:${entry}`);
      return host.undoError ?? null;
    },
    controls: async (id) => {
      calls.push(`chat.controls:${id}`);
      const kept = settingsOf(id);
      return kept
        ? { ok: true, state: { controls: CLAUDE_CONTROLS, settings: kept } }
        : { ok: false, error: "No chat." };
    },
    configure: async (id, change) => {
      calls.push(`chat.configure:${id}:${JSON.stringify(change)}`);
      if (host.configureError) return { ok: false, error: host.configureError };
      const was = settingsOf(id);
      if (!was) return { ok: false, error: "No chat." };
      const next = { ...was, ...change };
      settings.set(id, next);
      return { ok: true, state: { controls: CLAUDE_CONTROLS, settings: next } };
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
    /** The Inbox side: the clock the test moves, and what is watching. */
    inbox,
    /** The agent says something: the server pushes each event to the chat's watchers. */
    emit: (id: string, ...events: ChatEvent[]) =>
      act(() => {
        for (const e of events) record(id, e);
      }),
    /** The server renames a chat (a draft names it for its feature), with work-format's real rule. */
    retitle: (id: string, title: string, by: TitleBy) =>
      act(() => {
        const row = rows.get(id);
        const summary = row && retitle(row.summary, title, by);
        if (!row || !summary || summary === row.summary) return;
        row.summary = summary;
        listChanged(row.dir);
      }),
    /** The server starts (or queues) a story's session under its feature: a row of the list with the story it works on. */
    addStory: (dir: string, story: Card, feature: Card, queued: boolean) => {
      const id = `story-chat-${logs.size + 1}`;
      const dev = (host.roles ?? BUILT_IN_ROLES).find((r) => r.id === "developer");
      logs.set(id, []);
      if (dev) {
        // The Dev Lead is the chat that drafted the feature: here, the project's Dev Lead chat if it has one.
        const lead = [...rows].find(([, r]) => r.dir === dir && r.summary.role.id === "dev-lead")?.[0] ?? null;
        const ref = { id: story.id, parent: lead, feature: feature.id, featureTitle: feature.title };
        rows.set(id, {
          dir,
          summary: retitle(
            newSummary(id, dev.provider, dev, now(), story.id, ref, queued),
            `${story.id} ${story.title}`,
            "draft",
          ),
          asks: [],
        });
      }
      act(() => listChanged(dir));
      return { chat: id, queued };
    },
    watching: (id: string) => watchers.get(id)?.size ?? 0,
    /** How many chat lists the server has sent, so a test can wait until the list has arrived. */
    listsSent: () => listsSent,
  };
}
