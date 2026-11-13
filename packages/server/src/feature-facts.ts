/**
 * What Merge to main waits on (STORY-14, ADR 0037), read fresh for an accepted feature: whether the base's tip (as
 * GitHub has it, when it is usable) is in the feature branch's history, whether they conflict, its PR, whether GitHub's
 * copy of the branch has commits this computer doesn't, and its checks at the commit its branch is at: CI on its PR,
 * or the check command run here. A branch GitHub is behind on is pushed, never forced. When the base has moved on, the
 * Dev Lead leading the feature is told once per base commit to merge it in with a merge commit, never a rebase.
 */
import { behindMessage, checksWhere, draftedBy, type FeatureChecks, type FeatureMergeFacts } from "@featra/work-format";
import type { ChatManager } from "./chat-manager.ts";
import type { CheckSettings } from "./check-settings.ts";
import type { FeatureChecksRunner } from "./feature-checks.ts";
import type { FeatureLook } from "./feature-look.ts";
import type { FeaturePrs } from "./feature-pr.ts";
import { githubRemote } from "./github-detect.ts";
import type { FoundPr, GithubPrDeps } from "./github-prs.ts";
import type { MergeGit } from "./merge-git.ts";
import { ciRead } from "./pr-ci.ts";

export interface FeatureFactsDeps extends GithubPrDeps {
  git: MergeGit;
  settings: Pick<CheckSettings, "github">;
  chats: Pick<ChatManager, "notify" | "list">;
  checks: Pick<FeatureChecksRunner, "verdict" | "request">;
  prs: Pick<FeaturePrs, "readNow">;
  log: (message: string) => void;
}

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

export function createFeatureFacts(deps: FeatureFactsDeps) {
  const { git, settings, chats, checks, prs, log } = deps;
  /** The base commit each feature's Dev Lead was last told about. */
  const told = new Map<string, string>();

  /** The Dev Lead leading the feature: the chat that drafted it, else one that started a story under it. */
  function leadOf(dir: string, look: FeatureLook): string | null {
    const drafted = draftedBy(look.card);
    if (drafted) return drafted;
    const stories = new Set(
      look.scan.resolution.cards.filter(({ card }) => card.parent === look.card.id).map(({ card }) => card.id),
    );
    return chats.list(dir).find((c) => c.story && stories.has(c.story.id) && c.story.parent)?.story?.parent ?? null;
  }

  /** Tells the feature's Dev Lead to merge the base in, once per commit the base is at. */
  function tellBehind(dir: string, look: FeatureLook, baseTip: string, files: string[]) {
    const key = keyOf(dir, look.card.id);
    if (told.get(key) === baseTip) return;
    told.set(key, baseTip);
    const lead = leadOf(dir, look);
    if (!lead) return;
    const summary = behindMessage(look.branch, look.base, files);
    try {
      chats.notify(lead, { story: look.card.id, outcome: "behind main", summary });
    } catch (err) {
      log(`The Dev Lead couldn't be told ${look.base} moved on: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Where the feature's checks stand at its tip: CI on its PR, or the check command here (started when due). */
  async function checksAt(dir: string, look: FeatureLook, pr: FoundPr | null, ci: boolean): Promise<FeatureChecks> {
    if (ci) {
      if (!pr || pr.head !== look.tip) return "pending";
      const { passed } = await ciRead(dir, { ...look.card, branch: look.branch }, pr, undefined, deps);
      return passed === true ? "passed" : passed === false ? "failed" : "pending";
    }
    const verdict = checks.verdict(dir, look.card.id, look.tip);
    if (verdict === "pending") void checks.request(dir, look.card.id, look.top, look.tip, look.config);
    return verdict;
  }

  /** GitHub's copy of the branch is behind: it is pushed. True when it has commits this computer doesn't. */
  async function remoteAhead(look: FeatureLook, remote: string): Promise<boolean> {
    const there = await git.fetchTip(look.top, remote, look.branch);
    if (!there || there === look.tip) return false;
    if (!(await git.isAncestor(look.top, there, look.tip))) return true;
    await git.git(look.top, ["push", remote, look.branch]);
    return false;
  }

  return {
    /** What Merge to main waits on, read fresh, with GitHub when `use` says it is usable. */
    async factsOf(dir: string, look: FeatureLook, use: boolean): Promise<FeatureMergeFacts> {
      const remote = use ? await githubRemote(dir, deps.gitCommand) : null;
      const baseTip =
        (remote ? await git.fetchTip(look.top, remote.name, look.base) : null) ??
        (await git.commitOf(look.top, `refs/heads/${look.base}`));
      const behind = baseTip !== null && !(await git.isAncestor(look.top, baseTip, look.tip));
      const tree = behind && baseTip ? await git.mergeTree(look.top, baseTip, look.tip) : { tree: "" };
      const conflicts = "conflicts" in tree;
      if (behind && baseTip) tellBehind(dir, look, baseTip, conflicts ? tree.conflicts : []);
      const ahead = remote ? await remoteAhead(look, remote.name) : false;
      const pr = remote && look.card.pr ? await prs.readNow(dir, look.card.id, look.card.pr) : null;
      const prFact = !remote ? null : !look.card.pr ? "none" : pr?.status.state === "closed" ? "closed" : "open";
      const ci = remote !== null && checksWhere(look.config, await settings.github(dir)) === "ci";
      const checked = await checksAt(dir, look, pr, ci);
      return {
        base: look.base,
        branch: look.branch,
        behind,
        conflicts,
        pr: prFact,
        remoteAhead: ahead,
        checks: checked,
      };
    },

    forget(dir: string) {
      for (const key of told.keys()) if (key.startsWith(keyOf(dir, ""))) told.delete(key);
    },
  };
}
