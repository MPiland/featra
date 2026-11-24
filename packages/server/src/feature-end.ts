/**
 * Ending a feature (STORY-14, STORY-70, ADR 0037): Approve (Accept and Merge to main in one click), its PR to the base,
 * the facts the merge waits on, and the merge. A feature is finished once every story and bug under it is Done or
 * Cancelled; with "Open feature PRs automatically" on and GitHub usable, its PR then opens (or is adopted), so its CI
 * runs before the user approves. Each project's finished features are read again on the PR interval, on focus, and when
 * their branch or the base moves (feature-refresh.ts). A PR merged on GitHub at the commit the branch is at here settles
 * as Featra's own once the user accepted or approved it (feature-approvals.ts), and its Dev Lead is told what stays to
 * do; else it waits, saying why.
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
import { createFeatureApprovals } from "./feature-approvals.ts";
import { createFeatureChecks } from "./feature-checks.ts";
import { createFeatureFacts } from "./feature-facts.ts";
import { lookAt, type FeatureLook } from "./feature-look.ts";
import { createFeatureMerge } from "./feature-merge.ts";
import { createFeaturePrs } from "./feature-pr.ts";
import { createFeatureRefresh, keyOf, waitingIn } from "./feature-refresh.ts";
import { seenOf, unfinished } from "./feature-seen.ts";
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

export function createFeatureEnd(deps: FeatureEndDeps) {
  const { scan: scanDir, observe, allowed, settings, now, timers, log } = deps;
  const git = createMergeGit(deps.gitCommand, deps.gitRun);
  const facts = new Map<string, FeatureMergeFacts>();
  const seen = new Map<string, ReturnType<typeof seenOf>>();
  const usable = new Map<string, boolean>();
  /** The user's Approves not on their feature's branch yet: a PR merged on GitHub settles with them, after a restart too. */
  const approvals = createFeatureApprovals(log);
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
    merges,
    approving: (dir, scan, id) => approvals.add(dir, scan, id),
  });

  const refresh = createFeatureRefresh({
    ...deps,
    git,
    merges,
    prs,
    read,
    approvals,
    facts,
    usable,
    closed: () => closed,
    push,
  });
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
      approvals.forget(dir);
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
    /**
     * The review screen's Approve (STORY-70): Accept and Merge to main in one click, once nothing stops either; what
     * stays to do. When the merge fails, the Accept stands and why is thrown: Merge to main is then the retry.
     */
    async approve(dir: string, id: string): Promise<{ remains: string[] }> {
      try {
        return await accepts.approve(dir, id);
      } finally {
        facts.delete(keyOf(dir, id));
        const scan = await push(dir);
        // Settled, or its Accept recorded on the branch: the approval isn't needed any more.
        if (scan) await approvals.prune(dir, scan, waitingIn(scan));
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
      const recorded = await prs.record(dir, id, url);
      await push(dir);
      // The PR opened, but the feature's branch couldn't be read to record it: a later read adopts it.
      if (!recorded) throw new ApiError(FEATURE_END_MESSAGES.noBranch(id));
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
