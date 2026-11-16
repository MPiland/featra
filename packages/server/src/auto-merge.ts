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
 * inside the card lane (the merge takes it itself). A story is tried once for each commit and checked commit it is at:
 * a merge that fails is logged and isn't tried again until one of them changes.
 *
 * A merge that fails (STORY-60) does what Merge does: on a conflict nothing merges, the story goes back to its first
 * active stage and its session gets the files. Any failure, conflict or not, is told to the Dev Lead as a "not merged"
 * notice and recorded on the card with its commit (`not-merged`), which its card and session show, so the story isn't
 * tried again at that commit, even after a restart, until its checks settle on another.
 */
import {
  autoMergedSummary,
  errorMessage,
  evidenceState,
  MERGE_MESSAGES,
  mergesOnItsOwn,
  notMergedOf,
  notMergedSummary,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { ownedIn } from "./card-actions.ts";
import type { ChatManager } from "./chat-manager.ts";
import { locationKey } from "./collect.ts";
import { featureBranchOf } from "./merge-settle.ts";
import { tellLead } from "./merge-request.ts";
import { watchProjects } from "./project-watch.ts";
import { sessionBusy, type StoryMerge } from "./story-merge.ts";
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
  /** Records on story id's card that it didn't merge on its own at head, and why (`recordNotMerged`). */
  record: (dir: string, id: string, head: string, reason: string) => Promise<void>;
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
  /** The commit its card says it didn't merge on its own at, while that stands (STORY-60). */
  refused: string | null;
}

/** What auto-merge follows of a project: the stories that could merge, and the project's own setting, which a change to
 * re-checks them. */
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
    const refused = notMergedOf(card)?.head ?? null;
    return [{ id: card.id, into, head, checked: evidenceState(card).checkedHead, refused }];
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

/** A refusal that isn't the story's: its session started a turn, or a Merge of it runs. It is looked at again later. */
const passedOver = (id: string, reason: string) =>
  reason === MERGE_MESSAGES.working(id) || reason === MERGE_MESSAGES.merging(id);

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

  /** A merge of `story` that failed: told to the Dev Lead `lead` and recorded on the card, unless it wasn't the story's. */
  async function refused(dir: string, story: Candidate, lead: string | null, reason: string, mine: Try) {
    const key = keyOf(dir, story.id);
    if (passedOver(story.id, reason)) {
      if (tried.get(key) === mine) tried.delete(key);
      return;
    }
    log(`${story.id} didn't merge on its own: ${reason}`);
    const summary = notMergedSummary(story.into, reason);
    if (lead) tellLead(chats, log, lead, { story: story.id, outcome: "not merged", summary });
    if (story.head === null) return;
    await record(dir, story.id, story.head, reason).catch((err: unknown) =>
      log(`${story.id}'s card couldn't record that it didn't merge on its own: ${errorMessage(err)}`),
    );
  }

  async function attempt(dir: string, story: Candidate, mine: Try) {
    const key = keyOf(dir, story.id);
    const latest = () => !closed && allowed.has(dir) && tried.get(key) === mine;
    try {
      if (!latest()) return;
      const on = await enabled(dir);
      if (!latest()) return;
      // Turned off, or its session started a turn, while it waited: it is tried again once that changes.
      if (!on || sessionBusy(chats, dir, story.id)) {
        tried.delete(key);
        return;
      }
      const lead = leadOf(dir, story.id);
      const merged = await merge(dir, story.id).catch((err: unknown) => errorMessage(err));
      if (typeof merged === "string") return await refused(dir, story, lead, merged, mine);
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
    if (ready.stories.length === 0) return;
    const on = await enabled(dir);
    // A later look, or the project's removal, has the last word.
    if (!on || w.stopped || look !== w.looks) return;
    for (const story of ready.stories) {
      const key = keyOf(dir, story.id);
      const at = `${story.head ?? ""}|${story.checked ?? ""}`;
      // Tried at these commits already, here or (before a restart) as its card records it.
      if (tried.get(key)?.at === at || (story.head !== null && story.refused === story.head)) continue;
      // Merge refuses a story whose session is working: it is looked at again when the session is idle.
      if (sessionBusy(chats, dir, story.id)) continue;
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
