/**
 * Merging a story into its feature (STORY-12, ADR 0034). The user's Merge, or the Dev Lead's `request_merge` once the
 * user approves it; never on its own. Merge needs Verified for the commit the story's branch is at, not Accept.
 *
 * With GitHub usable it merges the story's PR (`gh pr merge --merge --match-head-commit`); else it makes the merge
 * commit into the feature branch with git (merge-git.ts). Either way it is a merge commit: never squash, rebase or
 * force. A conflict merges nothing: the story goes back to its first active stage and its session gets the files,
 * sent before the card records it (send-then-record.ts). A merge settles as merge-settle.ts says, and a PR merged on
 * GitHub outside Featra settles the same way (`merged`, which the PR poller calls).
 */
import {
  checksWhere,
  conflictedStory,
  conflictMessage,
  GITHUB_COPY,
  mergeCommitMessage,
  mergedStory,
  mergeRefusal,
  MERGE_MESSAGES,
  serializeCard,
  toIso,
  type Card,
  type ProjectConfig,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import type { CheckSettings } from "./check-settings.ts";
import { githubRemote, type GithubRemote } from "./github-detect.ts";
import { mergePr, prMergeable } from "./github-merge.ts";
import { readPrAt, type GithubPrDeps } from "./github-prs.ts";
import { createMergeGit } from "./merge-git.ts";
import { createMergeSettle, type MergeResult } from "./merge-settle.ts";
import { sendThenRecord } from "./send-then-record.ts";
import { keyOf } from "./story-prs-seen.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryMergeDeps extends GithubPrDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  lane?: CardLane;
  log: (message: string) => void;
  settings: Pick<CheckSettings, "github" | "githubUse">;
  chats: Pick<ChatManager, "storySession" | "list" | "open" | "send" | "retire">;
  /** The commit story `id`'s local checks last settled on, or null while they run or before they have (story-checks). */
  checkedHead: (dir: string, id: string) => string | null;
  write?: (file: string, text: string) => Promise<void>;
}

/** How an attempt ended: merged into `into` (through `remote` on GitHub), or stopped on the conflicting `files`. */
type Attempt =
  | { kind: "merged"; into: string; remote: GithubRemote | null }
  | { kind: "conflict"; into: string; files: string[] };

/** The story, read fresh, with everything a merge of it needs; throws why it can't merge. */
interface Ready {
  card: Card;
  config: ProjectConfig;
  top: string;
  path: string;
  into: string;
  tip: string;
}

export function createStoryMerge(deps: StoryMergeDeps) {
  const { scan: scanDir, now, log, settings, chats, checkedHead, write = writeAtomic } = deps;
  const lane = deps.lane ?? createCardLane();
  const git = createMergeGit(deps.gitCommand);
  const { settle } = createMergeSettle({ scan: scanDir, now, lane, chats, git, write });
  const merging = new Set<string>();

  async function ready(dir: string, id: string): Promise<Ready> {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    const config = scan?.collected.config;
    if (!scan || !config) throw new ApiError(MERGE_MESSAGES.gone);
    const refusal = mergeRefusal(found?.owned, id, config, found?.root != null);
    if (refusal !== null || !found?.root) throw new ApiError(refusal ?? MERGE_MESSAGES.readOnly);
    const { card, path } = found.owned;
    const feature = card.parent ? scan.collected.state.features[card.parent] : undefined;
    const top = scan.collected.paths.top;
    const tip = card.branch ? await git.commitOf(top, `refs/heads/${card.branch}`) : null;
    if (!feature || feature.merged || !tip) throw new ApiError(MERGE_MESSAGES.noFeature(id));
    const session = chats.storySession(dir, id);
    const row = session === null ? undefined : chats.list(dir).find((c) => c.id === session);
    if (row?.running || row?.queued) throw new ApiError(MERGE_MESSAGES.working(id));
    const dirty = await git.uncommitted(found.root, path);
    if (dirty.length > 0) throw new ApiError(MERGE_MESSAGES.dirty(id, dirty));
    return { card, config, top, path, into: feature.branch, tip };
  }

  /** The merge commit into the feature branch, made and published in the lane on the card as it is then. */
  const mergeLocally = (dir: string, id: string): Promise<Attempt> =>
    lane.exclusive(async () => {
      const r = await ready(dir, id);
      if (checkedHead(dir, id) !== r.tip) throw new ApiError(MERGE_MESSAGES.stale(id));
      const old = await git.commitOf(r.top, `refs/heads/${r.into}`);
      if (!old) throw new ApiError(MERGE_MESSAGES.noFeature(id));
      const text = serializeCard(mergedStory(r.card, r.into, "system", toIso(now())));
      const message = mergeCommitMessage(r.card);
      const made = await git.mergeCommit(r.top, { parents: [old, r.tip], path: r.path, text, message });
      if ("conflicts" in made) return { kind: "conflict", into: r.into, files: made.conflicts };
      if (!(await git.publish(r.top, r.into, made.commit, old))) throw new ApiError(MERGE_MESSAGES.targetBusy(r.into));
      return { kind: "merged", into: r.into, remote: null };
    });

  /** The files that conflict merging `tip` into the feature branch as `remote` has it; none when it can't tell. */
  async function conflictsOnGithub(top: string, remote: string, into: string, tip: string): Promise<string[]> {
    const theirs = await git.fetchTip(top, remote, into);
    const tree = theirs ? await git.mergeTree(top, theirs, tip).catch(() => null) : null;
    return tree && "conflicts" in tree ? tree.conflicts : [];
  }

  /** The story's PR merged on GitHub, at the commit its branch is at and its CI checked. */
  async function mergeOnGithub(dir: string, id: string): Promise<Attempt> {
    const r = await ready(dir, id);
    if (!r.card.pr) throw new ApiError(MERGE_MESSAGES.noPr(id));
    const remote = await githubRemote(dir, deps.gitCommand);
    if (!remote) throw new ApiError(GITHUB_COPY.noRemote);
    const pr = await readPrAt(dir, r.card.pr, deps);
    if (!pr) throw new ApiError(`${MERGE_MESSAGES.failed}.`);
    if (pr.status.state === "merged") return { kind: "merged", into: r.into, remote };
    if (pr.status.state === "closed") throw new ApiError(MERGE_MESSAGES.prClosed(id));
    const local = checksWhere(r.config, await settings.github(dir)) === "local";
    if (pr.head !== r.tip || (local && checkedHead(dir, id) !== r.tip)) throw new ApiError(MERGE_MESSAGES.stale(id));
    const outcome =
      (await prMergeable(dir, pr.url, deps)) === "CONFLICTING"
        ? { conflict: true as const }
        : await mergePr(dir, pr.url, r.tip, deps);
    if (outcome === null) return { kind: "merged", into: r.into, remote };
    if ("error" in outcome) throw new ApiError(outcome.error);
    return { kind: "conflict", into: r.into, files: await conflictsOnGithub(r.top, remote.name, r.into, r.tip) };
  }

  /** The story back in its first active stage, by system, once its session has the files. Throws what the user is told. */
  async function conflicted(dir: string, id: string, into: string, files: string[]): Promise<never> {
    let stage = "";
    const record = async () => {
      const scan = await scanDir(dir);
      const found = ownedIn(scan, id);
      const config = scan?.collected.config;
      if (!found?.root || !config) return false;
      const next = conflictedStory(found.owned.card, config, "system", toIso(now()));
      stage = next.status;
      await write(fileIn(found.root, found.owned.path), serializeCard(next));
      await scanDir(dir);
      return true;
    };
    const session = chats.storySession(dir, id);
    try {
      if (session === null) throw new Error("The story has no session.");
      await sendThenRecord({
        lane,
        open: () => chats.open(session),
        send: () => chats.send(session, conflictMessage(id, into, files)),
        record,
      });
    } catch (err) {
      log(`${id}'s session couldn't be told its merge conflicted: ${err instanceof Error ? err.message : String(err)}`);
      await lane.exclusive(record);
    }
    throw new ApiError(MERGE_MESSAGES.conflict(id, files, stage));
  }

  /** Runs `work` for story `id` unless a merge of it already runs. */
  async function once<T>(dir: string, id: string, work: () => Promise<T>): Promise<T> {
    const key = keyOf(dir, id);
    if (merging.has(key)) throw new ApiError(MERGE_MESSAGES.merging(id));
    merging.add(key);
    try {
      return await work();
    } finally {
      merging.delete(key);
    }
  }

  /** Merges story `id` into its feature: on GitHub when it is usable here, else with git. */
  const merge = (dir: string, id: string): Promise<MergeResult> =>
    once(dir, id, async () => {
      const github = (await settings.githubUse(dir)).usable;
      const attempt = github ? await mergeOnGithub(dir, id) : await mergeLocally(dir, id);
      if (attempt.kind === "conflict") return conflicted(dir, id, attempt.into, attempt.files);
      return settle(dir, id, attempt.into, attempt.remote);
    });

  /** Story `id`'s PR was merged on GitHub outside Featra: it settles as a merge Featra made does. */
  async function merged(dir: string, id: string): Promise<void> {
    const key = keyOf(dir, id);
    if (merging.has(key)) return;
    const scan = await scanDir(dir);
    const card = ownedIn(scan, id)?.owned.card;
    const into = card?.parent ? scan?.collected.state.features[card.parent]?.branch : undefined;
    const remote = await githubRemote(dir, deps.gitCommand);
    if (!into || !remote) return;
    try {
      const { remains } = await once(dir, id, () => settle(dir, id, into, remote));
      for (const note of remains) log(`${id} merged on GitHub: ${note}`);
    } catch (err) {
      log(`${id} merged on GitHub, but couldn't be settled: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { merge, merged };
}

export type StoryMerge = ReturnType<typeof createStoryMerge>;
