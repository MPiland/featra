/**
 * An agent's report on a card (STORY-10): the same owner-copy write as the card pane's (ADR 0017), by `session:<chat>`.
 * The rules (who may, what, and what each change looks like) are work-format's `applyReport`; this reads the owner's
 * copy, checks that each evidence file it links is really there and small, and writes. Nothing is committed: the
 * agent commits the card and its evidence with its work.
 */
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
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
  /** The agent's words: the user's own "Check out ..." is for the card pane, which an agent can't act on. */
  noCopy: (id: string) => `${id} has no working copy yet. Start it with spawn_session.`,
  worktreeGone: (id: string) => `${id}'s worktree is gone, so this session can no longer update it.`,
  missing: (path: string) => `${path} isn't there: write the file in your worktree first.`,
  notFile: (path: string) => `${path} isn't a plain file.`,
  outside: (path: string) => `${path} resolves outside the evidence folder: link a real file inside it.`,
  tooBig: (path: string) => `${path} is over 1 MB: keep evidence small, one screenshot per criterion at most.`,
  saveFailed: (why: string) => `Can't save the card: ${why}`,
} as const;

export interface CardReportDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through, shared with the card pane's edits and the drafts. */
  lane?: CardLane;
  /** The chats a story's sessions nest under, which spawned them (so lead them). None when not given. */
  leads?: (dir: string, story: string) => readonly string[];
}

const inside = (base: string, file: string): boolean => {
  const rel = relative(base, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/** The real folder of the evidence path's first four parts (.featra/evidence/FEAT-N/STORY-M). */
const folderOf = (path: string): string[] => path.split("/").slice(0, 4);

/**
 * Why the evidence file at `path` (relative to `root`) can't be linked, or null. Every part must be a real directory
 * entry by exactly that name (case and trailing dots included), the file a plain one, and its real path inside both the
 * root and the evidence folder (no link may lead out). The size is advisory: the file can change after this looks.
 */
async function evidenceFileError(root: string, path: string): Promise<string | null> {
  try {
    let dir = root;
    for (const part of path.split("/")) {
      if (!(await readdir(dir)).includes(part)) return REPORT_MESSAGES.missing(path);
      dir = join(dir, part);
    }
    const file = fileIn(root, path);
    const stat = await lstat(file);
    if (!stat.isFile()) return stat.isSymbolicLink() ? REPORT_MESSAGES.outside(path) : REPORT_MESSAGES.notFile(path);
    const [real, realRoot, realFolder] = await Promise.all([
      realpath(file),
      realpath(root),
      realpath(join(root, ...folderOf(path))),
    ]);
    if (!inside(realRoot, real) || !inside(realFolder, real)) return REPORT_MESSAGES.outside(path);
    return stat.size > REPORT_LIMITS.evidenceBytes ? REPORT_MESSAGES.tooBig(path) : null;
  } catch {
    return REPORT_MESSAGES.missing(path);
  }
}

const same = (a: string, b: string): boolean =>
  process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

export function createCardReport({ scan: scanDir, now, lane = createCardLane(), leads }: CardReportDeps) {
  async function report(
    dir: string,
    who: Reporter,
    label: string,
    input: ReportInput,
    cwd: string | undefined,
  ): Promise<{ card: string; changes: string[] }> {
    const id = input.card ?? who.story;
    if (id === null) throw new ApiError(REPORT_MESSAGES.noOwn);
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    if (!scan || !found) throw new ApiError(REPORT_MESSAGES.gone);
    const denied = reportAuthError(
      { ...who, leads: (story) => leads?.(dir, story) ?? [] },
      id,
      scan.resolution.cards.map((c) => c.card),
    );
    if (denied !== null) throw new ApiError(denied);
    const view = cardViewIn(scan, id);
    // A story session writes through its own worktree: once that is gone (the card is owned elsewhere), it is refused.
    if (who.story !== null && (!found.root || cwd === undefined || !same(found.root, cwd))) {
      throw new ApiError(REPORT_MESSAGES.worktreeGone(id));
    }
    if (view?.readOnly || !found.root) throw new ApiError(REPORT_MESSAGES.noCopy(id));
    const { config } = scan.collected;
    const result = applyReport(found.owned.card, input, { config }, draftAuthor(who.chat), toIso(now()), label);
    if (!result.ok) throw new ApiError(result.error);
    for (const link of result.links) {
      const why = await evidenceFileError(found.root, link);
      if (why !== null) throw new ApiError(why);
    }
    if (result.changes.length === 0) return { card: id, changes: [] };
    try {
      await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(result.card));
    } catch (err) {
      throw new ApiError(REPORT_MESSAGES.saveFailed(errorMessage(err)));
    }
    // Scans again, so every watcher sees the change at once.
    await scanDir(dir);
    return { card: id, changes: result.changes };
  }

  return {
    /**
     * Applies `input` to the owner's copy of the card as the chat `who` (labelled `label` in its notes, working in
     * `cwd`); the card it changed and what changed.
     */
    report: (dir: string, who: Reporter, label: string, input: ReportInput, cwd?: string) =>
      lane.exclusive(() => report(dir, who, label, input, cwd)),
  };
}

export type CardReport = ReturnType<typeof createCardReport>;
