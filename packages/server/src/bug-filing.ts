/**
 * Filing a bug (STORY-13, ADR 0036): the same for the Dev Lead's `report_bug` and Work's New bug, with or without
 * GitHub. `propose` reads the cards and says where the bug would go (work-format's `bugPlacements`); `file` writes it
 * where the user placed it, after checking that place again. A new bug card gets its ID here and goes to its owner's
 * copy: a feature branch for a bug under a feature in progress, main for a project bug. A task goes on the story's
 * card at its owner, its worktree while it has one. Where the owner is checked out the file is written there,
 * uncommitted, as every card edit is; where it isn't, it is committed on the owner's branch by plumbing (the helper
 * STORY-58's Abandon writes a feature branch with), so no checkout is touched. Calls run in the server's card lane.
 */
import { readdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  bugCommitMessage,
  bugPlacements,
  cardFileName,
  CARDS_DIR,
  fileBug,
  idFromFileName,
  nextId,
  ownerOf,
  placementRefusal,
  REPORT_BUG_MESSAGES,
  serializeCard,
  toIso,
  type BugPlacements,
  type BugReport,
  type OwnerLocation,
  type PlacementKey,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, createExclusive, isCollision, type CardLane } from "./card-lane.ts";
import { locationKey } from "./collect.ts";
import type { runGit } from "./git-run.ts";
import { createMergeGit } from "./merge-git.ts";
import type { Scan } from "./work-scan.ts";

export const BUG_MESSAGES = {
  notProject: "This folder isn't a Featra project in git.",
  noBranch: (branch: string) => `The branch ${branch} is gone, so the bug can't go there.`,
  busy: (branch: string) => `The branch ${branch} changed or has changes in the way. Try again.`,
  collide: "Can't file the bug: its ID keeps colliding with cards on disk.",
} as const;

export interface BugFilingDeps {
  /** Scans a folder, before the write and again after, so every watcher of the Work list hears the bug. */
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  lane?: CardLane;
  gitCommand?: string;
  /** The platform's git, which a test may stand in for. */
  gitRun?: typeof runGit;
}

/** What was filed: a new bug card, or a task on the card `id`. */
export interface FiledResult {
  kind: "card" | "task";
  id: string;
}

const ATTEMPTS = 10;

export function createBugFiling({ scan: scanDir, now, lane = createCardLane(), gitCommand, gitRun }: BugFilingDeps) {
  const git = createMergeGit(gitCommand, gitRun);

  /** The project's cards, and the card the bug is believed to come from checked; throws why it can't be read. */
  async function read(dir: string, cause: string | null) {
    const scan = await scanDir(dir);
    if (!scan) throw new ApiError(BUG_MESSAGES.notProject);
    const cards = scan.resolution.cards.map((c) => c.card);
    if (cause !== null && !cards.some((c) => c.id === cause))
      throw new ApiError(REPORT_BUG_MESSAGES.unknownCause(cause));
    return { scan, cards, config: scan.collected.config };
  }

  /**
   * Writes `text` at `path` in `owner`'s copy. With `created`, the new card's ID: false when a card with that ID is
   * already there (taken meanwhile), so the caller allocates again.
   */
  async function put(
    scan: Scan,
    owner: OwnerLocation,
    path: string,
    text: string,
    created: string | null,
    message: string,
  ) {
    const root = scan.collected.roots.get(locationKey(owner));
    if (root) {
      const file = fileIn(root, path);
      if (created === null) return writeAtomic(file, text).then(() => true);
      const names = await readdir(dirname(file)).catch(() => []);
      if (names.some((n) => idFromFileName(n) === created)) return false;
      return createExclusive(file, text).then(
        () => true,
        (err: unknown) => {
          if (isCollision(err)) return false;
          throw err;
        },
      );
    }
    const branch = owner.kind === "main" ? scan.collected.git.baseBranch : owner.branch;
    const done = await git.commitCardOn(scan.collected.paths.top, branch, { path, text, message });
    if (done === "missing") throw new ApiError(BUG_MESSAGES.noBranch(branch));
    if (done === "busy") throw new ApiError(BUG_MESSAGES.busy(branch));
    return true;
  }

  async function run(dir: string, report: BugReport, placement: PlacementKey, by: string): Promise<FiledResult> {
    const { scan, cards, config } = await read(dir, report.cause);
    const refusal = placementRefusal(placement, cards, config);
    if (refusal !== null) throw new ApiError(refusal);
    // Every copy's IDs, so a bug never takes an ID a card on another branch has.
    const ids = scan.collected.copies.flatMap((c) => (c.card ? [c.card.id] : []));
    const at = toIso(now());
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const filed = fileBug(report, placement, { cards, config, id: nextId("bug", ids), by, at });
      const { card } = filed;
      const text = serializeCard(card);
      const message = bugCommitMessage(filed);
      if (filed.kind === "task") {
        const found = ownedIn(scan, card.id);
        if (!found) throw new ApiError(REPORT_BUG_MESSAGES.placeGone(placement));
        await put(scan, found.owned.owner, found.owned.path, text, null, message);
      } else {
        const owner = ownerOf(card, scan.collected.state);
        if (!(await put(scan, owner, `${CARDS_DIR}/${cardFileName(card)}`, text, card.id, message))) {
          ids.push(card.id);
          continue;
        }
      }
      await scanDir(dir);
      return { kind: filed.kind, id: card.id };
    }
    throw new ApiError(BUG_MESSAGES.collide);
  }

  return {
    /** Where a bug believed to come from `cause` would go, and every place it can go. */
    propose: async (dir: string, cause: string | null): Promise<BugPlacements> => {
      const { cards, config } = await read(dir, cause);
      return bugPlacements(cause, cards, config);
    },
    /** Files `report` at `placement`, as `by` (the user, or the Dev Lead's session); what it made. */
    file: (dir: string, report: BugReport, placement: PlacementKey, by: string) =>
      lane.exclusive(() => run(dir, report, placement, by)),
  };
}

export type BugFiling = ReturnType<typeof createBugFiling>;
