/**
 * Ending a feature (STORY-14, STORY-70, ADR 0037): Approve (Accept and Merge to main in one click), Accept, its PR to
 * the base, the facts the merge waits on, and the merge. A feature is finished once every story and bug under it is
 * Done or Cancelled; with "Open feature PRs automatically" on and GitHub usable, its PR then opens (or is adopted), so
 * its CI runs before the user approves. Each project's finished features are read again on the PR interval, on focus,
 * and when their branch or the base moves: whether the base is in the feature's history, whether they conflict, its
 * PR, and its checks at the commit its branch is at (CI on the PR, or the check command here). When the base has moved
 * on, the Dev Lead who leads the feature is told once per base commit to merge it in, never rebase. A PR merged on
 * GitHub outside Featra settles as Featra's own when the user accepted it and it merged at the commit the branch is at
 * here, and its Dev Lead is told what stays to do; else it waits, saying why.
 */
import {
  FEATURE_END_MESSAGES,
  GITHUB_COPY,
  mergeStateOf,
  type CardChecks,
  type CardPr,
  type FeatureMergeFacts,
  type FeatureMergeState,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { ApiError } from "./api-error.ts";
import type { CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { CheckSettings } from "./check-settings.ts";
import { createFeatureAccept } from "./feature-accept.ts";
import { createFeatureChecks } from "./feature-checks.ts";
import { createFeatureFacts } from "./feature-facts.ts";
import { lookAt, type FeatureLook } from "./feature-look.ts";
import { createFeatureMerge } from "./feature-merge.ts";
import { createFeaturePrs } from "./feature-pr.ts";
import { mergedBehind, seenOf, unfinished } from "./feature-seen.ts";
import type { GithubPrDeps } from "./github-prs.ts";
import type { Timers } from "./inbox.ts";
import { createMergeGit } from "./merge-git.ts";
import { createPrPoller } from "./pr-poller.ts";
import { watchProjects } from "./project-watch.ts";
import type { Scan } from "./work-scan.ts";
import type { WorkWatches } from "./work-watch.ts";
import type { runGit } from "./git-run.ts";

export interface FeatureEndDeps extends GithubPrDeps {
  scan: (dir: string) => Promise<Scan | null>;
  observe: WorkWatches["observe"];
  allowed: Pick<AllowedProjects, "dirs" | "has" | "onChange">;
  settings: Pick<CheckSettings, "github" | "githubUse" | "confirmed">;
  chats: Pick<ChatManager, "notify" | "list">;
  now: () => Date;
  timers: Timers;
  lane: CardLane;
  log: (message: string) => void;
  focusMs?: number;
  checkTimeoutMs?: number;
  gitRun?: typeof runGit;
}

export const FEATURE_PR_REFUSALS = { hasPr: "This feature already has a PR." } as const;

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

export function createFeatureEnd(deps: FeatureEndDeps) {
  const { scan: scanDir, observe, allowed, settings, now, timers, log } = deps;
  const git = createMergeGit(deps.gitCommand, deps.gitRun);
  const facts = new Map<string, FeatureMergeFacts>();
  const seen = new Map<string, ReturnType<typeof seenOf>>();
  const usable = new Map<string, boolean>();
  /** The features approved here whose PR merged on GitHub: they settle with the user's Accept if settling failed. */
  const approved = new Set<string>();
  let closed = false;

  const push = (dir: string) => (closed ? Promise.resolve(null) : scanDir(dir).catch(() => null));
  const checks = createFeatureChecks({
    git,
    settings,
    now,
    log,
    timeoutMs: deps.checkTimeoutMs,
    changed: (dir) => {
      void push(dir);
      if (!closed) void poller.now(dir);
    },
  });
  const prs = createFeaturePrs({ ...deps, git });
  const read = createFeatureFacts({ ...deps, git, checks, prs });
  const merges = createFeatureMerge({
    ...deps,
    git,
    prs,
    github: async (dir) => (await settings.githubUse(dir)).usable,
    check: async (dir, look) => read.factsOf(dir, look, (await settings.githubUse(dir)).usable),
  });
  const accepts = createFeatureAccept({
    ...deps,
    git,
    prs,
    merges,
    approving: (dir, id) => approved.add(keyOf(dir, id)),
  });

  /** Settles feature `id`, whose PR merged on GitHub outside Featra; its Dev Lead is told what stays to do. */
  async function settleOutside(dir: string, look: FeatureLook, url: string, approve: boolean) {
    const remains = await merges.merged(dir, look.card.id, url, approve);
    if (remains.length === 0) return;
    for (const note of remains) log(`${look.card.id} merged on GitHub: ${note}`);
    read.tell(dir, look, { outcome: "merged", summary: remains.join(" ") });
  }

  /** Opens the PR of a finished feature that has none, when that is on: its CI runs before Approve (STORY-70). */
  async function openPr(dir: string, look: FeatureLook): Promise<FeatureLook> {
    if (look.card.pr || !look.config.openFeaturePrs || prs.noteOf(dir, look.card.id) !== null) return look;
    const url = await prs.open(dir, look);
    // Closed meanwhile: nothing more is read or written (a scan now would open the project's index again).
    if (url === null || closed) return look;
    await prs.record(dir, look.card.id, url);
    if (closed) return look;
    return (await lookAt(git, await scanDir(dir), look.card.id)) ?? look;
  }

  /** Reads `dir`'s finished features again; a PR merged outside Featra settles once the user accepted it. */
  async function refresh(dir: string) {
    const use = (await settings.githubUse(dir)).usable;
    usable.set(dir, use);
    const scan = await scanDir(dir);
    if (!scan || closed) return;
    let changed = false;
    for (const { id, accepted } of seenOf(scan).features) {
      const found = await lookAt(git, scan, id);
      if (!found || merges.isMerging(dir, id) || closed) continue;
      const key = keyOf(dir, id);
      // Merged already, with its branch still checked out: its cards stay there until it isn't (merge's note).
      if (await git.isAncestor(found.top, found.tip, `refs/heads/${found.base}`)) {
        changed ||= facts.delete(key);
        continue;
      }
      const look = use ? await openPr(dir, found) : found;
      if (closed) return;
      if (use && look.card.pr) {
        const pr = await prs.readNow(dir, id, look.card.pr);
        if (pr?.status.state === "merged") {
          const approve = !accepted && approved.has(key);
          // Merged on GitHub before the user accepted it: Featra doesn't settle what the user hasn't approved.
          if (!accepted && !approve) facts.delete(key);
          // Merged at another commit: settling would leave the branch's later commits out of the base, every time.
          else if (pr.head === look.tip) await settleOutside(dir, look, pr.url, approve);
          else facts.set(key, mergedBehind(look));
          changed = true;
          continue;
        }
      }
      if (use) await read.pushBehind(dir, look);
      const next = (await read.factsOf(dir, look, use)).facts;
      changed ||= JSON.stringify(facts.get(key)) !== JSON.stringify(next);
      facts.set(key, next);
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
    const { value, stop } = await observe(
      dir,
      (scan) => seenOf(scan),
      (next) => {
        const before = seen.get(dir);
        seen.set(dir, next);
        if (before && before.minutes !== next.minutes) poller.reschedule(dir);
        if (!closed) void poller.now(dir);
      },
    );
    seen.set(dir, value);
    const stopPolling = poller.start(dir);
    return () => {
      stop();
      stopPolling();
      seen.delete(dir);
      usable.delete(dir);
      prs.forget(dir);
      read.forget(dir);
      for (const key of facts.keys()) if (key.startsWith(keyOf(dir, ""))) facts.delete(key);
    };
  }

  const projects = watchProjects(allowed, watchProject, log, "Features");

  /** Feature `id` in progress with its branch, read fresh; throws why not. */
  async function featureOf(dir: string, id: string): Promise<FeatureLook> {
    const look = await lookAt(git, await scanDir(dir), id);
    if (!look) throw new ApiError(FEATURE_END_MESSAGES.noBranch(id));
    return look;
  }

  return {
    /** The user's Accept: the feature's PR opens first when that is on, then Accept is recorded with it. */
    async accept(dir: string, id: string): Promise<null> {
      await accepts.accept(dir, id);
      await push(dir);
      if (!closed) void poller.now(dir);
      return null;
    },

    /**
     * The review screen's Approve (STORY-70): Accept and Merge to main in one click, once nothing stops either; what
     * stays to do. When the merge fails, the Accept stands and why is thrown: Merge to main is then the retry.
     */
    async approve(dir: string, id: string): Promise<{ remains: string[] }> {
      try {
        return await accepts.approve(dir, id);
      } finally {
        facts.delete(keyOf(dir, id));
        await push(dir);
        if (!closed) void poller.now(dir);
      }
    },

    /** Create PR for a finished feature; refused in local mode, before it is finished, or when it has one. */
    async createPr(dir: string, id: string): Promise<null> {
      const use = await settings.githubUse(dir);
      if (!use.usable) throw new ApiError(use.missing ?? GITHUB_COPY.noRemote);
      usable.set(dir, true);
      const look = await featureOf(dir, id);
      const why = unfinished(look);
      if (why !== null) throw new ApiError(why);
      if (look.card.pr) throw new ApiError(FEATURE_PR_REFUSALS.hasPr);
      const url = await prs.open(dir, look);
      await push(dir);
      if (url === null) throw new ApiError(prs.noteOf(dir, id) ?? FEATURE_END_MESSAGES.noPr);
      await prs.record(dir, id, url);
      await push(dir);
      if (!closed) void poller.now(dir);
      return null;
    },

    /** Runs the finished feature's checks here again, at the commit its branch is at. */
    async rerunChecks(dir: string, id: string): Promise<null> {
      const look = await featureOf(dir, id);
      const why = unfinished(look);
      if (why !== null) throw new ApiError(why);
      void checks.request(dir, id, look.top, look.tip, look.config, true);
      return null;
    },

    /** Merge to main, by the user's click; what stays to do. */
    async merge(dir: string, id: string): Promise<{ remains: string[] }> {
      try {
        return await merges.merge(dir, id);
      } finally {
        facts.delete(keyOf(dir, id));
        await push(dir);
        if (!closed) void poller.now(dir);
      }
    },

    /** Whether finished feature `id` can merge now, as last read; undefined before the first read. */
    mergeState(dir: string, id: string): FeatureMergeState | undefined {
      if (merges.isMerging(dir, id)) return { mergeable: false, blocked: FEATURE_END_MESSAGES.merging(id) };
      const known = facts.get(keyOf(dir, id));
      return known ? mergeStateOf(known) : undefined;
    },

    /** What the card pane shows of a finished feature's PR. */
    prState(dir: string, id: string): CardPr | undefined {
      const feature = seen.get(dir)?.features.find((f) => f.id === id);
      if (!feature) return undefined;
      return prs.state(dir, id, { finished: true, pr: feature.pr, usable: usable.get(dir) === true });
    },

    /** What the card pane shows of a finished feature's checks run here. */
    checksFor: (dir: string, id: string): CardChecks | undefined =>
      seen.get(dir)?.features.some((f) => f.id === id) ? checks.checksFor(dir, id) : undefined,

    /** The window regained focus: read every project's finished features soon. */
    focus: () => poller.focus(),

    /** Reads `dir`'s finished features now; resolves once read. */
    refresh: (dir: string) => poller.now(dir),

    /** Waits for the watches, reads and check runs in flight. */
    async idle() {
      await projects.ready();
      await poller.idle();
      await checks.idle();
      await poller.idle();
    },

    close() {
      closed = true;
      projects.close();
      poller.close();
      checks.close();
    },
  };
}

export type FeatureEnd = ReturnType<typeof createFeatureEnd>;
