/**
 * The shared setup for the STORY-51 draft review tests: a real git repository, scanner, card actions, draft writer and
 * review. The only fakes are the clock and, where a test sets `f.diskWrite`, the disk write.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { parseCard, type Card, type DraftInput } from "@featra/work-format";
import { writeAtomic } from "../src/card-actions.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createDraftReview, type DraftReview } from "../src/draft-review.ts";
import { createDraftWriter, type DraftWriter } from "../src/draft-writer.ts";
import { gitEnv } from "../src/git-run.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

export const clock = new Date("2026-11-10T09:30:00Z");

export const input: DraftInput = {
  feature: { title: "Shaping", description: "Talk a feature through." },
  stories: [
    { id: null, title: "One", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] },
    { id: null, title: "Two", story: "As a builder, I review.", criteria: ["It reviews"], tasks: ["Build"] },
  ],
};

export const lines = (text: string) => text.split(/\r?\n/).filter(Boolean);

export interface Fixture {
  scanner: ReturnType<typeof createScanner>;
  writer: DraftWriter;
  review: DraftReview;
  repo: CardRepo;
  lane: ReturnType<typeof createCardLane>;
  /** When set, replaces the disk write of the approved feature. */
  diskWrite: ((file: string, text: string) => Promise<void>) | null;
  /** When set, replaces the review's scan (for tests that change the disk between the scan and the write). */
  scan: ((dir: string) => ReturnType<ReturnType<typeof createScanner>["scan"]>) | null;
  /** When set, runs when the review reads the clock: a way to change the disk in the middle of an approve. */
  onNow: (() => void) | null;
}

/** Registers the per-test setup and teardown; the returned object is filled in before each test. */
export function draftFixture(folder = "main"): Fixture & ReturnType<typeof helpers> {
  const f = {} as Fixture;
  beforeEach(async () => {
    f.diskWrite = null;
    f.scan = null;
    f.onNow = null;
    f.scanner = createScanner(createRepoGit());
    f.lane = createCardLane();
    f.writer = createDraftWriter({ scan: f.scanner.scan, now: () => clock, lane: f.lane });
    f.repo = await cardRepo(folder);
    f.repo.git(f.repo.main, "config", "user.name", "Test");
    f.repo.git(f.repo.main, "config", "user.email", "test@example.invalid");
    f.repo.git(f.repo.main, "config", "commit.gpgsign", "false");
    await f.repo.write(f.repo.main, card("FEAT-1", "feature", null, "done"));
    writeFileSync(join(f.repo.main, "README.md"), "hello\n");
    f.repo.commit(f.repo.main, "plan");
    f.review = createDraftReview({
      scan: (dir) => (f.scan ?? f.scanner.scan)(dir),
      now: () => {
        f.onNow?.();
        return clock;
      },
      lane: f.lane,
      write: (file, text) => (f.diskWrite ?? writeAtomic)(file, text),
    });
  });
  afterEach(async () => {
    await f.scanner.close();
    await f.repo.dispose();
  });
  return Object.assign(f, helpers(f));
}

function helpers(f: Fixture) {
  const cardsDir = () => join(f.repo.main, ".featra", "cards");
  const files = async () => (await readdir(cardsDir())).filter((n) => !n.startsWith("FEAT-1-")).toSorted();
  const read = async (id: string): Promise<Card> => {
    const name = (await readdir(cardsDir())).find((n) => n.startsWith(`${id}-`)) ?? "";
    return parseCard(await readFile(join(cardsDir(), name), "utf8"));
  };
  const status = () =>
    lines(execFileSync("git", ["status", "--porcelain"], { cwd: f.repo.main, encoding: "utf8", env: gitEnv() }));
  const head = () => f.repo.git(f.repo.main, "rev-parse", "HEAD");
  const commitCount = () => Number(f.repo.git(f.repo.main, "rev-list", "--count", "HEAD"));
  const inCommit = () => lines(f.repo.git(f.repo.main, "show", "--name-only", "--format=", "HEAD")).toSorted();
  const hook = (body: string) => {
    const file = join(f.repo.main, ".git", "hooks", "pre-commit");
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  };
  /** A draft of two stories, with the second one then cancelled by a revision. */
  async function draftWithCancelled() {
    const made = await f.writer.draft(f.repo.main, "chat-1", input);
    const [one, two] = made.stories as [string, string];
    await f.writer.draft(f.repo.main, "chat-1", { ...input, stories: [{ ...input.stories[0]!, id: one }] });
    return { feature: made.feature, one, two };
  }
  const draft = async () => (await f.writer.draft(f.repo.main, "chat-1", input)).feature;
  /** A story the user added to `feature` by hand during review, untracked in main's checkout. */
  async function addStory(feature: string, id = "STORY-90", stage = "New") {
    await f.repo.write(f.repo.main, card(id, "story", feature, stage));
    return id;
  }
  return { cardsDir, files, read, status, head, commitCount, inCommit, hook, draftWithCancelled, draft, addStory };
}
