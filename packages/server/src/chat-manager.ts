/**
 * The session manager (ADR 0018): the chats the server runs, each a role's agent session behind its provider
 * adapter, with the event log its watchers replay. Chats are saved in the app's data (STORY-44): after a restart, or
 * when their project opens again, they come back, their transcript read from the provider's own session.
 */
import { randomUUID } from "node:crypto";
import {
  CHAT_MESSAGES,
  chatName,
  idleSummary,
  newSummary,
  reduceRow,
  retitle,
  savedChat,
  type ChatEvent,
  type ChatSummary,
  type ProviderId,
  type Role,
} from "@featra/work-format";
import { projectKey } from "./allowed-projects.ts";
import { createApprovalDesk } from "./approval-desk.ts";
import { applyState, composerOf, configureChat, controlState } from "./chat-composer.ts";
import { restoredState } from "./chat-configure.ts";
import { ChatError } from "./chat-error.ts";
import type { ChatManager, ChatManagerDeps } from "./chat-manager-types.ts";
import { createListWatchers, tellAll } from "./chat-list-watch.ts";
import { chatSaver, memoryChatStore, savedHistory } from "./chat-store.ts";
import { restored, type Chat } from "./chat-state.ts";
import { createInbox } from "./inbox.ts";
import type { ProviderAdapter, ProviderSession } from "./provider.ts";

export { ChatError };
export type { ChatManager, ChatManagerDeps };

const oldestFirst = (a: ChatSummary, b: ChatSummary) => a.startedAt.localeCompare(b.startedAt);

export function createChatManager({
  providers,
  roles,
  approve,
  mcp,
  timers,
  newId = randomUUID,
  now = () => new Date(),
  log = () => {},
  store = memoryChatStore(),
  platform = process.platform,
}: ChatManagerDeps): ChatManager {
  const chats = new Map<string, Chat>();
  // The desk tells only a chat that is open: one ended or closed has no requests left.
  const desk = createApprovalDesk((id, event) => {
    const c = chats.get(id);
    if (c && c.events !== null && !c.closed) record(c, event);
  });
  const decide = approve ?? desk.approve;
  // The Inbox (STORY-7) hears each request open and close, and answers nothing: the desk does, in the chat or here.
  const inbox = createInbox({
    now: () => now().getTime(),
    ...(timers ? { timers } : {}),
    chat: (id) => {
      const c = chats.get(id);
      if (!c || c.closed) return null;
      return { dir: c.dir, chatName: chatName(c.summary), ...(c.summary.card ? { card: c.summary.card } : {}) };
    },
    same: (a, b) => projectKey(a, platform) === projectKey(b, platform),
    log,
  });
  const provider = (id: ProviderId) => providers.find((p) => p.id === id);

  const chat = (id: string): Chat => {
    const found = chats.get(id);
    if (!found || found.closed) throw new ChatError(CHAT_MESSAGES.noChat);
    return found;
  };

  const same = (a: string, b: string) => projectKey(a, platform) === projectKey(b, platform);
  const shown = (dir: string) => [...chats.values()].filter((c) => same(c.dir, dir) && !c.closed);
  const list = (dir: string) =>
    shown(dir)
      .map((c) => c.summary)
      .toSorted(oldestFirst);

  const tell = <T>(listeners: Iterable<(value: T) => void>, value: T) => tellAll(listeners, value, log);
  const lists = createListWatchers(list, same, log);
  const listChanged = (dir: string) => lists.changed(dir);

  const saver = chatSaver(
    store,
    log,
    (saved) => {
      const dirs = new Set<string>();
      for (const s of saved.filter((c) => !chats.has(c.summary.id))) {
        chats.set(s.summary.id, restored(s.summary.id, s.dir, s.summary, s.session, s.composer ?? null));
        dirs.add(s.dir);
      }
      for (const dir of dirs) listChanged(dir);
    },
    () =>
      [...chats.values()].map((c) =>
        savedChat(c.dir, c.session, c.summary, composerOf(c, provider(c.summary.provider))),
      ),
  );
  const save = () => saver.save();

  function record(c: Chat, event: ChatEvent) {
    if (event.type === "usage" && event.window !== c.window) {
      c.window = event.window;
      save();
    }
    if (event.type === "user") c.running = true;
    if (event.type === "turn-end") c.running = false;
    c.events?.push(event);
    tell(c.listeners, event);
    if (event.type === "started") c.pending = c.agent?.sessionId() ?? null;
    // The agent's answer means Claude has written the turn, so the session can be resumed after a restart.
    const answered = event.type === "text" || event.type === "tool" || event.type === "tool-result";
    const session = answered && c.pending ? c.pending : c.session;
    if (answered) c.pending = null;
    const { summary, asks } = reduceRow(c, event);
    const asksChanged = asks !== c.asks;
    c.asks = asks;
    if (event.type === "approval" || event.type === "question") inbox.opened(c.id, event);
    if (asksChanged) inbox.keep(c.id, asks);
    if (summary === c.summary && session === c.session) return;
    const rowChanged = summary !== c.summary;
    c.session = session;
    c.summary = summary;
    save();
    // A new session id is saved, but the row doesn't show it.
    if (rowChanged) listChanged(c.dir);
  }

  /** The chat's agent session, through its provider; it starts the agent with the first message. */
  function agentFor(c: Chat, adapter: ProviderAdapter, role: Role): ProviderSession {
    // The session reaches the chat only through `emit`, so the chat's own fields are current when it is called.
    const emit = (event: ChatEvent) => record(c, event);
    // A reopened chat goes on with what the composer last set, while the provider still offers it.
    const state = restoredState(adapter, role, c.kept);
    if (c.kept && state.settings.model !== c.kept.settings.model) c.window = null;
    c.kept = null;
    const rowChanged = applyState(c, adapter, role, state);
    const agent = adapter.start({
      chat: c.id,
      cwd: c.dir,
      role,
      emit,
      resume: c.session,
      ...(mcp ? { mcp: () => mcp.attach({ id: c.id, dir: c.dir }) } : {}),
      approve: (request, signal) => decide({ ...request, chat: c.id, cwd: c.dir }, signal),
      ask: (request, signal) => desk.ask({ ...request, chat: c.id }, signal),
    });
    agent.configure(role, state.settings);
    if (rowChanged && c.events !== null) listChanged(c.dir);
    return agent;
  }

  /** Reads a restored chat's transcript and makes its agent session; a chat whose session is gone gets neither. */
  async function load(c: Chat) {
    const adapter = provider(c.summary.provider);
    const { events, gone } = await savedHistory(adapter, c.session, c.dir);
    const role = gone || !adapter ? null : await roles.get(c.dir, c.summary.role.id);
    // Closed while reading: the chat is opened afresh when its project is back.
    if (c.events !== null || c.closed) return;
    // The history carries no window: the last one the chat reported stands in for it.
    c.events = events.map((e) =>
      e.type === "usage" && e.window === null && c.window !== null ? Object.assign({}, e, { window: c.window }) : e,
    );
    c.refusal = gone
      ? CHAT_MESSAGES.gone
      : !adapter
        ? CHAT_MESSAGES.noProvider
        : !role
          ? CHAT_MESSAGES.unknownRole
          : null;
    if (adapter && role && !gone) c.agent = agentFor(c, adapter, role);
  }

  async function open(id: string) {
    await saver.loaded;
    const c = chat(id);
    if (c.events !== null) return;
    c.opening ??= load(c);
    await c.opening;
  }

  /** Ends the chat's agent and forgets its log; the chat itself is kept, to open again. */
  function end(c: Chat) {
    c.listeners.clear();
    mcp?.release(c.id);
    desk.forget(c.id);
    inbox.ended(c.id);
    c.kept = composerOf(c, provider(c.summary.provider));
    c.agent?.close();
    c.agent = null;
    c.role = null;
    c.settings = null;
    c.events = null;
    c.opening = null;
    c.running = false;
    c.asks = [];
    c.summary = idleSummary(c.summary);
  }

  return {
    async start(dir, roleId, card) {
      const role = await roles.get(dir, roleId);
      if (!role) throw new ChatError(CHAT_MESSAGES.unknownRole);
      const adapter = provider(role.provider);
      if (!adapter) throw new ChatError(CHAT_MESSAGES.noProvider);
      const id = newId();
      const c = restored(id, dir, newSummary(id, role.provider, role, now().toISOString(), card), null);
      c.events = [];
      c.agent = agentFor(c, adapter, role);
      chats.set(id, c);
      save();
      listChanged(dir);
      return id;
    },
    open,
    watch(id, listener) {
      const c = chat(id);
      c.listeners.add(listener);
      return {
        events: [...(c.events ?? [])],
        mode: c.mode,
        note: c.note,
        stop: () => c.listeners.delete(listener),
      };
    },
    async controls(id) {
      await open(id);
      const c = chat(id);
      return controlState(c, provider(c.summary.provider));
    },
    async configure(id, change) {
      const c = chat(id);
      // One change at a time: a change made while another waits on its role lookup applies after it, never under it.
      const done = c.changing.then(async () => {
        await open(id);
        const rowChanged = await configureChat(c, provider(c.summary.provider), change, (rid) => roles.get(c.dir, rid));
        save();
        if (rowChanged) listChanged(c.dir);
        return controlState(c, provider(c.summary.provider));
      });
      c.changing = done.catch(() => {});
      return done;
    },
    retitle(id, title, by) {
      const c = chat(id);
      const summary = retitle(c.summary, title, by);
      if (summary === c.summary) return;
      c.summary = summary;
      save();
      listChanged(c.dir);
    },
    send(id, text) {
      const c = chat(id);
      if (c.running) throw new ChatError(CHAT_MESSAGES.busy);
      if (c.events === null) throw new Error("Open the chat before sending to it.");
      if (!c.agent) throw new ChatError(c.refusal ?? CHAT_MESSAGES.noProvider);
      record(c, { type: "user", text });
      c.agent.send(text);
    },
    async stop(id) {
      const c = chat(id);
      if (c.running) await c.agent?.interrupt();
    },
    approve: (id, tool, answer) => desk.answer(chat(id).id, tool, answer),
    answer: (id, tool, answers) => desk.reply(chat(id).id, tool, answers),
    dirOf: (id) => {
      const c = chats.get(id);
      return c && !c.closed ? c.dir : null;
    },
    info(id) {
      const c = chats.get(id);
      if (!c || c.closed || c.events === null) return null;
      return { dir: c.dir, session: `${c.summary.role.name} chat ${c.id.slice(0, 8)}` };
    },
    report(id, event) {
      const c = chats.get(id);
      if (c && c.events !== null && !c.closed) record(c, event);
    },
    list,
    watchList: (dir, listener) => lists.watch(dir, listener),
    watchInbox: inbox.watch,
    watchAsked: inbox.watchAsked,
    providers: () =>
      Promise.all(
        providers.map(async (p) => ({ id: p.id, name: p.name, installed: await p.installed().catch(() => false) })),
      ),
    closeProjects(keep) {
      const changed = new Set<string>();
      for (const c of chats.values()) {
        if (c.closed === !keep(c.dir)) continue;
        if (c.closed) c.closed = false;
        else {
          end(c);
          c.closed = true;
        }
        changed.add(c.dir);
      }
      for (const dir of changed) listChanged(dir);
    },
    close() {
      for (const c of chats.values()) end(c);
      lists.clear();
      inbox.close();
    },
    flush: () => saver.flush(),
    ready: () => saver.loaded,
  };
}
