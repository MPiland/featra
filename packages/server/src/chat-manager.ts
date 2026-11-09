/**
 * The session manager (ADR 0018): the chats the server runs, each a role's agent session behind its provider
 * adapter, with the event log its watchers replay. Chats outlive the socket that started them and end with the server
 * (STORY-44 brings them back after a restart, from the provider's own session files).
 */
import { randomUUID } from "node:crypto";
import {
  CHAT_MESSAGES,
  errorMessage,
  newSummary,
  reduceSummary,
  type ChatEvent,
  type ChatSummary,
  type ProviderId,
  type ProviderInfo,
  type Role,
} from "@featra/work-format";
import type { ApprovalHandler, ProviderAdapter, ProviderSession } from "./provider.ts";
import type { RoleRegistry } from "./role-registry.ts";

/** What the session manager refuses: the message is shown to the user. */
export class ChatError extends Error {}

/** Until STORY-45 asks the user, every tool that needs approval is denied, and the chat shows the denial. */
export const denyUntilApprovals: ApprovalHandler = async () => ({ allow: false, message: CHAT_MESSAGES.denied });

interface Chat {
  id: string;
  dir: string;
  role: Role;
  events: ChatEvent[];
  listeners: Set<(event: ChatEvent) => void>;
  session: ProviderSession;
  running: boolean;
  /** Its row in the chat list. */
  summary: ChatSummary;
}

export interface ChatManager {
  /** Starts a chat from a role in the project folder; its agent starts with the first message. */
  start: (dir: string, roleId: string) => Promise<string>;
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
  /** Ends the chats of every project `keep` turns down (a project the user closed): no more events, no more turns. */
  closeProjects: (keep: (dir: string) => boolean) => void;
  close: () => void;
}

export interface ChatManagerDeps {
  providers: readonly ProviderAdapter[];
  roles: RoleRegistry;
  approve?: ApprovalHandler;
  newId?: () => string;
  /** The clock a chat's start is stamped with. */
  now?: () => Date;
  log?: (message: string) => void;
}

export function createChatManager({
  providers,
  roles,
  approve = denyUntilApprovals,
  newId = randomUUID,
  now = () => new Date(),
  log = () => {},
}: ChatManagerDeps): ChatManager {
  // STORY-44's seam: chats restored after a restart join this map with their saved summary, and the list shows them.
  const chats = new Map<string, Chat>();
  const listWatchers = new Set<{ dir: string; listener: (chats: ChatSummary[]) => void }>();
  const provider = (id: ProviderId) => providers.find((p) => p.id === id);

  const chat = (id: string): Chat => {
    const found = chats.get(id);
    if (!found) throw new ChatError(CHAT_MESSAGES.noChat);
    return found;
  };

  const list = (dir: string) => [...chats.values()].filter((c) => c.dir === dir).map((c) => c.summary);

  /** Calls each listener; one watcher's failure (a closed socket, say) must not stop the others or the agent. */
  function tell<T>(listeners: Iterable<(value: T) => void>, value: T) {
    for (const listener of listeners) {
      try {
        listener(value);
      } catch (err) {
        log(`A chat watcher failed: ${errorMessage(err)}`);
      }
    }
  }

  function listChanged(dir: string) {
    const watching = [...listWatchers].filter((w) => w.dir === dir);
    if (watching.length > 0)
      tell(
        watching.map((w) => w.listener),
        list(dir),
      );
  }

  function record(c: Chat, event: ChatEvent) {
    if (event.type === "user") c.running = true;
    if (event.type === "turn-end") c.running = false;
    c.events.push(event);
    tell(c.listeners, event);
    const summary = reduceSummary(c.summary, event);
    if (summary === c.summary) return;
    c.summary = summary;
    listChanged(c.dir);
  }

  function end(c: Chat) {
    c.listeners.clear();
    c.session.close();
    chats.delete(c.id);
  }

  return {
    async start(dir, roleId) {
      const role = await roles.get(dir, roleId);
      if (!role) throw new ChatError(CHAT_MESSAGES.unknownRole);
      const adapter = provider(role.provider);
      if (!adapter) throw new ChatError(CHAT_MESSAGES.noProvider);
      const id = newId();
      // The session reaches the chat through `emit`, which runs only after the chat is in the map.
      let self: Chat | undefined;
      const emit = (event: ChatEvent) => self && record(self, event);
      const session = adapter.start({
        chat: id,
        cwd: dir,
        role,
        emit,
        approve: async (request, signal) => {
          const decision = await approve({ ...request, chat: id }, signal);
          // A request Stop or close cut short wasn't denied: the turn's end marks the row stopped.
          if (!decision.allow && !signal.aborted)
            emit({ type: "tool-denied", id: request.id, name: request.name, input: request.input });
          return decision;
        },
      });
      const summary = newSummary(id, role.provider, role, now().toISOString());
      self = { id, dir, role, events: [], listeners: new Set(), session, running: false, summary };
      chats.set(id, self);
      listChanged(dir);
      return id;
    },
    watch(id, listener) {
      const c = chat(id);
      c.listeners.add(listener);
      return { events: [...c.events], stop: () => c.listeners.delete(listener) };
    },
    send(id, text) {
      const c = chat(id);
      if (c.running) throw new ChatError(CHAT_MESSAGES.busy);
      record(c, { type: "user", text });
      c.session.send(text);
    },
    async stop(id) {
      const c = chat(id);
      if (c.running) await c.session.interrupt();
    },
    dirOf: (id) => chats.get(id)?.dir ?? null,
    list,
    watchList(dir, listener) {
      const watcher = { dir, listener };
      listWatchers.add(watcher);
      return { chats: list(dir), stop: () => listWatchers.delete(watcher) };
    },
    providers: () =>
      Promise.all(
        providers.map(async (p) => ({ id: p.id, name: p.name, installed: await p.installed().catch(() => false) })),
      ),
    closeProjects(keep) {
      const closed = new Set<string>();
      for (const c of chats.values())
        if (!keep(c.dir)) {
          end(c);
          closed.add(c.dir);
        }
      for (const dir of closed) listChanged(dir);
    },
    close() {
      for (const c of chats.values()) end(c);
      listWatchers.clear();
    },
  };
}
