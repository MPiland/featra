/**
 * What each story of a feature changed, from git (STORY-69): files and lines, for the review screen. A story still on
 * its own branch is that branch against the feature's (`feature...story`); a merged one is its merge into the feature
 * branch (`first...second` parent); the feature is its branch against the base. Read in the background, once per
 * set of branch tips, so the screen's watch stays synchronous; when a read finishes, `changed` re-pushes the watch.
 */
import {
  isMerged,
  MERGE_LOG_FORMAT,
  parseNumstat,
  safeBranch,
  storyMergeIn,
  type Card,
  type DiffStat,
} from "@featra/work-format";
import { locationKey } from "./collect.ts";
import { githubRemote } from "./github-detect.ts";
import { runGit } from "./git-run.ts";
import type { Scan } from "./work-scan.ts";

export interface ReviewDiffsDeps {
  /** A read finished with something new: the project's watches are pushed again. */
  changed: (dir: string) => void;
  log: (message: string) => void;
  gitCommand?: string;
  gitRun?: typeof runGit;
}

interface Item {
  card: Card;
  /** Its branch while it isn't merged; null once it is. */
  branch: string | null;
}

interface Plan {
  key: string;
  top: string;
  base: string;
  branch: string;
  items: Item[];
}

/** The feature `id` in `scan` and what its review diffs; null when it has no branch of its own. */
function planOf(scan: Scan, id: string): Plan | null {
  const { state, heads, paths, git } = scan.collected;
  const branch = state.features[id]?.branch;
  if (!branch || !safeBranch(branch) || !safeBranch(git.baseBranch)) return null;
  const tip = (loc: Parameters<typeof locationKey>[0]) => heads.get(locationKey(loc)) ?? "";
  const items = scan.resolution.cards
    .map((c) => c.card)
    .filter((c) => c.parent === id && (c.type === "story" || c.type === "bug"))
    .map((card): Item => {
      const wt = state.worktrees[card.id];
      return { card, branch: isMerged(card) ? null : wt && !wt.merged ? wt.branch : card.branch };
    });
  const parts = items.map(({ card, branch: b }) => {
    const wt = state.worktrees[card.id];
    return `${card.id}:${b ?? "merged"}:${wt ? tip({ kind: "worktree", ...wt }) : ""}`;
  });
  const key = [tip({ kind: "feature", branch }), tip({ kind: "main" }), ...parts].join("|");
  return { key, top: paths.top, base: git.baseBranch, branch, items };
}

export function createReviewDiffs({ changed, log, gitCommand = "git", gitRun = runGit }: ReviewDiffsDeps) {
  const read = new Map<string, { key: string; stats: Map<string, DiffStat | null> }>();
  const running = new Map<string, Promise<void>>();
  const repos = new Map<string, string | null>();
  let closed = false;

  const numstat = async (top: string, range: string): Promise<DiffStat | null> => {
    const r = await gitRun(gitCommand, top, ["diff", "--numstat", "--no-renames", range]);
    return r.code === 0 ? parseNumstat(r.stdout) : null;
  };

  async function readPlan(plan: Plan): Promise<Map<string, DiffStat | null>> {
    const feature = `refs/heads/${plan.branch}`;
    const stats = new Map<string, DiffStat | null>();
    const merges = plan.items.some((i) => i.branch === null)
      ? await gitRun(gitCommand, plan.top, [
          "log",
          "--first-parent",
          "--merges",
          `--format=${MERGE_LOG_FORMAT}`,
          feature,
        ])
      : null;
    for (const { card, branch } of plan.items) {
      if (branch !== null) {
        stats.set(card.id, safeBranch(branch) ? await numstat(plan.top, `${feature}...refs/heads/${branch}`) : null);
        continue;
      }
      const parents = merges?.code === 0 ? storyMergeIn(merges.stdout, card) : null;
      stats.set(card.id, parents ? await numstat(plan.top, `${parents[0]}...${parents[1]}`) : null);
    }
    stats.set("", await numstat(plan.top, `refs/heads/${plan.base}...${feature}`));
    return stats;
  }

  function start(dir: string, id: string, plan: Plan) {
    const slot = `${dir}\0${id}`;
    if (running.has(slot)) return;
    const job = readPlan(plan)
      .then((stats) => {
        read.set(slot, { key: plan.key, stats });
        if (!closed) changed(dir);
      })
      .catch((err: unknown) =>
        log(`Couldn't read what ${id} changed: ${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => running.delete(slot));
    running.set(slot, job);
  }

  return {
    /**
     * What each story and bug of feature `id` changed, and the feature itself (by its own id), as last read; null
     * while unknown. A scan with branch tips not read yet starts a read.
     */
    of(dir: string, scan: Scan | null, id: string): (item: string) => DiffStat | null {
      const plan = scan ? planOf(scan, id) : null;
      const known = read.get(`${dir}\0${id}`);
      if (plan && known?.key !== plan.key && !closed) start(dir, id, plan);
      return (item) => known?.stats.get(item === id ? "" : item) ?? null;
    },

    /** The project's GitHub repository (`owner/name`), once read; null before that and without one. */
    repo(dir: string): string | null {
      if (!repos.has(dir) && !closed) {
        repos.set(dir, null);
        void githubRemote(dir, gitCommand).then((remote) => {
          if (!remote || closed) return;
          repos.set(dir, remote.repo);
          changed(dir);
        });
      }
      return repos.get(dir) ?? null;
    },

    /** Waits for the reads in flight. */
    async idle() {
      while (running.size > 0) await Promise.all(running.values());
    },

    close() {
      closed = true;
    },
  };
}

export type ReviewDiffs = ReturnType<typeof createReviewDiffs>;
