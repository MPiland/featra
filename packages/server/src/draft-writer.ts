/**
 * Writes what an agent drafts (STORY-8, ADR 0021). The cards are read from their owners through the watches' scan,
 * `planDraft` (work-format) says what to write, and the files go to main's checkout, uncommitted, through the same
 * atomic write as the card pane. Calls run one at a time in the server's card lane, so two chats drafting at once never
 * allocate the same ID. A call changes every card or none: the owners are resolved and the old files read before the
 * first write, and a failure puts the old files back and removes the new ones. A new card file is created exclusively,
 * so a taken ID never overwrites a card; the call allocates again.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { createCardLane, createExclusive, isCollision, type CardLane } from "./card-lane.ts";
import { locationKey } from "./collect.ts";
import type { Scan } from "./work-scan.ts";

export interface DraftWriterDeps {
  /** Scans a folder, before the write and again after, so every watcher of the Work list hears the draft. */
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. A writer on its own gets its own. */
  lane?: CardLane;
  /** The disk, for tests to make a write fail. */
  io?: {
    write?: (file: string, text: string) => Promise<void>;
    create?: (file: string, text: string) => Promise<void>;
  };
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

const ATTEMPTS = 10;

/** Whether the folder already has a card file for `id`, under whatever name: a taken ID, even if the scan missed it. */
const hasCardFor = async (file: string, id: string) =>
  (await readdir(dirname(file))).some((name) => name.startsWith(`${id}-`));

interface Job {
  file: string;
  text: string;
  created: boolean;
  id: string;
}

export function createDraftWriter({ scan: scanDir, now, lane = createCardLane(), io }: DraftWriterDeps): DraftWriter {
  const write = io?.write ?? writeAtomic;
  const create = io?.create ?? createExclusive;

  /** Writes every job or none: a collision on a new file is returned for a new attempt, any other failure thrown. */
  async function writeAll(jobs: readonly Job[]): Promise<string | null> {
    const old = new Map<string, string>();
    for (const job of jobs.filter((j) => !j.created)) old.set(job.file, await readFile(job.file, "utf8"));
    const made: string[] = [];
    const done: string[] = [];
    let collided: string | null = null;
    try {
      for (const job of jobs) {
        if (job.created) {
          if (await hasCardFor(job.file, job.id)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
          await create(job.file, job.text);
          made.push(job.file);
        } else {
          await write(job.file, job.text);
          done.push(job.file);
        }
      }
      return null;
    } catch (err) {
      if (!isCollision(err)) throw err;
      collided = jobs.find((j) => j.created && !made.includes(j.file))?.id ?? null;
      return collided;
    } finally {
      if (collided !== null || made.length + done.length < jobs.length) {
        await Promise.all(made.map((file) => rm(file, { force: true })));
        await Promise.all(done.map((file) => writeAtomic(file, old.get(file) ?? "")));
      }
    }
  }

  async function run(dir: string, chat: string, input: DraftInput): Promise<DraftResult> {
    const scan = await scanDir(dir);
    if (!scan) throw new ApiError(DRAFT_MESSAGES.notProject);
    const main = scan.collected.roots.get(locationKey(MAIN));
    if (!main) throw new ApiError(DRAFT_MESSAGES.noMain);
    const cards = scan.resolution.cards;
    const taken: string[] = [];
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const plan = planDraft(input, {
        cards: cards.map((c) => c.card),
        config: scan.collected.config,
        chat,
        at: toIso(now()),
        taken,
      });
      if (!plan.ok) throw new ApiError(plan.error);
      // Every owner is found before the first write, so a card that can't be written stops the call whole.
      const jobs = plan.value.writes.map(({ card, created }): Job => {
        const owned = cards.find((c) => c.card.id === card.id);
        const root = created ? main : scan.collected.roots.get(locationKey(owned?.owner ?? MAIN));
        if (!root) throw new ApiError(`${card.id} is owned by a branch that isn't checked out.`);
        const path = created || !owned ? `${CARDS_DIR}/${cardFileName(card)}` : owned.path;
        return { file: fileIn(root, path), text: serializeCard(card), created, id: card.id };
      });
      let collided: string | null;
      try {
        collided = await writeAll(jobs);
      } catch (err) {
        throw err instanceof ApiError ? err : new ApiError(`Can't save the draft: ${errorMessage(err)}`);
      }
      if (collided === null) {
        await scanDir(dir);
        return plan.value.result;
      }
      taken.push(collided);
    }
    throw new ApiError("Can't save the draft: its IDs keep colliding with cards on disk.");
  }

  return { draft: (dir, chat, input) => lane.exclusive(() => run(dir, chat, input)) };
}
