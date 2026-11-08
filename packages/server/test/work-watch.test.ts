import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { createRepoGit, type RepoGit } from "../src/repo-git.ts";
import { createWorkWatches } from "../src/work-watch.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

/** The shared per-folder watch (ADR 0016), on a real repository, the real git and the real file watcher. */
const real = createRepoGit();
/** Every call the scans make to git. */
const gitCalls: string[] = [];
const counted =
  <A extends unknown[], R>(name: string, f: (...args: A) => R) =>
  (...args: A) => {
    gitCalls.push(name);
    return f(...args);
  };
const git: RepoGit = {
  paths: counted("paths", real.paths),
  worktrees: counted("worktrees", real.worktrees),
  branches: counted("branches", real.branches),
  cardFiles: counted("cardFiles", real.cardFiles),
  blobs: counted("blobs", real.blobs),
  restore: counted("restore", real.restore),
};
const scanner = createScanner(git);
const logged: string[] = [];
const watches = createWorkWatches(scanner, (m) => logged.push(m));
let repo: CardRepo;

const features = (list: WorkList) => list.epics.flatMap((e) => e.features.map((f) => f.title));
const titles = (list: WorkList) => list.epics.flatMap((e) => e.features.flatMap((f) => f.stories.map((s) => s.title)));

/** A listener that keeps what it hears; `next(ms)` waits from now for the next list. */
function hearing() {
  const lists: WorkList[] = [];
  let wake: (() => void) | undefined;
  return {
    listener: (list: WorkList) => {
      lists.push(list);
      wake?.();
    },
    next: (ms: number) =>
      new Promise<WorkList>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No list in ${ms} ms`)), ms);
        wake = () => {
          const list = lists.shift();
          if (!list) return;
          clearTimeout(timer);
          resolve(list);
        };
        wake();
      }),
  };
}

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
});

afterAll(async () => {
  watches.close();
  await scanner.close();
  await repo.dispose();
});

describe("work watches", () => {
  it("keeps watching for a listener that joined while the last other listener stopped (BUG-5)", async () => {
    // A pane's socket closes while another opens on the same folder: the old watch stops while the new one's first
    // scan is still running. The new listener must still hear later edits.
    const leaving = await watches.watch(repo.main, () => {});
    const joiner = hearing();
    const joining = watches.watch(repo.main, joiner.listener);
    leaving.stop();
    const { stop } = await joining;
    try {
      await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Edited after the handover" }));
      expect(titles(await joiner.next(1000))).toEqual(["Edited after the handover"]);
    } finally {
      stop();
    }
    expect(logged).toEqual([]);
  });

  it("rescans a card edit from disk alone, without running git", async () => {
    const heard = hearing();
    const { stop } = await watches.watch(repo.main, heard.listener);
    try {
      gitCalls.length = 0;
      await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Edited on disk" }));
      expect(titles(await heard.next(1000))).toEqual(["Edited on disk"]);
      expect(gitCalls).toEqual([]);
    } finally {
      stop();
    }
    expect(logged).toEqual([]);
  });

  it("asks git again when a branch changes", async () => {
    // A feature branch with its own card, made and then removed before the watch, so only its ref comes back.
    repo.git(repo.main, "checkout", "-q", "-b", "feature/2");
    await repo.write(repo.main, card("FEAT-2", "feature", null, "draft"));
    repo.commit(repo.main, "feature 2");
    const tip = repo.git(repo.main, "rev-parse", "HEAD");
    repo.git(repo.main, "checkout", "-q", "main");
    repo.git(repo.main, "branch", "-q", "-D", "feature/2");

    const heard = hearing();
    const { list, stop } = await watches.watch(repo.main, heard.listener);
    try {
      expect(features(list)).toEqual(["FEAT-1"]);
      repo.git(repo.main, "branch", "feature/2", tip);
      // A full git rescan, which STORY-3's 1 s for card edits doesn't cover: it takes up to about 3 s on a loaded PC.
      expect(features(await heard.next(5000)).toSorted()).toEqual(["FEAT-1", "FEAT-2"]);
    } finally {
      stop();
    }
    expect(logged).toEqual([]);
  });
});
