/**
 * Writes what an agent drafts (STORY-8, ADR 0021). The cards are read from their owners through the watches' scan,
 * `planDraft` (work-format) says what to write, and the files go to main's checkout, uncommitted, through the same
 * atomic write as the card pane. Calls run one at a time, so two chats drafting at once never allocate the same ID:
 * each reads the cards, allocates and writes before the next reads.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  cardFileName,
  CARDS_DIR,
  errorMessage,
  MAIN,
  planDraft,
  serializeCard,
  toIso,
  type DraftInput,
  type DraftResult,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { writeAtomic } from "./card-actions.ts";
import { locationKey } from "./collect.ts";
import type { Scan } from "./work-scan.ts";

export interface DraftWriterDeps {
  /** Scans a folder, before the write and again after, so every watcher of the Work list hears the draft. */
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
}

export const DRAFT_MESSAGES = {
  notProject: "This folder isn't a Featra project in git.",
  noMain: "Main isn't checked out, and drafts live there. Check it out first.",
} as const;

const fileIn = (root: string, path: string) => join(root, ...path.split("/"));

export interface DraftWriter {
  /** Drafts `input` for `chat`, working from `dir`: a new Draft feature, or the chat's open draft revised in place. */
  draft: (dir: string, chat: string, input: DraftInput) => Promise<DraftResult>;
}

export function createDraftWriter({ scan: scanDir, now }: DraftWriterDeps): DraftWriter {
  let queue: Promise<unknown> = Promise.resolve();

  async function run(dir: string, chat: string, input: DraftInput): Promise<DraftResult> {
    const scan = await scanDir(dir);
    if (!scan) throw new ApiError(DRAFT_MESSAGES.notProject);
    const main = scan.collected.roots.get(locationKey(MAIN));
    if (!main) throw new ApiError(DRAFT_MESSAGES.noMain);
    const cards = scan.resolution.cards;
    const plan = planDraft(input, {
      cards: cards.map((c) => c.card),
      config: scan.collected.config,
      chat,
      at: toIso(now()),
    });
    if (!plan.ok) throw new ApiError(`Not drafted. ${plan.error}`);

    const made: string[] = [];
    try {
      for (const { card, created } of plan.value.writes) {
        const owned = cards.find((c) => c.card.id === card.id);
        const root = created ? main : scan.collected.roots.get(locationKey(owned?.owner ?? MAIN));
        if (!root) throw new ApiError(`${card.id} is owned by a branch that isn't checked out.`);
        const path = created || !owned ? `${CARDS_DIR}/${cardFileName(card)}` : owned.path;
        const file = fileIn(root, path);
        await writeAtomic(file, serializeCard(card));
        if (created) made.push(file);
      }
    } catch (err) {
      // A draft is all or nothing for the cards it made: none is left without its feature.
      await Promise.all(made.map((file) => rm(file, { force: true })));
      throw err instanceof ApiError ? err : new ApiError(`Can't save the draft: ${errorMessage(err)}`);
    }
    await scanDir(dir);
    return plan.value.result;
  }

  return {
    draft(dir, chat, input) {
      const turn = queue.then(() => run(dir, chat, input));
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
}
