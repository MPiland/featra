/**
 * The subagents a session spawns for itself (STORY-55, ADR 0030), as chats of their own: each is a read-only transcript
 * nested under the session that spawned it, with the same log, watch and list row as any chat. It lives in memory with
 * its session: never saved, and gone when the session ends or its project closes. Stop ends one subagent through the
 * provider, never its session's turn. The provider reports; this module only shows.
 */
import { CHAT_MESSAGES, chatTitle, newSummary, reduceRow, type ChatEvent, type ChatSummary } from "@featra/work-format";
import { ChatError } from "./chat-error.ts";
import { tellAll } from "./chat-list-watch.ts";
import { restored, type Chat } from "./chat-state.ts";
import type { SubagentEvent } from "./provider.ts";

export interface SubagentsHost {
  chats: Map<string, Chat>;
  newId: () => string;
  now: () => Date;
  listChanged: (dir: string) => void;
  log: (message: string) => void;
}

/** What the manager knows of a subagent chat: the session it belongs to, and the provider's id for it. */
interface Entry {
  parent: string;
  provider: string;
}

/** The chat of the provider's subagent `id` in the session `parent`, as a key. */
const keyOf = (parent: string, id: string) => `${parent}\n${id}`;

const withStop = (s: ChatSummary, stoppable: boolean): ChatSummary =>
  !s.subagent || s.subagent.stoppable === stoppable ? s : { ...s, subagent: { ...s.subagent, stoppable } };

export function createSubagents({ chats, newId, now, listChanged, log }: SubagentsHost) {
  /** Subagent chats by chat id. */
  const entries = new Map<string, Entry>();
  const chatOf = new Map<string, string>();

  /** Adds an event to the subagent's log, tells its watchers and keeps its row current: it never waits on the user. */
  function put(c: Chat, event: ChatEvent) {
    c.events?.push(event);
    tellAll(c.listeners, event, log);
    const { summary, asks } = reduceRow(c, event);
    c.asks = asks;
    const next: ChatSummary = summary.waiting === null ? summary : { ...summary, waiting: null };
    if (next === c.summary) return;
    c.summary = next;
    listChanged(c.dir);
  }

  function update(c: Chat, change: (s: ChatSummary) => ChatSummary) {
    const next = change(c.summary);
    if (next === c.summary) return;
    c.summary = next;
    listChanged(c.dir);
  }

  function begin(parent: Chat, e: Extract<SubagentEvent, { type: "started" }>) {
    if (chatOf.has(keyOf(parent.id, e.id))) return;
    const id = newId();
    const { model, effort } = parent.summary.role;
    const role = { id: "subagent", name: e.kind ?? "Subagent", model, effort };
    const row = newSummary(id, parent.summary.provider, role, now().toISOString());
    const title = chatTitle(e.label);
    const c = restored(
      id,
      parent.dir,
      { ...row, title, subagent: { parent: parent.id, stoppable: e.stoppable } },
      null,
      null,
      parent.cwd,
    );
    // `restored` starts a row idle: a subagent is running from the start.
    c.summary = { ...c.summary, running: true };
    c.events = [];
    c.refusal = CHAT_MESSAGES.subagent;
    chats.set(id, c);
    entries.set(id, { parent: parent.id, provider: e.id });
    chatOf.set(keyOf(parent.id, e.id), id);
    listChanged(c.dir);
  }

  function remove(c: Chat) {
    const entry = entries.get(c.id);
    if (!entry) return;
    entries.delete(c.id);
    chatOf.delete(keyOf(entry.parent, entry.provider));
    c.listeners.clear();
    chats.delete(c.id);
  }

  return {
    /** Whether `id` is a subagent chat. */
    is: (id: string) => entries.has(id),
    /** What a session's provider reports of its subagents. */
    handle(parent: Chat, e: SubagentEvent) {
      if (e.type === "started") return begin(parent, e);
      const found = chatOf.get(keyOf(parent.id, e.id));
      const c = found ? chats.get(found) : undefined;
      if (!c) return;
      if (e.type === "event") put(c, e.event);
      else if (e.type === "updated") update(c, (s) => withStop(s, e.stoppable));
      else {
        put(c, { type: "turn-end", outcome: e.outcome });
        update(c, (s) => withStop(s, false));
      }
    },
    /** Ends this subagent alone through its session's provider; refused when the provider can't, or it has ended. */
    async stop(c: Chat) {
      const entry = entries.get(c.id);
      const agent = entry ? chats.get(entry.parent)?.agent : null;
      if (!entry || !c.summary.subagent?.stoppable || !agent?.stopSubagent)
        throw new ChatError(CHAT_MESSAGES.noSubagentStop);
      await agent.stopSubagent(entry.provider);
    },
    /** The subagent chat ends with the project closing, on its own. */
    drop(c: Chat) {
      remove(c);
    },
    /** The session ended: its subagents go with it. */
    forget(parent: Chat) {
      const own = [...entries].filter(([, entry]) => entry.parent === parent.id);
      for (const [id] of own) {
        const c = chats.get(id);
        if (c) remove(c);
      }
      if (own.length > 0) listChanged(parent.dir);
    },
  };
}
