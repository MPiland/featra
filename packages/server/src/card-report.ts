/**
 * An agent's report on a card (STORY-10): the same owner-copy write as the card pane's (ADR 0017), by `session:<chat>`.
 * The rules (who may, what, and what each change looks like) are work-format's `applyReport`; this reads the owner's
 * copy, checks that each evidence file it links is really there and small, and writes. Nothing is committed: the
 * agent commits the card and its evidence with its work.
 */
import { lstat } from "node:fs/promises";
import {
  applyReport,
  draftAuthor,
  errorMessage,
  REPORT_LIMITS,
  reportAuthError,
  serializeCard,
  toIso,
  type ReportInput,
  type Reporter,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { cardViewIn, fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { Scan } from "./work-scan.ts";

export const REPORT_MESSAGES = {
  noOwn: "Say which card to update, as `card`.",
  gone: "That card is gone.",
  missing: (path: string) => `${path} isn't there: write the file in your worktree first.`,
  notFile: (path: string) => `${path} isn't a plain file.`,
  tooBig: (path: string) => `${path} is over 1 MB: keep evidence small, one screenshot per criterion at most.`,
  saveFailed: (why: string) => `Can't save the card: ${why}`,
} as const;

export interface CardReportDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through, shared with the card pane's edits and the drafts. */
  lane?: CardLane;
}

/** Why the evidence file at `path` (relative to `root`) can't be linked, or null. */
async function evidenceFileError(root: string, path: string): Promise<string | null> {
  try {
    const stat = await lstat(fileIn(root, path));
    if (!stat.isFile()) return REPORT_MESSAGES.notFile(path);
    return stat.size > REPORT_LIMITS.evidenceBytes ? REPORT_MESSAGES.tooBig(path) : null;
  } catch {
    return REPORT_MESSAGES.missing(path);
  }
}

export function createCardReport({ scan: scanDir, now, lane = createCardLane() }: CardReportDeps) {
  async function report(dir: string, who: Reporter, label: string, input: ReportInput): Promise<string[]> {
    const id = input.card ?? who.story;
    if (id === null) throw new ApiError(REPORT_MESSAGES.noOwn);
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    if (!scan || !found) throw new ApiError(REPORT_MESSAGES.gone);
    const denied = reportAuthError(
      who,
      id,
      scan.resolution.cards.map((c) => c.card),
    );
    if (denied !== null) throw new ApiError(denied);
    const view = cardViewIn(scan, id);
    if (view?.readOnly || !found.root) throw new ApiError(view?.readOnly ?? `${id} isn't checked out here.`);
    const { config } = scan.collected;
    const result = applyReport(found.owned.card, input, { config }, draftAuthor(who.chat), toIso(now()), label);
    if (!result.ok) throw new ApiError(result.error);
    for (const link of result.links) {
      const why = await evidenceFileError(found.root, link);
      if (why !== null) throw new ApiError(why);
    }
    if (result.changes.length === 0) return [];
    try {
      await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(result.card));
    } catch (err) {
      throw new ApiError(REPORT_MESSAGES.saveFailed(errorMessage(err)));
    }
    // Scans again, so every watcher sees the change at once.
    await scanDir(dir);
    return result.changes;
  }

  return {
    /** Applies `input` to the owner's copy of the card as the chat `who` (labelled `label` in its notes); what changed. */
    report: (dir: string, who: Reporter, label: string, input: ReportInput): Promise<string[]> =>
      lane.exclusive(() => report(dir, who, label, input)),
  };
}

export type CardReport = ReturnType<typeof createCardReport>;
