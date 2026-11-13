/**
 * What Merge to main waits on (STORY-14, ADR 0037), read fresh for an accepted feature: whether the base's tip (as
 * GitHub has it, when it is usable) is in the feature branch's history, whether they conflict, its PR, whether GitHub's
 * copy of the branch has commits this computer doesn't, whether the base's checkout has local changes the merge would
 * overwrite, and its checks at the commit its branch is at: CI on its PR, or the check command run here. Reading them
 * changes nothing on GitHub: a branch GitHub is behind on is pushed (`pushBehind`, never forced) by the periodic read
 * before it reads them, never by the read a merge makes. When the base has moved on, the Dev Lead leading the feature
 * is told once per base commit to merge it in with a merge commit, never a rebase.
 */
import {
  behindMessage,
  checksWhere,
  draftedBy,
  safeBranch,
  type FeatureChecks,
  type FeatureMergeFacts,
  type Notice,
} from "@featra/work-format";
import type { ChatManager } from "./chat-manager.ts";
import type { CheckSettings } from "./check-settings.ts";
import { baseInTheWay } from "./feature-base.ts";
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

/** The facts, and the commits they were judged at: a merge goes ahead only while both are where they were. */
export interface Judged {
  facts: FeatureMergeFacts;
  tip: string;
  /** The base's tip the facts were read against: GitHub's when it is usable, else the local branch's. */
  baseTip: string | null;
}

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

/** The PR fact: closed, merged without the commit the branch is at here, else open (one merged at it settles). */
function prState(pr: FoundPr | null, tip: string): "open" | "closed" | "merged" {
  if (pr?.status.state === "closed") return "closed";
  return pr?.status.state === "merged" && pr.head !== tip ? "merged" : "open";
}

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

  /** Posts `notice` to the feature's Dev Lead; false when none was found or the post failed. */
  function tell(dir: string, look: FeatureLook, notice: Omit<Notice, "story">): boolean {
    const lead = leadOf(dir, look);
    if (!lead) return false;
    try {
      chats.notify(lead, { story: look.card.id, ...notice });
      return true;
    } catch (err) {
      log(`The Dev Lead couldn't be told about ${look.card.id}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Tells the feature's Dev Lead to merge the base in, once per commit the base is at, once the notice is posted. */
  function tellBehind(dir: string, look: FeatureLook, baseTip: string, files: string[]) {
    const key = keyOf(dir, look.card.id);
    if (told.get(key) === baseTip) return;
    const summary = behindMessage(look.branch, look.base, files);
    if (tell(dir, look, { outcome: "behind main", summary })) told.set(key, baseTip);
  }

  /** Where the feature's checks stand at its tip: CI on its PR, or the check command here (started when due). */
  async function checksAt(dir: string, look: FeatureLook, pr: FoundPr | null, ci: boolean): Promise<FeatureChecks> {
    if (ci) {
      if (!pr || pr.head !== look.tip) return "pending";
      const { passed } = await ciRead(dir, { ...look.card, branch: look.branch }, pr, undefined, deps);
      return passed === true ? "passed" : passed === false ? "failed" : "pending";
    }
    const verdict = checks.verdict(dir, look.card.id, look.tip, look.config.checkCommand);
    if (verdict === "pending") void checks.request(dir, look.card.id, look.top, look.tip, look.config);
    return verdict;
  }

  return {
    /** What Merge to main waits on, read fresh, with GitHub when `use` says it is usable. Pushes nothing. */
    async factsOf(dir: string, look: FeatureLook, use: boolean): Promise<Judged> {
      const remote = use ? await githubRemote(dir, deps.gitCommand) : null;
      const local = await git.commitOf(look.top, `refs/heads/${look.base}`);
      const baseTip = (remote ? await git.fetchTip(look.top, remote.name, look.base) : null) ?? local;
      const behind = baseTip !== null && !(await git.isAncestor(look.top, baseTip, look.tip));
      const tree = behind && baseTip ? await git.mergeTree(look.top, baseTip, look.tip) : { tree: "" };
      const conflicts = "conflicts" in tree;
      if (behind && baseTip) tellBehind(dir, look, baseTip, conflicts ? tree.conflicts : []);
      const there = remote ? await git.fetchTip(look.top, remote.name, look.branch) : null;
      const remoteAhead = there !== null && there !== look.tip && !(await git.isAncestor(look.top, there, look.tip));
      const pr = remote && look.card.pr ? await prs.readNow(dir, look.card.id, look.card.pr) : null;
      const prFact = !remote ? null : !look.card.pr ? "none" : prState(pr, look.tip);
      const busy = local ? await baseInTheWay(git, look, local, [look.tip, ...(baseTip ? [baseTip] : [])]) : [];
      const ci = remote !== null && checksWhere(look.config, await settings.github(dir)) === "ci";
      const facts: FeatureMergeFacts = {
        base: look.base,
        branch: look.branch,
        behind,
        conflicts,
        pr: prFact,
        remoteAhead,
        baseBusy: busy.length > 0,
        checks: await checksAt(dir, look, pr, ci),
      };
      return { facts, tip: look.tip, baseTip };
    },

    /** Pushes the feature branch, never forced, when GitHub's copy is behind it; the periodic read does, before it reads. */
    async pushBehind(dir: string, look: FeatureLook): Promise<void> {
      const remote = await githubRemote(dir, deps.gitCommand);
      if (!remote || !safeBranch(look.branch)) return;
      const there = await git.fetchTip(look.top, remote.name, look.branch);
      if (there === null || there === look.tip || !(await git.isAncestor(look.top, there, look.tip))) return;
      const ref = `refs/heads/${look.branch}`;
      const pushed = await git.git(look.top, ["push", "--quiet", remote.name, `${ref}:${ref}`]);
      if (pushed.code !== 0) log(`${look.branch} couldn't be pushed: ${pushed.stderr.trim()}`);
    },

    tell,

    forget(dir: string) {
      for (const key of told.keys()) if (key.startsWith(keyOf(dir, ""))) told.delete(key);
    },
  };
}
