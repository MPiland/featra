/**
 * An agent's report on a card (STORY-10): the same owner-copy write as the card pane's (ADR 0017), by `session:<chat>`.
 * The rules (who may, what, and what each change looks like) are work-format's `applyReport`; this reads the owner's
 * copy, checks that each evidence file it links is really there and small, and writes. Nothing is committed: the
 * agent commits the card and its evidence with its work. A report that moves a story to review has Featra attach its
 * screenshots (STORY-25) before the agent is answered, so they are there to commit with the card.
 */
import { resolve } from "node:path";
import {
  applyReport,
  checksApply,
  draftAuthor,
  errorMessage,
  reportAuthError,
  serializeCard,
  toIso,
  type ReportInput,
  type Reporter,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { cardViewIn, fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { evidenceOnDisk } from "./evidence-disk.ts";
import type { ProofCapture } from "./proof-capture.ts";
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
  /** Attaches a story's screenshots once a report moves it to review (STORY-25). None when not given. */
  proof?: Pick<ProofCapture, "attach">;
}

const same = (a: string, b: string): boolean =>
  process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

export function createCardReport({ scan: scanDir, now, lane = createCardLane(), leads, proof }: CardReportDeps) {
  async function report(
    dir: string,
    who: Reporter,
    label: string,
    input: ReportInput,
    cwd: string | undefined,
  ): Promise<{ card: string; changes: string[]; review: boolean }> {
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
      const disk = await evidenceOnDisk(found.root, link);
      if (!disk.ok) throw new ApiError(REPORT_MESSAGES[disk.problem](link));
    }
    if (result.changes.length === 0) return { card: id, changes: [], review: false };
    try {
      await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(result.card));
    } catch (err) {
      throw new ApiError(REPORT_MESSAGES.saveFailed(errorMessage(err)));
    }
    // Scans again, so every watcher sees the change at once.
    await scanDir(dir);
    const review = !checksApply(found.owned.card, config) && checksApply(result.card, config);
    return { card: id, changes: result.changes, review };
  }

  return {
    /**
     * Applies `input` to the owner's copy of the card as the chat `who` (labelled `label` in its notes, working in
     * `cwd`); the card it changed and what changed.
     */
    async report(dir: string, who: Reporter, label: string, input: ReportInput, cwd?: string) {
      const { card, changes, review } = await lane.exclusive(() => report(dir, who, label, input, cwd));
      // Outside the lane: starting a dev server and capturing pages takes a while, and other cards go on meanwhile.
      const attached = review && proof ? await proof.attach(dir, card) : [];
      return { card, changes: [...changes, ...attached] };
    },
  };
}

export type CardReport = ReturnType<typeof createCardReport>;
