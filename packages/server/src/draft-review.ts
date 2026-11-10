/**
 * Approving or rejecting a draft (STORY-51, ADR 0023): the only two ways out of draft. Each is one method that runs in
 * the card lane and reads the draft fresh inside it, so a second approve (or an approve after a reject) finds the draft
 * already gone from `draft` and is refused. Approve commits only the draft's own card files to main's checkout, with
 * a pathspec-limited commit, so whatever else the user has staged or edited is never swept in; it never pushes and the
 * repo's hooks run. It is all or nothing: if anything fails the card files go back byte for byte and the index is
 * cleaned. Reject deletes the draft's files, and only when git tracks none of them.
 */
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  approvalMessage,
  draftStories,
  errorMessage,
  MAIN,
  notDraftReason,
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
  midOperation: (what: string) => `Main is in the middle of a ${what}. Finish or abort it, then try again.`,
  notOwned: (id: string) => `${id} isn't in main's checkout.`,
  tracked: (id: string, paths: readonly string[]) =>
    `${id} can't be deleted: git tracks ${paths.join(", ")}. Remove them with git instead.`,
  commit: (id: string, why: string) => `Couldn't approve ${id}; nothing was changed. ${why}`,
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

  /** The draft in a fresh scan: main's checkout, and every card file of the feature and its stories, as they are. */
  async function hold(dir: string, id: string): Promise<{ root: string; base: string; files: Held[] }> {
    const scan = await scanDir(dir);
    if (!scan) throw new ApiError(REVIEW_MESSAGES.notProject);
    const base = scan.collected.config.baseBranch;
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
        if (!found || locationKey(found.owned.owner) !== locationKey(MAIN) || found.root !== root)
          throw new ApiError(REVIEW_MESSAGES.notOwned(cardId));
        const file = fileIn(root, found.owned.path);
        return { card: found.owned.card, path: found.owned.path, file, bytes: await readFile(file) };
      }),
    );
    return { root, base, files };
  }

  /** Throws unless main's checkout is on the base branch and no merge, rebase or the like is under way. */
  async function checkMain(root: string, base: string): Promise<void> {
    const head = await git(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
    if (head.stdout.trim() !== base) throw new ApiError(REVIEW_MESSAGES.noMain(base));
    const where = await must(root, ["rev-parse", ...OPERATIONS.flatMap(([name]) => ["--git-path", name])]);
    const paths = where.stdout.split(/\r?\n/).filter(Boolean);
    const busy = OPERATIONS.find((_, i) => existsSync(resolve(root, paths[i] ?? "")));
    if (busy) throw new ApiError(REVIEW_MESSAGES.midOperation(busy[1]));
  }

  /** The paths git knows (tracked, or staged). */
  async function known(root: string, paths: readonly string[]): Promise<string[]> {
    const r = await must(root, ["ls-files", "-z", "--", ...paths]);
    return r.stdout.split("\0").filter(Boolean);
  }

  /** Puts every file back exactly as it was held, and cleans the index of the paths. */
  async function restore(root: string, files: readonly Held[], paths: readonly string[]): Promise<void> {
    await git(root, ["reset", "-q", "--", ...paths]);
    await Promise.all(files.map((f) => writeFile(f.file, f.bytes)));
  }

  async function approve(dir: string, id: string): Promise<ApproveResult> {
    const { root, base, files } = await hold(dir, id);
    await checkMain(root, base);
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
    // A cancelled story git already tracks stays as it is; one it never saw is deleted.
    const tracked = new Set(
      await known(
        root,
        files.map((f) => f.path),
      ),
    );
    const drop = plan.drop.map(held).filter((f) => !tracked.has(f.path));
    const commit = [plan.feature, ...plan.keep].map((c) => held(c).path);
    try {
      await write(held(plan.feature).file, serializeCard(plan.feature));
      await Promise.all(drop.map((f) => rm(f.file, { force: true })));
      await must(root, ["add", "-A", "--", ...commit]);
      await must(root, ["commit", "-m", approvalMessage(plan.feature), "--", ...commit]);
    } catch (err) {
      const why = err instanceof Error ? err.message : errorMessage(err);
      try {
        await restore(root, files, commit);
      } catch (again) {
        throw new ApiError(
          REVIEW_MESSAGES.commit(id, `${why} Putting the cards back also failed: ${errorMessage(again)}`),
        );
      }
      throw new ApiError(REVIEW_MESSAGES.commit(id, why));
    }
    await scanDir(dir);
    return { commit: (await must(root, ["rev-parse", "--short", "HEAD"])).stdout.trim() };
  }

  async function reject(dir: string, id: string): Promise<RejectResult> {
    const { root, files } = await hold(dir, id);
    const tracked = await known(
      root,
      files.map((f) => f.path),
    );
    if (tracked.length) throw new ApiError(REVIEW_MESSAGES.tracked(id, tracked));
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
