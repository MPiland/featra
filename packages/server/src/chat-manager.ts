/**
 * The session manager (ADR 0018): the chats the server runs, each a role's agent session behind its provider
 * adapter, with the event log its watchers replay. Chats are saved in the app's data (STORY-44): after a restart, or
 * when their project opens again, they come back, their transcript read from the provider's own session.
 */
import { randomUUID } from "node:crypto";
import {
  CHAT_MESSAGES,
  newSummary,
  reduceSummary,
  savedChat,
  type ChatEvent,
  type ChatSummary,
  type ProviderId,
  type ProviderInfo,
  type Role,
} from "@featra/work-format";
import { projectKey } from "./allowed-projects.ts";
import { createListWatchers, tellAll } from "./chat-list-watch.ts";
import { chatSaver, memoryChatStore, savedHistory, type ChatStore } from "./chat-store.ts";
import type { ApprovalHandler, ProviderAdapter, ProviderSession } from "./provider.ts";
import type { RoleRegistry } from "./role-registry.ts";

/** What the session manager refuses: the message is shown to the user. */
export class ChatError extends Error {}

/** Until STORY-45 asks the user, every tool that needs approval is denied, and the chat shows the denial. */
export const denyUntilApprovals: ApprovalHandler = async () => ({ allow: false, message: CHAT_MESSAGES.denied });

interface Chat {
  id: string;
  dir: string;
  /** Its row in the chat list. */
  summary: ChatSummary;
  /** The provider's session it goes on with: the one the agent reported, or the one it was saved with. */
  session: string | null;
  /** A new session the agent reported, saved once the agent answers: before then Claude may not have written it. */
  pending: string | null;
  /** The log; null until a restored chat is opened, when its transcript is read. */
  events: ChatEvent[] | null;
  opening: Promise<void> | null;
  listeners: Set<(event: ChatEvent) => void>;
  /** The agent session, made when the chat starts or opens; null when its role or provider is missing. */
  agent: ProviderSession | null;
  /** Why it can't take a message without an agent: its role or provider is missing. */
  refusal: string | null;
  running: boolean;
  /** Its project is closed: the chat is kept, out of the list, until the project opens again. */
  closed: boolean;
}

export interface ChatManager {
  /** Starts a chat from a role in the project folder; its agent starts with the first message. */
  start: (dir: string, roleId: string) => Promise<string>;
  /** Readies a chat to watch and send to: a restored chat reads its transcript from its provider, running no agent. */
  open: (id: string) => Promise<void>;
  /** The chat's log so far, and every later event to `listener` until `stop`. */
  watch: (id: string, listener: (event: ChatEvent) => void) => { events: ChatEvent[]; stop: () => void };
  send: (id: string, text: string) => void;
  /** Interrupts the running turn, if any. */
  stop: (id: string) => Promise<void>;
  /** The chat's project folder, or null when there is no such chat. */
  dirOf: (id: string) => string | null;
  /** The project's chats as the list shows them, oldest first. */
  list: (dir: string) => ChatSummary[];
  /**
   * The project's chats now, and the whole list again to `listener` each time a row changes or a chat comes or goes,
   * until `stop`. A streamed reply doesn't change a row, so it doesn't call it.
   */
  watchList: (dir: string, listener: (chats: ChatSummary[]) => void) => { chats: ChatSummary[]; stop: () => void };
  /** Every provider the manager runs, and whether its agent is installed. */
  providers: () => Promise<ProviderInfo[]>;
  /**
   * Ends the chats of every project `keep` turns down (a project the user closed): no more events, no more turns.
   * They stay saved, and come back when `keep` takes their project again.
   */
  closeProjects: (keep: (dir: string) => boolean) => void;
  close: () => void;
  /** Resolves once every change so far is saved. */
  flush: () => Promise<void>;
  /** Resolves once the saved chats are read, so a list holds them. */
  ready: () => Promise<void>;
}

export interface ChatManagerDeps {
  providers: readonly ProviderAdapter[];
  roles: RoleRegistry;
  approve?: ApprovalHandler;
  newId?: () => string;
  /** The clock a chat's start is stamped with. */
  now?: () => Date;
  log?: (message: string) => void;
  /** Where chats are saved; nowhere by default. */
  store?: ChatStore;
  /** Whose rule project folders compare by (`projectKey`); this machine's by default. */
  platform?: string;
}

/** A chat not yet opened: a saved one, or a new one before its log and agent are made. */
const restored = (id: string, dir: string, summary: ChatSummary, session: string | null): Chat => ({
  id,
  dir,
  summary: { ...summary, running: false },
  session,
  pending: null,
  events: null,
  opening: null,
  listeners: new Set(),
  agent: null,
  refusal: null,
  running: false,
  closed: false,
});

const oldestFirst = (a: ChatSummary, b: ChatSummary) => a.startedAt.localeCompare(b.startedAt);

export function createChatManager({
  providers,
  roles,
  approve = denyUntilApprovals,
  newId = randomUUID,
  now = () => new Date(),
  log = () => {},
  store = memoryChatStore(),
  platform = process.platform,
}: ChatManagerDeps): ChatManager {
  const chats = new Map<string, Chat>();
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
        chats.set(s.summary.id, restored(s.summary.id, s.dir, s.summary, s.session));
        dirs.add(s.dir);
      }
      for (const dir of dirs) listChanged(dir);
    },
    () => [...chats.values()].map((c) => savedChat(c.dir, c.session, c.summary)),
  );
  const save = () => saver.save();

  function record(c: Chat, event: ChatEvent) {
    if (event.type === "user") c.running = true;
    if (event.type === "turn-end") c.running = false;
    c.events?.push(event);
    tell(c.listeners, event);
    if (event.type === "started") c.pending = c.agent?.sessionId() ?? null;
    // The agent's answer means Claude has written the turn, so the session can be resumed after a restart.
    const answered = event.type === "text" || event.type === "tool" || event.type === "tool-result";
    const session = answered && c.pending ? c.pending : c.session;
    if (answered) c.pending = null;
    const summary = reduceSummary(c.summary, event);
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
    return adapter.start({
      chat: c.id,
      cwd: c.dir,
      role,
      emit,
      resume: c.session,
      approve: async (request, signal) => {
        const decision = await approve({ ...request, chat: c.id }, signal);
        // A request Stop or close cut short wasn't denied: the turn's end marks the row stopped.
        if (!decision.allow && !signal.aborted)
          emit({ type: "tool-denied", id: request.id, name: request.name, input: request.input });
        return decision;
      },
    });
  }

  /** Reads a restored chat's transcript and makes its agent session; a chat whose session is gone gets neither. */
  async function load(c: Chat) {
    const adapter = provider(c.summary.provider);
    const { events, gone } = await savedHistory(adapter, c.session, c.dir);
    const role = gone || !adapter ? null : await roles.get(c.dir, c.summary.role.id);
    // Closed while reading: the chat is opened afresh when its project is back.
    if (c.events !== null || c.closed) return;
    c.events = events;
    c.refusal = gone
      ? CHAT_MESSAGES.gone
      : !adapter
        ? CHAT_MESSAGES.noProvider
        : !role
          ? CHAT_MESSAGES.unknownRole
          : null;
    if (adapter && role && !gone) c.agent = agentFor(c, adapter, role);
  }

  /** Ends the chat's agent and forgets its log; the chat itself is kept, to open again. */
  function end(c: Chat) {
    c.listeners.clear();
    c.agent?.close();
    c.agent = null;
    c.events = null;
    c.opening = null;
    c.running = false;
    c.summary = { ...c.summary, running: false };
  }

  return {
    async start(dir, roleId) {
      const role = await roles.get(dir, roleId);
      if (!role) throw new ChatError(CHAT_MESSAGES.unknownRole);
      const adapter = provider(role.provider);
      if (!adapter) throw new ChatError(CHAT_MESSAGES.noProvider);
      const id = newId();
      const c = restored(id, dir, newSummary(id, role.provider, role, now().toISOString()), null);
      c.events = [];
      c.agent = agentFor(c, adapter, role);
      chats.set(id, c);
      save();
      listChanged(dir);
      return id;
    },
    async open(id) {
      await saver.loaded;
      const c = chat(id);
      if (c.events !== null) return;
      c.opening ??= load(c);
      await c.opening;
    },
    watch(id, listener) {
      const c = chat(id);
      c.listeners.add(listener);
      return { events: [...(c.events ?? [])], stop: () => c.listeners.delete(listener) };
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
    dirOf: (id) => {
      const c = chats.get(id);
      return c && !c.closed ? c.dir : null;
    },
    list,
    watchList: (dir, listener) => lists.watch(dir, listener),
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
    },
    flush: () => saver.flush(),
    ready: () => saver.loaded,
  };
}
