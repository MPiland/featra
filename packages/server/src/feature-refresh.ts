/**
 * Reading a project's finished features again (STORY-14, STORY-70, ADR 0037): on the PR interval, on focus, and when
 * their branch or the base moves. A finished feature's PR opens when that is on; then whether the base is in its
 * history, whether they conflict, its PR, and its checks at the commit its branch is at are read. A PR merged on GitHub
 * is read first, so a pull of the base afterwards doesn't hide it: at the commit the branch is at here, it settles as
 * Featra's own once the user accepted or approved it (feature-approvals.ts), and its Dev Lead is told what stays to do;
 * else it waits, saying why.
 */
import type { FeatureMergeFacts } from "@featra/work-format";
import type { CheckSettings } from "./check-settings.ts";
import type { FeatureApprovals } from "./feature-approvals.ts";
import type { createFeatureFacts } from "./feature-facts.ts";
import { lookAt, lookAtLanded, type FeatureLook } from "./feature-look.ts";
import type { FeatureMerge } from "./feature-merge.ts";
import type { FeaturePrs } from "./feature-pr.ts";
import { mergedFacts, seenOf } from "./feature-seen.ts";
import type { MergeGit } from "./merge-git.ts";
import type { Scan } from "./work-scan.ts";

export const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

/** The finished features in `scan` the user hasn't accepted yet: those an approval waits on. */
export const waitingIn = (scan: Scan) =>
  new Set(
    seenOf(scan)
      .features.filter((f) => !f.accepted)
      .map((f) => f.id),
  );

export interface FeatureRefreshDeps {
  scan: (dir: string) => Promise<Scan | null>;
  git: MergeGit;
  settings: Pick<CheckSettings, "githubUse">;
  log: (message: string) => void;
  merges: Pick<FeatureMerge, "merged" | "isMerging">;
  prs: Pick<FeaturePrs, "open" | "record" | "readNow" | "noteOf">;
  read: Pick<ReturnType<typeof createFeatureFacts>, "factsOf" | "pushBehind" | "tell">;
  approvals: Pick<FeatureApprovals, "has" | "prune">;
  /** The facts last read, by `keyOf`. */
  facts: Map<string, FeatureMergeFacts>;
  /** Whether GitHub was usable at each project's last read. */
  usable: Map<string, boolean>;
  closed: () => boolean;
  /** Pushes `dir`'s scan to its watchers. */
  push: (dir: string) => Promise<unknown>;
}

export function createFeatureRefresh(deps: FeatureRefreshDeps) {
  const { scan: scanDir, git, settings, log, merges, prs, read, approvals, facts, usable, closed, push } = deps;

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
    if (url === null || closed()) return look;
    await prs.record(dir, look.card.id, url);
    if (closed()) return look;
    return (await lookAt(git, await scanDir(dir), look.card.id)) ?? look;
  }

  /** Keeps `next` as feature `key`'s facts; whether they changed. */
  function keep(key: string, next: FeatureMergeFacts): boolean {
    const same = JSON.stringify(facts.get(key)) === JSON.stringify(next);
    facts.set(key, next);
    return !same;
  }

  /**
   * Feature `look`'s PR merged on GitHub. At the commit its branch is at, it settles once the user accepted or approved
   * it; until they do, it waits for Approve, saying so. At another commit, settling would leave the branch's later
   * commits out of the base, every time: it waits, saying why. Whether what the review screen shows changed.
   */
  async function landed(dir: string, look: FeatureLook, url: string, head: string | null, accepted: boolean) {
    const key = keyOf(dir, look.card.id);
    const atTip = head === look.tip;
    if (atTip && (accepted || (await approvals.has(dir, look.scan, look.card.id)))) {
      await settleOutside(dir, look, url, !accepted);
      facts.delete(key);
      return true;
    }
    return keep(key, mergedFacts(look, atTip));
  }

  /** Reads `dir`'s finished features again; a PR merged outside Featra settles once the user accepted or approved it. */
  return async function refresh(dir: string) {
    const use = (await settings.githubUse(dir)).usable;
    usable.set(dir, use);
    const scan = await scanDir(dir);
    if (!scan || closed()) return;
    await approvals.prune(dir, scan, waitingIn(scan));
    let changed = false;
    for (const { id, accepted } of seenOf(scan).features) {
      const found = await lookAtLanded(git, scan, id);
      if (!found || merges.isMerging(dir, id) || closed()) continue;
      const key = keyOf(dir, id);
      // GitHub's merge first: a pull of the base afterwards puts the branch in its history, and it still settles.
      const pr = use && found.card.pr ? await prs.readNow(dir, id, found.card.pr) : null;
      if (closed()) return;
      if (pr?.status.state === "merged") {
        changed = (await landed(dir, found, pr.url, pr.head, accepted)) || changed;
        continue;
      }
      // Merged already, with its branch still checked out: its cards stay there until it isn't (merge's note).
      if (await git.isAncestor(found.top, found.tip, `refs/heads/${found.base}`)) {
        changed = facts.delete(key) || changed;
        continue;
      }
      const look = use ? await openPr(dir, found) : found;
      if (closed()) return;
      if (use) await read.pushBehind(dir, look);
      changed = keep(key, (await read.factsOf(dir, look, use)).facts) || changed;
    }
    if (changed) await push(dir);
  };
}
