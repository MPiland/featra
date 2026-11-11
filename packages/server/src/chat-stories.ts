/**
 * Story sessions in the session manager (STORY-9, ADR 0025): a story's agent is a normal chat whose working folder is
 * the story's worktree. This holds what is particular to them: the slots that cap how many run at once, the queue of
 * those waiting for a slot (in memory: a restart forgets it, ADR 0025), and the permissions a session inherits.
 */
import {
  CHAT_MESSAGES,
  newSummary,
  retitle,
  offers,
  type ChatEvent,
  type ChatSettings,
  type ChatSummary,
  type ProviderId,
  type Role,
  type SavedComposer,
  type StoryRef,
} from "@featra/work-format";
import type { ApprovalDesk } from "./approval-desk.ts";
import { fits, offered, restoredState, startingState, withinCeiling } from "./chat-configure.ts";
import { ChatError } from "./chat-error.ts";
import { restored, type Chat } from "./chat-state.ts";
import type { ProviderAdapter, ProviderSession } from "./provider.ts";
import type { RoleRegistry } from "./role-registry.ts";

/** What the spawner is told when a session is about to start: it makes the worktree and builds the first message. */
export interface StoryPrep {
  chat: string;
  adapter: ProviderAdapter;
  role: Role;
  settings: ChatSettings;
}

/** A story session to start: the role, optional model and effort, and what the story is. */
export interface StoryStartOpts {
  dir: string;
  roleId: string;
  model?: string;
  effort?: string;
  story: StoryRef;
  /** What the session is called in the list: the story's id and title. */
  title?: string;
  /** Makes the session's worktree and card, and says where the agent works and what its first message is. */
  prepare: (prep: StoryPrep) => Promise<{ cwd: string; first: string }>;
}

/** What the runner needs of the manager. */
export interface StoryHost {
  chats: Map<string, Chat>;
  provider: (id: ProviderId) => ProviderAdapter | undefined;
  roles: RoleRegistry;
  desk: ApprovalDesk;
  newId: () => string;
  now: () => Date;
  /** The most story sessions the project runs at once. */
  limit: (dir: string) => Promise<number>;
  same: (a: string, b: string) => boolean;
  agentFor: (c: Chat, adapter: ProviderAdapter, role: Role, inherited: readonly unknown[]) => ProviderSession;
  record: (c: Chat, event: ChatEvent) => void;
  setSummary: (c: Chat, summary: ChatSummary) => void;
  save: () => void;
  listChanged: (dir: string) => void;
  log: (message: string) => void;
}

export interface StoryRunner {
  /** Starts the session now, or queues it when the project is at its limit; says which. */
  start: (opts: StoryStartOpts) => Promise<{ chat: string; queued: boolean }>;
  /** The chat's turn ended or it ended: its slot is free for the next queued session. */
  release: (c: Chat) => void;
  /** The chat ended: it leaves the queue, and a queued one is forgotten (it was never saved). */
  dropped: (c: Chat) => void;
  /** Whether a session for the story is waiting in the queue. */
  queuedFor: (dir: string, story: string) => boolean;
}

interface Waiting {
  c: Chat;
  launch: () => Promise<void>;
}

const unqueued = ({ queued: _queued, ...rest }: ChatSummary): ChatSummary => rest;
const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** What the session starts with: the parent's mode where the provider offers it, else the role's own. */
function settingsFor(adapter: ProviderAdapter, role: Role, parent: Chat | undefined, opts: StoryStartOpts) {
  const base = startingState(adapter, role);
  const live = parent !== undefined && parent.events !== null;
  const fullAccess = live ? parent.fullAccess : base.fullAccess;
  const controls = offered(adapter, role, fullAccess);
  const inheritedMode = live ? parent.settings?.mode : undefined;
  const start = withinCeiling(base.settings, controls);
  let settings: ChatSettings =
    inheritedMode && offers(controls.modes, inheritedMode) ? { ...start, mode: inheritedMode } : start;
  if (opts.model) settings = { ...settings, model: opts.model };
  if (opts.effort) settings = { ...settings, effort: opts.effort };
  if (!fits(controls, settings)) throw new ChatError(CHAT_MESSAGES.badSetting);
  const kept: SavedComposer = { settings, window: null, fullAccess };
  return { kept, settings: restoredState(adapter, role, kept).settings };
}

export function createStoryRunner(host: StoryHost): StoryRunner {
  const queue: Waiting[] = [];
  let chain: Promise<void> = Promise.resolve();

  const inProject = (dir: string) => [...host.chats.values()].filter((c) => !c.closed && host.same(c.dir, dir));
  const active = (dir: string) => inProject(dir).filter((c) => c.slot).length;

  /** Makes the worktree, then starts the agent in it with its first message. The slot is already held. */
  async function launch(
    c: Chat,
    opts: StoryStartOpts,
    adapter: ProviderAdapter,
    role: Role,
    settings: ChatSettings,
    inherited: unknown[],
  ) {
    const { cwd, first } = await opts.prepare({ chat: c.id, adapter, role, settings });
    if (!host.chats.has(c.id)) return;
    c.cwd = cwd;
    c.refusal = null;
    c.agent = host.agentFor(c, adapter, role, inherited);
    host.setSummary(c, unqueued(c.summary));
    host.save();
    host.listChanged(c.dir);
    host.record(c, { type: "user", text: first });
    c.agent.send(first);
  }

  function pump(dir: string) {
    chain = chain.then(async () => {
      for (;;) {
        const next = queue.find((q) => host.same(q.c.dir, dir));
        if (!next) return;
        if (active(dir) >= (await host.limit(dir))) return;
        queue.splice(queue.indexOf(next), 1);
        if (!host.chats.has(next.c.id) || next.c.closed) continue;
        next.c.slot = true;
        await next.launch();
      }
    });
  }

  function release(c: Chat) {
    if (!c.slot) return;
    c.slot = false;
    pump(c.dir);
  }

  return {
    async start(opts) {
      const role = await host.roles.get(opts.dir, opts.roleId);
      if (!role) throw new ChatError(CHAT_MESSAGES.unknownRole);
      const adapter = host.provider(role.provider);
      if (!adapter) throw new ChatError(CHAT_MESSAGES.noProvider);
      if (!adapter.worktrees) throw new ChatError(CHAT_MESSAGES.noRunner);
      const parentId = opts.story.parent;
      const parent = parentId ? host.chats.get(parentId) : undefined;
      const { kept, settings } = settingsFor(adapter, role, parent, opts);
      const limit = await host.limit(opts.dir);
      const id = host.newId();
      const named = newSummary(id, role.provider, role, host.now().toISOString(), opts.story.id, opts.story, true);
      const summary = opts.title ? retitle(named, opts.title, "draft") : named;
      const c = restored(id, opts.dir, summary, null, kept);
      c.events = [];
      // The session starts with the permissions the Dev Lead's chat has now.
      const inherited = parent && parent.events !== null ? host.desk.inherit(parent.id, id) : [];
      const go = () => launch(c, opts, adapter, role, settings, inherited);
      const waits = queue.some((q) => host.same(q.c.dir, opts.dir)) || active(opts.dir) >= limit;
      host.chats.set(id, c);
      if (waits) {
        c.refusal = CHAT_MESSAGES.queued;
        queue.push({
          c,
          launch: () =>
            go().catch((err: unknown) => {
              host.log(`Story session ${id} did not start: ${reason(err)}`);
              c.slot = false;
              host.setSummary(c, unqueued(c.summary));
              host.record(c, { type: "problem", problem: { type: "failed", message: reason(err) } });
              host.listChanged(c.dir);
              pump(c.dir);
            }),
        });
        host.listChanged(c.dir);
        return { chat: id, queued: true };
      }
      c.slot = true;
      try {
        await go();
      } catch (err) {
        c.slot = false;
        host.chats.delete(id);
        host.desk.forget(id);
        pump(c.dir);
        throw err;
      }
      return { chat: id, queued: false };
    },
    release,
    dropped(c) {
      const at = queue.findIndex((q) => q.c === c);
      if (at >= 0) queue.splice(at, 1);
      release(c);
      if (c.summary.queued) host.chats.delete(c.id);
    },
    queuedFor: (dir, story) => queue.some((q) => host.same(q.c.dir, dir) && q.c.summary.story?.id === story),
  };
}
