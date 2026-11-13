/**
 * Ending a feature (STORY-14, ADR 0037): Accept, its PR to the base, the facts Merge to main waits on, and the merge.
 * Accept is the user's, once every story and bug under the feature is Done or Cancelled; with "Open feature PRs
 * automatically" on and GitHub usable, it pushes the feature branch and opens (or adopts) its PR first. Each project's
 * accepted features are read again on the PR interval, on focus, and when their branch or the base moves: whether
 * the base is in the feature's history, whether they conflict, its PR, and its checks at the commit its branch is at
 * (CI on the PR, or the check command here). When the base has moved on, the Dev Lead who leads the feature is told
 * once per base commit to merge it in, never rebase. A PR merged on GitHub outside Featra settles as Featra's own when
 * it merged at the commit the branch is at here, and its Dev Lead is told what stays to do; else it waits, saying why.
 */
import {
  acceptedFeature,
  featureAcceptRefusal,
  FEATURE_END_MESSAGES,
  GITHUB_COPY,
  mergeStateOf,
  serializeCard,
  setPr,
  toIso,
  withFeatureAccepted,
  type CardChecks,
  type CardPr,
  type FeatureMergeFacts,
  type FeatureMergeState,
} from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import type { CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { CheckSettings } from "./check-settings.ts";
import { locationKey } from "./collect.ts";
import { createFeatureChecks } from "./feature-checks.ts";
import { createFeatureFacts } from "./feature-facts.ts";
import { lookAt, writeFeature, type FeatureLook } from "./feature-look.ts";
import { createFeatureMerge } from "./feature-merge.ts";
import { createFeaturePrs } from "./feature-pr.ts";
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

/** An accepted feature as the scan has it: what makes its facts worth reading again when it changes. */
interface Seen {
  id: string;
  pr: string | null;
  head: string | null;
}

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

/** The accepted features in `scan`, and the commit the base is at. */
function seenOf(scan: Scan | null): { minutes: number; base: string | null; features: Seen[] } {
  if (!scan) return { minutes: 2, base: null, features: [] };
  const { heads, state, config } = scan.collected;
  const features = scan.resolution.cards.flatMap(({ card }) => {
    const branch = state.features[card.id]?.branch;
    if (!acceptedFeature(card) || !branch) return [];
    return [{ id: card.id, pr: card.pr, head: heads.get(locationKey({ kind: "feature", branch })) ?? null }];
  });
  return { minutes: config.prRefreshMinutes, base: heads.get(locationKey({ kind: "main" })) ?? null, features };
}

/** Why feature `id`, in `scan`, can't be accepted; null when it can. */
function refusal(scan: Scan | null, id: string): string | null {
  if (!scan) return FEATURE_END_MESSAGES.gone;
  const cards = scan.resolution.cards.map((c) => c.card);
  return featureAcceptRefusal(ownedIn(scan, id)?.owned.card, id, cards, scan.collected.config);
}

/** Facts of a feature whose PR merged on GitHub without the commit its branch is at here: it waits, saying so. */
const mergedBehind = (look: FeatureLook): FeatureMergeFacts => ({
  base: look.base,
  branch: look.branch,
  behind: false,
  conflicts: false,
  pr: "merged",
  remoteAhead: false,
  baseBusy: false,
  checks: "pending",
});

export function createFeatureEnd(deps: FeatureEndDeps) {
  const { scan: scanDir, observe, allowed, settings, now, timers, lane, log } = deps;
  const git = createMergeGit(deps.gitCommand, deps.gitRun);
  const facts = new Map<string, FeatureMergeFacts>();
  const seen = new Map<string, ReturnType<typeof seenOf>>();
  const usable = new Map<string, boolean>();
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

  /** Settles feature `id`, whose PR merged on GitHub outside Featra; its Dev Lead is told what stays to do. */
  async function settleOutside(dir: string, look: FeatureLook, url: string) {
    const remains = await merges.merged(dir, look.card.id, url);
    if (remains.length === 0) return;
    for (const note of remains) log(`${look.card.id} merged on GitHub: ${note}`);
    read.tell(dir, look, { outcome: "merged", summary: remains.join(" ") });
  }

  /** Reads `dir`'s accepted features again; a PR merged outside Featra settles. */
  async function refresh(dir: string) {
    const use = (await settings.githubUse(dir)).usable;
    usable.set(dir, use);
    const scan = await scanDir(dir);
    if (!scan || closed) return;
    let changed = false;
    for (const { id } of seenOf(scan).features) {
      const look = await lookAt(git, scan, id);
      if (!look || merges.isMerging(dir, id) || closed) continue;
      const key = keyOf(dir, id);
      // Merged already, with its branch still checked out: its cards stay there until it isn't (merge's note).
      if (await git.isAncestor(look.top, look.tip, `refs/heads/${look.base}`)) {
        changed ||= facts.delete(key);
        continue;
      }
      if (use && look.card.pr) {
        const pr = await prs.readNow(dir, id, look.card.pr);
        if (pr?.status.state === "merged") {
          // Merged at another commit: settling would leave the branch's later commits out of the base, every time.
          if (pr.head === look.tip) await settleOutside(dir, look, pr.url);
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
      const scan = await scanDir(dir);
      const why = refusal(scan, id);
      if (why !== null) throw new ApiError(why);
      const look = await featureOf(dir, id);
      const use = (await settings.githubUse(dir)).usable;
      const url = use && look.config.openFeaturePrs && !look.card.pr ? await prs.open(dir, look) : null;
      await lane.exclusive(async () => {
        const fresh = await lookAt(git, await scanDir(dir), id);
        const again = refusal(fresh?.scan ?? null, id);
        if (again !== null || !fresh) throw new ApiError(again ?? FEATURE_END_MESSAGES.noBranch(id));
        const at = toIso(now());
        const accepted = withFeatureAccepted(fresh.card, "user", at);
        const next = url && !accepted.pr ? setPr(accepted, url, "system", at) : accepted;
        await writeFeature(git, fresh, serializeCard(next), `${id}: accepted`);
      });
      await push(dir);
      if (!closed) void poller.now(dir);
      return null;
    },

    /** The card's Create PR for an accepted feature; refused in local mode or when it has one. */
    async createPr(dir: string, id: string): Promise<null> {
      const use = await settings.githubUse(dir);
      if (!use.usable) throw new ApiError(use.missing ?? GITHUB_COPY.noRemote);
      usable.set(dir, true);
      const look = await featureOf(dir, id);
      if (!acceptedFeature(look.card)) throw new ApiError(FEATURE_END_MESSAGES.notAccepted(id));
      if (look.card.pr) throw new ApiError(FEATURE_PR_REFUSALS.hasPr);
      const url = await prs.open(dir, look);
      await push(dir);
      if (url === null) throw new ApiError(prs.noteOf(dir, id) ?? FEATURE_END_MESSAGES.noPr);
      await prs.record(dir, id, url);
      await push(dir);
      if (!closed) void poller.now(dir);
      return null;
    },

    /** Runs the accepted feature's checks here again, at the commit its branch is at. */
    async rerunChecks(dir: string, id: string): Promise<null> {
      const look = await featureOf(dir, id);
      if (!acceptedFeature(look.card)) throw new ApiError(FEATURE_END_MESSAGES.notAccepted(id));
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

    /** Whether feature `id` can merge now, as last read; undefined before the first read. */
    mergeState(dir: string, id: string): FeatureMergeState | undefined {
      if (merges.isMerging(dir, id)) return { mergeable: false, blocked: FEATURE_END_MESSAGES.merging(id) };
      const known = facts.get(keyOf(dir, id));
      return known ? mergeStateOf(known) : undefined;
    },

    /** What the card pane shows of an accepted feature's PR. */
    prState(dir: string, id: string): CardPr | undefined {
      const feature = seen.get(dir)?.features.find((f) => f.id === id);
      if (!feature) return undefined;
      return prs.state(dir, id, { accepted: true, pr: feature.pr, usable: usable.get(dir) === true });
    },

    /** What the card pane shows of an accepted feature's checks run here. */
    checksFor: (dir: string, id: string): CardChecks | undefined =>
      seen.get(dir)?.features.some((f) => f.id === id) ? checks.checksFor(dir, id) : undefined,

    /** The window regained focus: read every project's accepted features soon. */
    focus: () => poller.focus(),

    /** Reads `dir`'s accepted features now; resolves once read. */
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
