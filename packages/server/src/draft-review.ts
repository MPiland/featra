/**
 * Approving or rejecting a draft (STORY-51, ADR 0023): the only two ways out of draft. Each is one method that runs in
 * the card lane and reads the draft fresh inside it, so a second approve (or an approve after a reject) finds the draft
 * already gone from `draft` and is refused. The draft is the feature and every story under it, and each must be
 * untracked and owned by main's checkout, else the action is refused and names the story. Approve commits only the
 * draft's own card files, with a pathspec-limited commit, so whatever else the user has staged or edited is never swept
 * in; it never pushes and the repo's hooks run. It is all or nothing: if anything fails the card files go back byte for
 * byte and the index entries of those paths as they were. Reject deletes the draft's files, and only when git tracks
 * none of them.
 */
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  approvalMessage,
  draftStories,
  errorMessage,
  locationLabel,
  MAIN,
  notDraftReason,
  parseCard,
  planApproval,
  serializeCard,
  toIso,
  type Card,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { locationKey } from "./collect.ts";
import { failed, runGit, type Run } from "./git-run.ts";
import type { Scan } from "./work-scan.ts";

export const REVIEW_MESSAGES = {
  notProject: "This folder isn't a Featra project in git.",
  noMain: (base: string) => `Main isn't checked out on ${base}. Switch it back to ${base}, then try again.`,
  detached: (base: string) => `Main's checkout is detached. Check out ${base} first.`,
  empty: (base: string) => `${base} has no commits yet. Make a first commit, then try again.`,
  noBranch: (base: string) => `There's no ${base} branch. Create it, or set baseBranch in .featra/config.yaml.`,
  midOperation: (what: string) => `Main is in the middle of a ${what}. Finish or abort it, then try again.`,
  notOwned: (id: string) => `${id} isn't in main's checkout.`,
  storyElsewhere: (story: string, where: string, id: string) => `${story} is in ${where}; move it out of ${id} first.`,
  storyTracked: (story: string, id: string) => `${story} is already in git; move it out of ${id} first.`,
  tracked: (id: string, paths: readonly string[]) =>
    `${id} can't be deleted: git tracks ${paths.join(", ")}. Remove them with git instead.`,
  changed: (id: string) => `${id} changed while it was being approved. Try again.`,
  commit: (id: string, why: string) => `Couldn't approve ${id}; nothing was changed. ${why}`,
  commitAndRestore: (id: string, why: string, restore: string) =>
    `Couldn't approve ${id}, and putting things back failed too, so check git status. ${why} ${restore}`,
} as const;

/** What a clean main checkout lacks: the files git leaves while a merge, rebase, pick, revert or bisect is going on. */
const OPERATIONS = [
  ["MERGE_HEAD", "merge"],
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"],
  ["BISECT_LOG", "bisect"],
] as const;

export interface DraftReviewDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  /** The git command (default `git`). */
  gitCommand?: string;
  /** How the approved feature reaches disk. Default: atomically. */
  write?: (file: string, text: string) => Promise<void>;
}

export interface ApproveResult {
  /** The commit's short id. */
  commit: string;
}

export interface RejectResult {
  /** How many card files were deleted. */
  removed: number;
}

/** A card file the draft owns: where it is and exactly what it holds now. */
interface Held {
  card: Card;
  path: string;
  file: string;
  bytes: Buffer;
}

/** Throws if any held file is no longer exactly as it was read: someone edited it, so nothing is written over it. */
async function unchanged(files: readonly Held[], id: string): Promise<void> {
  const current = await Promise.all(files.map((f) => readFile(f.file).catch(() => null)));
  if (files.some((f, i) => !current[i]?.equals(f.bytes))) throw new ApiError(REVIEW_MESSAGES.changed(id));
}

export function createDraftReview({
  scan: scanDir,
  now,
  lane = createCardLane(),
  gitCommand = "git",
  write = writeAtomic,
}: DraftReviewDeps) {
  const git = (root: string, args: string[]) => runGit(gitCommand, root, args);
  const must = async (root: string, args: string[]): Promise<Run> => {
    const r = await git(root, args);
    if (r.code !== 0) throw failed(`git ${args[0] ?? ""}`, r);
    return r;
  };

  /** Throws unless main's checkout is on the base branch (with a commit, when `needCommit`) and not mid-operation. */
  async function checkMain(top: string, base: string, scan: Scan, needCommit: boolean): Promise<void> {
    const where = await must(top, ["rev-parse", ...OPERATIONS.flatMap(([name]) => ["--git-path", name])]);
    const paths = where.stdout.split(/\r?\n/).filter(Boolean);
    const busy = OPERATIONS.find((_, i) => existsSync(resolve(top, paths[i] ?? "")));
    if (busy) throw new ApiError(REVIEW_MESSAGES.midOperation(busy[1]));
    const head = await git(top, ["symbolic-ref", "-q", "HEAD"]);
    if (head.code !== 0) throw new ApiError(REVIEW_MESSAGES.detached(base));
    const branch = head.stdout.trim().replace(/^refs\/heads\//, "");
    if (branch !== base) {
      const exists = scan.collected.git.branches.some((b) => b.name === base);
      throw new ApiError(exists ? REVIEW_MESSAGES.noMain(base) : REVIEW_MESSAGES.noBranch(base));
    }
    if (needCommit && (await git(top, ["rev-parse", "--verify", "-q", "HEAD"])).code !== 0)
      throw new ApiError(REVIEW_MESSAGES.empty(base));
  }

  /** The paths git knows (tracked, or staged). */
  async function known(root: string, paths: readonly string[]): Promise<Set<string>> {
    const r = await must(root, ["ls-files", "-z", "--", ...paths]);
    return new Set(r.stdout.split("\0").filter(Boolean));
  }

  /**
   * The draft in a fresh scan, read from disk: main's checkout, and the card file of the feature and of every story
   * under it. Each card is parsed from the bytes read here, not taken from the scan, so what is written is what was
   * on disk. Refuses a story that isn't in main's checkout, naming it.
   */
  async function hold(dir: string, id: string, needCommit: boolean) {
    const scan = await scanDir(dir);
    const top = scan?.collected.git.trees[0]?.path;
    if (!scan || !top) throw new ApiError(REVIEW_MESSAGES.notProject);
    const base = scan.collected.config.baseBranch;
    await checkMain(top, base, scan, needCommit);
    const root = scan.collected.roots.get(locationKey(MAIN));
    if (!root) throw new ApiError(REVIEW_MESSAGES.noMain(base));
    const cards = scan.resolution.cards.map((c) => c.card);
    const refusal = notDraftReason(
      cards.find((c) => c.id === id),
      id,
    );
    if (refusal !== null) throw new ApiError(refusal);
    const ids = [id, ...draftStories(id, cards).map((s) => s.id)];
    const files = await Promise.all(
      ids.map(async (cardId): Promise<Held> => {
        const found = ownedIn(scan, cardId);
        const here = found && locationKey(found.owned.owner) === locationKey(MAIN) && found.root === root;
        if (!found || !here) {
          throw new ApiError(
            found && cardId !== id
              ? REVIEW_MESSAGES.storyElsewhere(cardId, locationLabel(found.owned.owner), id)
              : REVIEW_MESSAGES.notOwned(cardId),
          );
        }
        const file = fileIn(root, found.owned.path);
        const bytes = await readFile(file);
        return { card: parseCard(bytes.toString("utf8"), found.owned.path), path: found.owned.path, file, bytes };
      }),
    );
    const tracked = await known(
      root,
      files.map((f) => f.path),
    );
    return { root, files, tracked };
  }

  /** The index entries (mode, blob, stage, path) git holds for `paths`, as `git ls-files -s` lists them. */
  async function indexEntries(root: string, paths: readonly string[]): Promise<string[]> {
    const r = await must(root, ["ls-files", "-s", "-z", "--", ...paths]);
    return r.stdout.split("\0").filter(Boolean);
  }

  /**
   * Puts the files back exactly as held and the index entries of `paths` as `before` recorded them. Tries both and
   * throws, saying which failed, so the caller can be honest about what is left.
   */
  async function restore(root: string, files: readonly Held[], paths: readonly string[], before: readonly string[]) {
    const problems: string[] = [];
    try {
      await Promise.all(files.map((f) => writeFile(f.file, f.bytes)));
    } catch (err) {
      problems.push(`Restoring the card files failed: ${errorMessage(err)}`);
    }
    try {
      await must(root, ["reset", "-q", "--", ...paths]);
      for (const entry of before) {
        const [info = "", path] = entry.split("\t");
        const [mode, sha, stage] = info.split(" ");
        if (stage !== "0" || !mode || !sha || !path) continue;
        await must(root, ["update-index", "--add", "--cacheinfo", `${mode},${sha},${path}`]);
      }
    } catch (err) {
      problems.push(`Restoring the index failed: ${errorMessage(err)}`);
    }
    if (problems.length) throw new Error(problems.join(" "));
  }

  async function approve(dir: string, id: string): Promise<ApproveResult> {
    const { root, files, tracked } = await hold(dir, id, true);
    const plan = planApproval(
      id,
      files.map((f) => f.card),
      toIso(now()),
    );
    if (!plan.ok) throw new ApiError(plan.error);
    const held = (card: Card): Held => {
      const found = files.find((f) => f.card.id === card.id);
      if (!found) throw new ApiError(REVIEW_MESSAGES.notOwned(card.id));
      return found;
    };
    // A live story git already tracks isn't part of the draft: it can't be approved with it.
    for (const story of plan.keep) {
      if (tracked.has(held(story).path)) throw new ApiError(REVIEW_MESSAGES.storyTracked(story.id, id));
    }
    // A cancelled story git already tracks goes into the commit as Cancelled; one it never saw is deleted.
    const dropped = plan.drop.map(held);
    const drop = dropped.filter((f) => !tracked.has(f.path));
    const commit = [held(plan.feature), ...plan.keep.map(held), ...dropped.filter((f) => tracked.has(f.path))].map(
      (f) => f.path,
    );
    await unchanged(files, id);
    const before = await indexEntries(root, commit);
    try {
      await write(held(plan.feature).file, serializeCard(plan.feature));
      await Promise.all(drop.map((f) => rm(f.file, { force: true })));
      await must(root, ["add", "-A", "--", ...commit]);
      await must(root, ["commit", "-m", approvalMessage(plan.feature), "--", ...commit]);
    } catch (err) {
      const why = err instanceof Error ? err.message : errorMessage(err);
      try {
        await restore(root, files, commit, before);
      } catch (again) {
        throw new ApiError(REVIEW_MESSAGES.commitAndRestore(id, why, errorMessage(again)));
      }
      throw new ApiError(REVIEW_MESSAGES.commit(id, why));
    }
    await scanDir(dir);
    return { commit: (await must(root, ["rev-parse", "--short", "HEAD"])).stdout.trim() };
  }

  async function reject(dir: string, id: string): Promise<RejectResult> {
    const { files, tracked } = await hold(dir, id, false);
    if (tracked.size) throw new ApiError(REVIEW_MESSAGES.tracked(id, [...tracked]));
    try {
      await Promise.all(files.map((f) => rm(f.file)));
    } catch (err) {
      await Promise.all(files.map((f) => writeFile(f.file, f.bytes)));
      throw new ApiError(`Couldn't reject ${id}; nothing was changed. ${errorMessage(err)}`);
    }
    await scanDir(dir);
    return { removed: files.length };
  }

  return {
    /** Approves draft feature `id`: marks it approved, sets its baseline and commits its cards to main, unpushed. */
    approve: (dir: string, id: string): Promise<ApproveResult> => lane.exclusive(() => approve(dir, id)),
    /** Rejects draft feature `id`: deletes its feature and story files, which git must not track. */
    reject: (dir: string, id: string): Promise<RejectResult> => lane.exclusive(() => reject(dir, id)),
  };
}

export type DraftReview = ReturnType<typeof createDraftReview>;
