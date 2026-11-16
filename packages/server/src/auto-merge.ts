/**
 * Auto-merge (STORY-59, ADR 0034). With a project's `autoMerge` on, a story that is Verified and Proven merges into its
 * feature on its own, through the merge Merge makes (story-merge.ts), so by `system` and the same way; Accept gates
 * Done, not the merge. The Dev Lead that started the story is told it merged, as after a `request_merge`.
 *
 * Each project's stories are looked at when it opens and whenever a scan changes which stories could merge (their
 * evidence, status, commit or the project's setting). Stories of one feature merge one at a time, in a line of their
 * own, never inside the card lane (the merge takes it itself). A story is tried once for each commit and checked commit
 * it is at: a merge that fails is logged and isn't tried again until one of them changes (STORY-60 handles the rest).
 */
import { autoMergedSummary, evidenceState, mergesOnItsOwn } from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { ownedIn } from "./card-actions.ts";
import type { ChatManager } from "./chat-manager.ts";
import { locationKey } from "./collect.ts";
import { featureBranchOf } from "./merge-settle.ts";
import { tellLead } from "./merge-request.ts";
import { watchProjects } from "./project-watch.ts";
import type { StoryMerge } from "./story-merge.ts";
import { keyOf } from "./story-prs-seen.ts";
import type { Scan } from "./work-scan.ts";
import type { WorkWatches } from "./work-watch.ts";

export interface AutoMergeDeps {
  observe: WorkWatches["observe"];
  allowed: Pick<AllowedProjects, "dirs" | "has" | "onChange">;
  /** Whether the project's stories merge on their own: its `autoMerge`, else the app default (`readAutoMerge`). */
  enabled: (dir: string) => Promise<boolean>;
  merge: StoryMerge["merge"];
  chats: Pick<ChatManager, "storySession" | "list" | "notify">;
  log: (message: string) => void;
}

/** A story that would merge on its own were the setting on: what it merges into, and the commits it is at. */
interface Candidate {
  id: string;
  into: string;
  /** Its worktree's HEAD, as the scan read it. */
  head: string | null;
  /** The commit its checks last settled on, as its card records it. */
  checked: string | null;
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
  const stories = scan.resolution.cards.flatMap(({ card }): Candidate[] => {
    if (card.type !== "story") return [];
    const found = ownedIn(scan, card.id);
    const into = featureBranchOf(scan, card);
    if (!found || !into || !mergesOnItsOwn(found.owned, config, found.root !== null, true)) return [];
    const head = scan.collected.heads.get(locationKey(found.owned.owner)) ?? null;
    return [{ id: card.id, into, head, checked: evidenceState(card).checkedHead }];
  });
  return { own: config.autoMerge, stories };
}

export function createAutoMerge({ observe, allowed, enabled, merge, chats, log }: AutoMergeDeps) {
  /** The commits each story was last tried at, by `keyOf(dir, id)`. */
  const tried = new Map<string, string>();
  /** The last merge queued for each feature branch of each project: the next one waits for it. */
  const lines = new Map<string, Promise<void>>();
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

  async function attempt(dir: string, story: Candidate) {
    if (closed || !allowed.has(dir)) return;
    // The setting may have been turned off while the story waited its turn: it can be tried again once it's on.
    if (!(await enabled(dir))) {
      tried.delete(keyOf(dir, story.id));
      return;
    }
    const lead = leadOf(dir, story.id);
    try {
      const { remains } = await merge(dir, story.id);
      const notice = { story: story.id, outcome: "merged" as const, summary: autoMergedSummary(story.into, remains) };
      if (lead) tellLead(chats, log, lead, notice);
    } catch (err) {
      log(`${story.id} didn't merge on its own: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Story `story` queued behind the merges of its feature in `dir`. */
  function queue(dir: string, story: Candidate) {
    const line = `${dir}\0${story.into}`;
    const next = (lines.get(line) ?? Promise.resolve()).then(() => attempt(dir, story));
    lines.set(line, next);
    track(
      next.finally(() => {
        if (lines.get(line) === next) lines.delete(line);
      }),
    );
  }

  async function consider(dir: string, ready: Ready) {
    if (closed || ready.stories.length === 0 || !(await enabled(dir))) return;
    for (const story of ready.stories) {
      const key = keyOf(dir, story.id);
      const at = `${story.head ?? ""}|${story.checked ?? ""}`;
      if (tried.get(key) === at) continue;
      tried.set(key, at);
      queue(dir, story);
    }
  }

  async function watchProject(dir: string): Promise<() => void> {
    const look = (ready: Ready) => track(consider(dir, ready));
    const { value, stop } = await observe(dir, readyOf, look);
    // The project opens: its stories are looked at once as they are.
    look(value);
    return () => {
      stop();
      for (const key of tried.keys()) if (key.startsWith(keyOf(dir, ""))) tried.delete(key);
    };
  }

  const projects = watchProjects(allowed, watchProject, log, "Auto-merge");

  return {
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
