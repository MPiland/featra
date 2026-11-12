/**
 * Story PRs (STORY-11). When a story moves into review and the project opens story PRs automatically, its branch is
 * pushed and its PR opened against the feature branch (an open PR from the branch is adopted instead); the card's
 * Create PR does the same on request. The PR is recorded on the owner copy by `system`. Each project's open PRs are
 * read again on an interval and on focus, and when checks run in CI their verdict is the story's evidence.
 *
 * In local mode (no GitHub remote, or no signed-in `gh`) nothing is pushed or opened, nothing is read, and nothing
 * errors. Only `gh` and `git` run, so none of this costs tokens.
 */
import {
  checksApply,
  checksWhere,
  ciOutcome,
  prContent,
  prIsOpen,
  serializeCard,
  setPr,
  stageCategory,
  toIso,
  type CardPr,
  withPrStatus,
  type PrStatus,
  type WorkList,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { recordEvidence } from "./check-evidence.ts";
import type { CheckSettings } from "./check-settings.ts";
import { createPr, openPrFor, pushStory, readPrAt, PR_NOTES, type GithubPrDeps } from "./github-prs.ts";
import type { Timers } from "./inbox.ts";
import { createPrPoller } from "./pr-poller.ts";
import { watchProjects } from "./project-watch.ts";
import type { Scan } from "./work-scan.ts";
import type { WorkWatches } from "./work-watch.ts";

export interface StoryPrsDeps extends GithubPrDeps {
  scan: (dir: string) => Promise<Scan | null>;
  observe: WorkWatches["observe"];
  allowed: Pick<AllowedProjects, "dirs" | "has" | "onChange">;
  settings: Pick<CheckSettings, "github" | "githubUse">;
  now: () => Date;
  timers: Timers;
  lane?: CardLane;
  log: (message: string) => void;
  focusMs?: number;
}

/** A story as this module follows it. */
interface Followed {
  id: string;
  inReview: boolean;
  pr: string | null;
  /** Its owner copy is its own worktree, where the branch is pushed from. */
  worktree: boolean;
}

interface ProjectSeen {
  auto: boolean;
  minutes: number;
  stories: Followed[];
}

export const PR_REFUSALS = {
  notReady: "Only a story in review, in its own worktree, can open a PR.",
  hasPr: "This story already has a PR.",
} as const;

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

function seenOf(scan: Scan | null): ProjectSeen {
  if (!scan) return { auto: false, minutes: 2, stories: [] };
  const { config } = scan.collected;
  const stories = scan.resolution.cards.flatMap(({ card, owner }): Followed[] =>
    card.type === "story"
      ? [{ id: card.id, inReview: checksApply(card, config), pr: card.pr, worktree: owner.kind === "worktree" }]
      : [],
  );
  return { auto: config.openStoryPrs, minutes: config.prRefreshMinutes, stories };
}

export function createStoryPrs(deps: StoryPrsDeps) {
  const { scan: scanDir, observe, allowed, settings, now, timers, log, lane = createCardLane() } = deps;
  /** The PR last read for each story, with the URL it was read from (a changed `pr` field makes it stale). */
  const read = new Map<string, { url: string; status: PrStatus }>();
  const notes = new Map<string, string>();
  const opening = new Set<string>();
  const inFlight = new Set<Promise<unknown>>();
  const seen = new Map<string, ProjectSeen>();
  const usable = new Map<string, boolean>();
  let closed = false;

  const refreshUse = async (dir: string) => {
    const use = (await settings.githubUse(dir)).usable;
    usable.set(dir, use);
    return use;
  };
  const push = (dir: string) => (closed ? Promise.resolve(null) : scanDir(dir).catch(() => null));

  const recordPr = (dir: string, id: string, url: string) =>
    lane.exclusive(async () => {
      const found = ownedIn(await scanDir(dir), id);
      if (!found?.root) return;
      const next = setPr(found.owned.card, url, "system", toIso(now()));
      if (next !== found.owned.card) await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(next));
    });

  /** Pushes and opens (or adopts) story `id`'s PR; null once it has one, else why not. */
  async function openNow(dir: string, id: string): Promise<string | null> {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    if (!scan || !found?.root || found.owned.owner.kind !== "worktree") return PR_REFUSALS.notReady;
    const { card } = found.owned;
    if (!checksApply(card, scan.collected.config)) return PR_REFUSALS.notReady;
    if (card.pr) return null;
    const base = (card.parent && scan.collected.state.features[card.parent]?.branch) || scan.collected.git.baseBranch;
    if (!card.branch) return PR_NOTES.branch;
    const pushed = await pushStory(found.root, base, card.branch, deps);
    if (pushed !== null) return pushed;
    const pr =
      (await openPrFor(dir, card.branch, deps)) ??
      (await createPr(dir, { base, head: card.branch, ...prContent(card) }, deps));
    if (typeof pr === "string") return pr;
    read.set(keyOf(dir, id), { url: pr.url, status: pr.status });
    await recordPr(dir, id, pr.url);
    return null;
  }

  /** Opens story `id`'s PR, showing Opening meanwhile and the reason on the card when it can't. */
  function open(dir: string, id: string): Promise<string | null> {
    if (opening.has(keyOf(dir, id))) return Promise.resolve(null);
    const done = openShown(dir, id);
    inFlight.add(done);
    void done.finally(() => inFlight.delete(done));
    return done;
  }

  async function openShown(dir: string, id: string): Promise<string | null> {
    const key = keyOf(dir, id);
    opening.add(key);
    notes.delete(key);
    await push(dir);
    let note: string | null;
    try {
      note = await openNow(dir, id);
    } catch (err) {
      note = `${PR_NOTES.open}: ${err instanceof Error ? err.message : String(err)}`;
    }
    opening.delete(key);
    if (note !== null) notes.set(key, note);
    await push(dir);
    // A new PR's checks are read soon, not after the full interval.
    if (note === null && !closed) void poller.now(dir);
    return note;
  }

  /** Reads `dir`'s open PRs of stories not yet done; their checks are the evidence when checks run in CI. */
  async function refresh(dir: string) {
    if (!(await refreshUse(dir))) return;
    const scan = await scanDir(dir);
    if (!scan || closed) return;
    const { config } = scan.collected;
    const ci = checksWhere(config, await settings.github(dir)) === "ci";
    let changed = false;
    for (const { card } of scan.resolution.cards) {
      const category = stageCategory(card.status, config);
      if (card.type !== "story" || !card.pr || category === "done" || category === null) continue;
      const key = keyOf(dir, card.id);
      const last = read.get(key);
      if (last?.url === card.pr && !prIsOpen(last.status)) continue;
      const pr = await readPrAt(dir, card.pr, deps);
      if (!pr || closed) continue;
      changed ||= JSON.stringify(last?.status) !== JSON.stringify(pr.status) || last?.url !== card.pr;
      read.set(key, { url: card.pr, status: pr.status });
      if (ci) await recordEvidence({ scan: scanDir, lane, now }, dir, card.id, ciOutcome(pr.status.checks));
    }
    if (changed) await push(dir);
  }

  const poller = createPrPoller({
    timers,
    refresh,
    minutes: (dir) => seen.get(dir)?.minutes ?? 2,
    log,
    focusMs: deps.focusMs,
  });

  async function watchProject(dir: string): Promise<() => void> {
    await refreshUse(dir);
    if (closed) return () => {};
    let baseline = true;
    const consider = (next: ProjectSeen) => {
      const before = seen.get(dir);
      seen.set(dir, next);
      if (before && before.minutes !== next.minutes) poller.reschedule(dir);
      for (const story of next.stories) {
        const key = keyOf(dir, story.id);
        if (!story.inReview) notes.delete(key);
        const was = before?.stories.find((s) => s.id === story.id);
        // Only a move into review opens a PR; the stories already in review when Featra starts are left alone.
        if (baseline || !was || was.inReview || !story.inReview || story.pr || !next.auto) continue;
        if (usable.get(dir)) void open(dir, story.id);
      }
    };
    const { value, stop } = await observe(dir, (scan) => seenOf(scan), consider);
    consider(value);
    baseline = false;
    const stopPolling = poller.start(dir);
    return () => {
      stop();
      stopPolling();
      seen.delete(dir);
    };
  }

  const projects = watchProjects(allowed, watchProject, log, "PRs");

  return {
    /** What the card pane shows of story `id`'s PR: its state, Create PR, Opening, or why it couldn't open. */
    prState(dir: string, id: string): CardPr | undefined {
      const story = seen.get(dir)?.stories.find((s) => s.id === id);
      if (!story) return undefined;
      const key = keyOf(dir, id);
      const last = read.get(key);
      const status = story.pr && last?.url === story.pr ? last.status : null;
      const isOpening = opening.has(key);
      const create = usable.get(dir) === true && story.inReview && !story.pr && story.worktree && !isOpening;
      const note = notes.get(key) ?? null;
      if (!status && !create && !isOpening && !note) return undefined;
      return { status, create, opening: isOpening, note };
    },

    /** The Work list with each story's PR state as last read. */
    decorate: (dir: string, list: WorkList): WorkList =>
      withPrStatus(list, (id, pr) => {
        const last = read.get(keyOf(dir, id));
        return last?.url === pr ? last.status : undefined;
      }),

    /** The card's Create PR: refused in local mode, outside review, or when it has one; a failure shows on the card. */
    async createPr(dir: string, id: string): Promise<null> {
      const use = await settings.githubUse(dir);
      if (!use.usable) throw new ApiError(use.missing ?? PR_REFUSALS.notReady);
      usable.set(dir, true);
      const scan = await scanDir(dir);
      const found = ownedIn(scan, id);
      if (found?.owned.card.pr) throw new ApiError(PR_REFUSALS.hasPr);
      if (!scan || !found?.root || found.owned.owner.kind !== "worktree") throw new ApiError(PR_REFUSALS.notReady);
      if (!checksApply(found.owned.card, scan.collected.config)) throw new ApiError(PR_REFUSALS.notReady);
      const note = await open(dir, id);
      if (note !== null) throw new ApiError(note);
      return null;
    },

    /** The window regained focus: read every project's open PRs soon. */
    focus: () => poller.focus(),

    /** Reads `dir`'s PRs now; resolves once read. */
    refresh: (dir: string) => poller.now(dir),

    /** Waits for PR opens and reads in flight. */
    async idle() {
      await projects.ready();
      while (inFlight.size) await Promise.all(inFlight);
      await poller.idle();
    },

    close() {
      closed = true;
      projects.close();
      poller.close();
    },
  };
}

export type StoryPrs = ReturnType<typeof createStoryPrs>;
