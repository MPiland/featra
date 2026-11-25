/**
 * Auto-merge (STORY-59, ADR 0034). With a project's `autoMerge` on, a story that is Verified and Proven at the commit it
 * merges, under an active feature, merges into that feature on its own, through the merge Merge makes (story-merge.ts),
 * so by `system` and the same way; Accept gates Done, not the merge. The Dev Lead that started the story is told it
 * merged, as after a `request_merge`.
 *
 * Each project's stories are looked at when it opens, whenever a scan changes which stories could merge (their
 * evidence, status, commit or the project's setting), when a chat of the project changes (a story's session going
 * idle), and when the app's settings are saved (`recheck`). A story whose session is running or waiting is passed over
 * until it is idle, as Merge would refuse it. Stories of one feature merge one at a time, in a line of their own, never
 * inside the card lane (the merge takes it itself). A story is tried once for each commit, checked commit and feature
 * tip it is at. A held story is never picked, and one held while its try waits is refused inside the merge
 * (STORY-61, `HeldRefusal`): a race, not a `StoryRefusal`, so it is only logged.
 *
 * A merge that fails (STORY-60) does what Merge does: on a conflict nothing merges, the story goes back to its first
 * active stage and its session gets the files. A refusal that is the story's own at its commit (`StoryRefusal`: a
 * conflict, work left uncommitted, or its PR) is told to the Dev Lead as a "not merged" notice and recorded on the card
 * with its commit (`not-merged`), and with the feature branch's tip for a conflict. Its card and session show it, and
 * the story isn't tried again while it stands, even after a restart: until its checks settle on another commit, or,
 * for a conflict, the feature branch moves. Any other refusal is a race or a passing failure: it is logged, nothing is
 * told or recorded, and the story is looked at again. Anything else thrown is a bug, and is only logged.
 */
import {
  autoMergedSummary,
  errorMessage,
  evidenceState,
  mergesOnItsOwn,
  notMergedOf,
  notMergedSummary,
  type NotMerged,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import type { ChatManager } from "./chat-manager.ts";
import { locationKey } from "./collect.ts";
import { trace } from "./debug-trace.ts";
import { featureBranchOf } from "./merge-settle.ts";
import { tellLead } from "./merge-request.ts";
import type { TriedAt } from "./not-merged-record.ts";
import { watchProjects } from "./project-watch.ts";
import { sessionBusy, StoryRefusal, type StoryMerge } from "./story-merge.ts";
import { keyOf } from "./story-prs-seen.ts";
import type { Scan } from "./work-scan.ts";
import type { WorkWatches } from "./work-watch.ts";

export interface AutoMergeDeps {
  observe: WorkWatches["observe"];
  allowed: Pick<AllowedProjects, "dirs" | "has" | "onChange">;
  /** Whether the project's stories merge on their own: its `autoMerge`, else the app default (`readAutoMerge`). */
  enabled: (dir: string) => Promise<boolean>;
  merge: StoryMerge["merge"];
  chats: Pick<ChatManager, "storySession" | "list" | "notify" | "watchList">;
  /** Records on story id's card that it didn't merge on its own where it was tried, and why (`recordNotMerged`). */
  record: (dir: string, id: string, tried: TriedAt, reason: string) => Promise<void>;
  log: (message: string) => void;
}

/** A story that would merge on its own were the setting on: what it merges into, and the commits it is at. */
interface Candidate {
  id: string;
  into: string;
  /** Its worktree's HEAD, as the scan read it: the commit Merge merges. */
  head: string | null;
  /** The commit its checks last settled on, as its card records it. */
  checked: string | null;
  /** The tip of the feature branch it merges into, as the scan read it. */
  tip: string | null;
  /** What its card says of the automatic merge that didn't happen, while that stands (STORY-60). */
  refusal: NotMerged | null;
}

/** Whether `story`'s card says it didn't merge on its own where it is now: its commit, and for a conflict its feature's tip. */
const refusedHere = ({ head, tip, refusal }: Candidate) =>
  head !== null && refusal?.head === head && (refusal.tip === undefined || refusal.tip === tip);

/**
 * What auto-merge follows of a project: the stories that could merge, and the setting in effect (the project's own
 * `autoMerge`, else the app default, as the scan's config carries it), which a change to re-checks them.
 */
interface Ready {
  own: boolean;
  stories: Candidate[];
}

/** The stories of `scan` that merge on their own when the setting is on. */
export function readyOf(scan: Scan | null): Ready {
  if (!scan) return { own: false, stories: [] };
  const { config } = scan.collected;
  const cards = scan.resolution.cards;
  const stories = cards.flatMap(({ card }): Candidate[] => {
    if (card.type !== "story") return [];
    const found = ownedIn(scan, card.id);
    const into = featureBranchOf(scan, card);
    if (!found || !into) return [];
    const head = scan.collected.heads.get(locationKey(found.owned.owner)) ?? null;
    const feature = cards.find((c) => c.card.id === card.parent)?.card;
    if (!mergesOnItsOwn(found.owned, config, found.root !== null, true, { head, feature })) return [];
    const tip = scan.collected.git.branches.find((b) => b.name === into)?.head ?? null;
    const refusal = notMergedOf(card);
    return [{ id: card.id, into, head, checked: evidenceState(card).checkedHead, tip, refusal }];
  });
  return { own: config.autoMerge, stories };
}

/** A try of a story at the commits `at`; an attempt runs only while it is still the story's latest. */
interface Try {
  at: string;
}

/** A watched project: its latest pick, and the latest look at it, which an older one gives way to. */
interface Watched {
  dir: string;
  ready: Ready;
  looks: number;
  stopped: boolean;
}

export function createAutoMerge({ observe, allowed, enabled, merge, chats, record, log }: AutoMergeDeps) {
  /** The latest try of each story, by `keyOf(dir, id)`. */
  const tried = new Map<string, Try>();
  /** The tries queued or running, kept while their project is removed, so one added back doesn't try them twice. */
  const pending = new Map<string, Try>();
  /** The last merge queued for each feature branch of each project: the next one waits for it. */
  const lines = new Map<string, Promise<void>>();
  const watched = new Set<Watched>();
  const inFlight = new Set<Promise<unknown>>();
  let closed = false;

  const track = (work: Promise<unknown>) => {
    inFlight.add(work);
    void work.finally(() => inFlight.delete(work));
  };

  /** The Dev Lead chat that started story `id`, read before its merge ends its session. */
  const leadOf = (dir: string, id: string) => {
    const session = chats.storySession(dir, id);
    return chats.list(dir).find((c) => c.id === session)?.story?.parent ?? null;
  };

  /**
   * A merge of `story` that failed. The story's own refusal is told to the Dev Lead `lead` and recorded on the card;
   * any other refusal forgets the try, so the story is looked at again; anything else thrown is a bug, only logged.
   */
  async function failed(dir: string, story: Candidate, lead: string | null, err: unknown, mine: Try) {
    log(`${story.id} didn't merge on its own: ${errorMessage(err)}`);
    if (!(err instanceof StoryRefusal)) {
      const key = keyOf(dir, story.id);
      if (err instanceof ApiError && tried.get(key) === mine) tried.delete(key);
      return;
    }
    const reason = err.reason;
    const summary = notMergedSummary(story.into, reason);
    if (lead) tellLead(chats, log, lead, { story: story.id, outcome: "not merged", summary });
    if (story.head === null) return;
    const conflict = err.kind === "conflict" || err.kind === "conflictUnknown";
    const where = conflict && story.tip !== null ? { head: story.head, tip: story.tip } : { head: story.head };
    await record(dir, story.id, where, reason).catch((e: unknown) =>
      log(`${story.id}'s card couldn't record that it didn't merge on its own: ${errorMessage(e)}`),
    );
  }

  async function attempt(dir: string, story: Candidate, mine: Try) {
    const key = keyOf(dir, story.id);
    const latest = () => !closed && allowed.has(dir) && tried.get(key) === mine;
    try {
      if (!latest()) return;
      trace(`auto-merge attempt ${story.id} at ${mine.at}`);
      const on = await enabled(dir);
      trace(`auto-merge attempt ${story.id} on=${on} latest=${latest()} busy=${sessionBusy(chats, dir, story.id)}`);
      if (!latest()) return;
      // Turned off, or its session started a turn, while it waited: it is tried again once that changes.
      if (!on || sessionBusy(chats, dir, story.id)) {
        tried.delete(key);
        return;
      }
      const lead = leadOf(dir, story.id);
      // As auto-merge's own try: a story held since it was picked is refused inside the merge (`HeldRefusal`), a
      // race that `failed` only logs.
      const merged = await merge(dir, story.id, { auto: true }).catch((err: unknown) => ({ err }));
      trace(`auto-merge merged ${story.id}: ${"err" in merged ? errorMessage(merged.err) : "ok"}`);
      if ("err" in merged) return await failed(dir, story, lead, merged.err, mine);
      const summary = autoMergedSummary(story.into, merged.remains);
      if (lead) tellLead(chats, log, lead, { story: story.id, outcome: "merged", summary });
    } catch (err) {
      log(`${story.id} didn't merge on its own: ${errorMessage(err)}`);
    } finally {
      if (pending.get(key) === mine) pending.delete(key);
    }
  }

  /** Story `story` queued behind the merges of its feature in `dir`. */
  function queue(dir: string, story: Candidate, mine: Try) {
    const line = `${dir}\0${story.into}`;
    const next = (lines.get(line) ?? Promise.resolve())
      .then(() => attempt(dir, story, mine))
      .catch((err: unknown) => log(`${story.id} didn't merge on its own: ${errorMessage(err)}`));
    lines.set(line, next);
    track(
      next.finally(() => {
        if (lines.get(line) === next) lines.delete(line);
      }),
    );
  }

  async function consider(w: Watched) {
    const { dir, ready } = w;
    const look = ++w.looks;
    if (closed || w.stopped) return;
    // A story no longer picked is forgotten, so it is tried again if it comes back at the same commits.
    const picked = new Set(ready.stories.map((s) => keyOf(dir, s.id)));
    for (const key of tried.keys()) if (key.startsWith(keyOf(dir, "")) && !picked.has(key)) tried.delete(key);
    trace(
      `auto-merge consider ${dir} look ${look}: ${JSON.stringify(ready.stories.map((s) => [s.id, s.head, s.checked, s.tip, s.refusal?.head ?? null]))}`,
    );
    if (ready.stories.length === 0) return;
    const on = await enabled(dir);
    trace(`auto-merge consider on=${on} stopped=${w.stopped} latest=${look === w.looks}`);
    // A later look, or the project's removal, has the last word.
    if (!on || w.stopped || look !== w.looks) return;
    for (const story of ready.stories) {
      const key = keyOf(dir, story.id);
      const at = `${story.head ?? ""}|${story.checked ?? ""}|${story.tip ?? ""}`;
      // Tried at these commits already, here or (before a restart) as its card records it.
      if (tried.get(key)?.at === at || refusedHere(story)) {
        trace(`auto-merge ${story.id} tried at ${at} already: ${refusedHere(story)}`);
        continue;
      }
      // Merge refuses a story whose session is working: it is looked at again when the session is idle.
      if (sessionBusy(chats, dir, story.id)) {
        trace(`auto-merge ${story.id} busy`);
        continue;
      }
      const waiting = pending.get(key);
      if (waiting?.at === at) {
        tried.set(key, waiting);
        continue;
      }
      const mine = { at };
      tried.set(key, mine);
      pending.set(key, mine);
      queue(dir, story, mine);
    }
  }

  async function watchProject(dir: string): Promise<() => void> {
    const w: Watched = { dir, ready: { own: false, stories: [] }, looks: 0, stopped: false };
    const look = (ready?: Ready) => {
      if (ready) w.ready = ready;
      track(consider(w));
    };
    const { value, stop } = await observe(dir, readyOf, look);
    // A story's session going idle is a chat change, which no scan sees.
    const list = chats.watchList(dir, () => look());
    watched.add(w);
    // The project opens: its stories are looked at once as they are.
    look(value);
    return () => {
      w.stopped = true;
      watched.delete(w);
      stop();
      list.stop();
      for (const key of tried.keys()) if (key.startsWith(keyOf(dir, ""))) tried.delete(key);
    };
  }

  const projects = watchProjects(allowed, watchProject, log, "Auto-merge");

  return {
    /** Looks at every watched project's stories again: the app default may have changed (app settings saved). */
    recheck() {
      for (const w of watched) track(consider(w));
    },
    /** Waits for the projects still starting and the merges queued or running. */
    async idle() {
      await projects.ready();
      while (inFlight.size) await Promise.all(inFlight);
    },
    close() {
      closed = true;
      projects.close();
    },
  };
}

export type AutoMerge = ReturnType<typeof createAutoMerge>;
