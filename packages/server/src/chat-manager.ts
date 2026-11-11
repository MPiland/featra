/**
 * The session manager (ADR 0018): the chats the server runs, each a role's agent session behind its provider
 * adapter, with the event log its watchers replay. Chats are saved in the app's data (STORY-44): after a restart, or
 * when their project opens again, they come back, their transcript read from the provider's own session.
 */
import { randomUUID } from "node:crypto";
import {
  CHAT_MESSAGES,
  chatName,
  DEFAULT_CONFIG,
  idleSummary,
  newSummary,
  reduceRow,
  retitle,
  type ChatEvent,
  type ChatSummary,
  type ProviderId,
} from "@featra/work-format";
import { projectKey } from "./allowed-projects.ts";
import { createApprovalDesk } from "./approval-desk.ts";
import { composerOf, configureChat, controlState } from "./chat-composer.ts";
import { ChatError } from "./chat-error.ts";
import type { ChatManager, ChatManagerDeps } from "./chat-manager-types.ts";
import { createListWatchers, tellAll } from "./chat-list-watch.ts";
import { chatSaver, memoryChatStore, savedHistory, withWindow } from "./chat-store.ts";
import { chatsToSave, closeProjects, restoreChats } from "./chat-projects.ts";
import { restored, type Chat } from "./chat-state.ts";
import { createStoryRunner } from "./chat-stories.ts";
import { createAgentFactory } from "./chat-agent.ts";
import { chatLookups } from "./chat-lookups.ts";
import { storyControl } from "./chat-story-control.ts";
import { createInbox } from "./inbox.ts";
import { createSend } from "./chat-send.ts";
import { createStoryNotices } from "./story-notices.ts";
import { createStoryMirror } from "./story-mirror.ts";

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
  storyLimit = async () => DEFAULT_CONFIG.maxStoryAgents,
  platform = process.platform,
}: ChatManagerDeps): ChatManager {
  const chats = new Map<string, Chat>();
  // The desk tells only a chat that is open: one ended or closed has no requests left.
  const desk = createApprovalDesk((id, event) => {
    const c = chats.get(id);
    if (c && c.events !== null && !c.closed) {
      record(c, event);
      mirror.mirror(c, event);
    }
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
  const agentFor = createAgentFactory({
    mcp,
    decide,
    desk,
    record: (c, e) => record(c, e),
    listChanged: (dir) => listChanged(dir),
    asked: (c, request) => notices.asked(c, request),
  });
  const mirror = createStoryMirror(chats, (c, event) => record(c, event, true));
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
    (saved) => restoreChats(chats, saved, listChanged),
    () => chatsToSave(chats, provider),
  );
  const save = () => saver.save();

  function record(c: Chat, event: ChatEvent, mirrored = false) {
    if (event.type === "usage" && event.window !== c.window) {
      c.window = event.window;
      save();
    }
    if (event.type === "user") c.running = true;
    if (event.type === "turn-end") {
      c.running = false;
      // A story session's turn is over: what its parent shows of its requests closes with it.
      mirror.clear(c);
      stories.release(c);
      notices.turnEnded(c, event.outcome);
    }
    c.events?.push(event);
    tell(c.listeners, event);
    if (event.type === "started") c.pending = c.agent?.sessionId() ?? null;
    // The agent's answer means Claude has written the turn, so the session can be resumed after a restart.
    const answered =
      event.type === "text" || event.type === "thinking" || event.type === "tool" || event.type === "tool-result";
    const session = answered && c.pending ? c.pending : c.session;
    if (answered) c.pending = null;
    const { summary, asks } = reduceRow(c, event);
    const asksChanged = asks !== c.asks;
    c.asks = asks;
    if (!mirrored && (event.type === "approval" || event.type === "question")) inbox.opened(c.id, event);
    if (asksChanged) inbox.keep(c.id, asks);
    if (summary === c.summary && session === c.session) return;
    const rowChanged = summary !== c.summary;
    c.session = session;
    c.summary = summary;
    save();
    // A new session id is saved, but the row doesn't show it.
    if (rowChanged) listChanged(c.dir);
  }

  /** Reads a restored chat's transcript and makes its agent session; a chat whose session is gone gets neither. */
  async function load(c: Chat) {
    const adapter = provider(c.summary.provider);
    const { events, gone } = await savedHistory(adapter, c.session, c.cwd);
    const role = gone || !adapter ? null : await roles.get(c.dir, c.summary.role.id);
    // Closed while reading: the chat is opened afresh when its project is back.
    if (c.events !== null || c.closed) return;
    c.events = withWindow(events, c.window);
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
    mirror.clear(c);
    mirror.ended(c);
    stories.dropped(c);
    notices.forget(c);
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

  const notices = createStoryNotices({
    chats,
    open,
    send: (id, text) => send(id, text),
    askUser: (c, request) => desk.ask({ ...request, chat: c.id }, new AbortController().signal),
    log,
  });

  const stories = createStoryRunner({
    chats,
    provider,
    roles,
    desk,
    open: (id) => open(id),
    newId,
    now,
    limit: storyLimit,
    same,
    agentFor,
    record: (c, event) => record(c, event),
    failedStart: (c, why) => notices.failedStart(c, why),
    setSummary: (c, summary) => void (c.summary = summary),
    save,
    listChanged,
    log,
  });

  const sender = createSend({ chat, record: (c, e) => record(c, e), stories, log });
  const send = (id: string, text: string) => sender.send(id, text);
  const claim = (c: Chat) => sender.claim(c);

  const control = storyControl({ chat, open, provider, record, stories, notices, claim, listChanged, log });

  return {
    ...chatLookups(chats, chat, providers, same),
    startStory: (opts) => stories.start(opts),
    queuedStory: (dir, story) => stories.queuedFor(dir, story),
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
    send,
    ...control,
    // A story session's approval shown in its parent chat is answered from there too.
    approve: (id, tool, answer) => desk.answer(mirror.holder(chat(id).id, tool) ?? chat(id).id, tool, answer),
    answer: (id, tool, answers) => desk.reply(chat(id).id, tool, answers),
    report(id, event) {
      const c = chats.get(id);
      if (c && c.events !== null && !c.closed) record(c, event);
    },
    list,
    watchList: (dir, listener) => lists.watch(dir, listener),
    watchInbox: inbox.watch,
    watchAsked: inbox.watchAsked,
    closeProjects: (keep) => closeProjects(chats, keep, end, listChanged),
    close() {
      for (const c of chats.values()) end(c);
      lists.clear();
      inbox.close();
    },
    flush: () => saver.flush(),
    ready: () => saver.loaded,
  };
}
