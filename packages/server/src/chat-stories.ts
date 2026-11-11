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
import type { ProviderAdapter, ProviderSession, WorktreeSpot } from "./provider.ts";
import type { RoleRegistry } from "./role-registry.ts";

/** What the spawner is told when a session is about to start: it makes the worktree and builds the first message. */
export interface StoryPrep {
  chat: string;
  adapter: ProviderAdapter;
  role: Role;
  settings: ChatSettings;
  /** Where the provider keeps its worktrees. */
  spot: WorktreeSpot;
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
  /**
   * Makes the session's worktree and card, and says where the agent works and what its first message is. `undo` takes
   * them back, for a session that goes away before its agent starts.
   */
  prepare: (prep: StoryPrep) => Promise<{ cwd: string; first: string; undo: () => Promise<void> }>;
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
  /** Loads a restored chat (its transcript and settings) so it can be read. */
  open: (id: string) => Promise<void>;
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
  /**
   * A later turn of a story session (the user's or the Dev Lead's message, already in its log): `run` starts it now when
   * a slot is free, else it waits queued, in order with the sessions that haven't started. Resolves once it runs or waits.
   */
  turn: (c: Chat, run: () => void) => Promise<void>;
  /** The user stopped a turn still waiting for a slot: it leaves the queue. False when the turn wasn't waiting. */
  cancelTurn: (c: Chat) => Promise<boolean>;
  /** Whether a session for the story is waiting in the queue. */
  queuedFor: (dir: string, story: string) => boolean;
}

interface Waiting {
  c: Chat;
  launch: () => Promise<void>;
  /** A later turn of a session that has started, not its first. */
  turn: boolean;
}

export const STORY_MESSAGES = {
  closed: "The project was closed before the story started.",
} as const;

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
  const admitting = new Map<string, Promise<void>>();
  let chain: Promise<void> = Promise.resolve();

  const inProject = (dir: string) => [...host.chats.values()].filter((c) => !c.closed && host.same(c.dir, dir));
  const active = (dir: string) => inProject(dir).filter((c) => c.slot).length;

  /** Makes the worktree, then starts the agent in it with its first message. The slot is already held. */
  async function launch(c: Chat, opts: StoryStartOpts, adapter: ProviderAdapter, role: Role, settings: ChatSettings) {
    const spot = adapter.worktrees;
    if (!spot) throw new ChatError(CHAT_MESSAGES.noRunner);
    const made = await opts.prepare({ chat: c.id, adapter, role, settings, spot });
    const undo = () =>
      made.undo().catch((e: unknown) => host.log(`Story ${opts.story.id} was not undone: ${reason(e)}`));
    // The chat went away while its worktree was being made: nothing is left with no session to own it.
    if (!host.chats.has(c.id) || c.closed) {
      await undo();
      throw new ChatError(STORY_MESSAGES.closed);
    }
    try {
      await begin(c, opts, adapter, role, made);
    } catch (err) {
      await undo();
      throw err;
    }
  }

  async function begin(
    c: Chat,
    opts: StoryStartOpts,
    adapter: ProviderAdapter,
    role: Role,
    { cwd, first }: { cwd: string; first: string },
  ) {
    // The permissions are the Dev Lead's chat's at launch, not at queue time: a queued session waits behind others.
    const parent = opts.story.parent ? host.chats.get(opts.story.parent) : undefined;
    const inherited = parent && parent.events !== null && !parent.closed ? host.desk.inherit(parent.id, c.id) : [];
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

  /** Admits a story session's later turn: it takes a slot, or waits Queued for one. */
  const admit = async (c: Chat, run: () => void) => {
    const dir = c.dir;
    const limit = await host.limit(dir);
    if (queue.some((q) => host.same(q.c.dir, dir)) || active(dir) >= limit) {
      host.setSummary(c, { ...c.summary, queued: true });
      queue.push({
        c,
        turn: true,
        launch: async () => {
          host.setSummary(c, unqueued(c.summary));
          host.listChanged(dir);
          run();
        },
      });
      host.listChanged(dir);
      return;
    }
    c.slot = true;
    run();
  };

  return {
    async start(opts) {
      const role = await host.roles.get(opts.dir, opts.roleId);
      if (!role) throw new ChatError(CHAT_MESSAGES.unknownRole);
      const adapter = host.provider(role.provider);
      if (!adapter) throw new ChatError(CHAT_MESSAGES.noProvider);
      if (!adapter.worktrees) throw new ChatError(CHAT_MESSAGES.noRunner);
      const parentId = opts.story.parent;
      const parent = parentId ? host.chats.get(parentId) : undefined;
      // A Dev Lead chat that is listed but not loaded (restored, not opened) is loaded for its mode, not guessed at.
      if (parent && !parent.closed && parent.events === null) await host.open(parent.id).catch(() => {});
      const { kept, settings } = settingsFor(adapter, role, parent, opts);
      const limit = await host.limit(opts.dir);
      const id = host.newId();
      const named = newSummary(id, role.provider, role, host.now().toISOString(), opts.story.id, opts.story, true);
      const summary = opts.title ? retitle(named, opts.title, "draft") : named;
      const c = restored(id, opts.dir, summary, null, kept);
      c.events = [];
      const go = () => launch(c, opts, adapter, role, settings);
      const waits = queue.some((q) => host.same(q.c.dir, opts.dir)) || active(opts.dir) >= limit;
      host.chats.set(id, c);
      if (waits) {
        c.refusal = CHAT_MESSAGES.queued;
        queue.push({
          c,
          turn: false,
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
      const waiting = at >= 0 ? queue.splice(at, 1)[0] : undefined;
      release(c);
      // A session that hasn't started (waiting, or launching) is forgotten: it was never saved.
      if (!c.agent && c.summary.queued) host.chats.delete(c.id);
      else if (waiting) host.setSummary(c, unqueued(c.summary));
    },
    turn(c, run) {
      const admitted = admit(c, run);
      admitting.set(c.id, admitted);
      return admitted.finally(() => admitting.delete(c.id));
    },
    async cancelTurn(c) {
      // A stop that comes while the turn is still being admitted waits for that, so it finds the turn in the queue.
      await admitting.get(c.id);
      const at = queue.findIndex((q) => q.c === c && q.turn);
      if (at < 0) return false;
      queue.splice(at, 1);
      host.setSummary(c, unqueued(c.summary));
      host.listChanged(c.dir);
      return true;
    },
    queuedFor: (dir, story) => queue.some((q) => host.same(q.c.dir, dir) && q.c.summary.story?.id === story),
  };
}
