import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import { writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { createRepoGit, type RepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type ScanPick, type WatchFolder } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { stagedScanner } from "./staged-scanner.ts";
import { until } from "./until.ts";

/**
 * A watch looks once more, after the settle delay, at a scan caught mid-change before anyone hears it (BUG-24 AC2,
 * BUG-25 AC1). The real scanner and git run on a real repository; only the moment of a write (a staged scanner), a
 * file watcher that never fires, and git failing the way a merge rewriting `.git/config` on Windows made it fail are
 * stood in.
 */
let repo: CardRepo;
const story = card("STORY-1", "story", "FEAT-1", "Ready");
const realGit = createRepoGit();
const LOCKED =
  "git rev-parse failed: warning: unable to access '.git/config': Permission denied\n" +
  "fatal: unknown error occurred while reading the configuration files";
let failures = 0;
/** The real git, but its next `failures` reads of the repository's paths fail as a locked config makes them. */
const flakyGit: RepoGit = {
  ...realGit,
  paths: async (dir) => {
    if (failures > 0) {
      failures -= 1;
      throw new Error(LOCKED);
    }
    return realGit.paths(dir);
  },
};
const real = createScanner(realGit);
const flaky = createScanner(flakyGit);
const logged: string[] = [];

const silentWatch = (() =>
  Object.assign(new EventEmitter(), { close: () => {} }) as unknown as FSWatcher) as unknown as WatchFolder;

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  await repo.write(repo.main, story);
  repo.commit(repo.main, "plan");
});

afterEach(async () => {
  failures = 0;
  logged.length = 0;
  await repo.write(repo.main, story);
});

afterAll(async () => {
  await real.close();
  await flaky.close();
  await repo.dispose();
});

const titles = (list: WorkList) => list.epics.flatMap((e) => e.features.flatMap((f) => f.stories.map((s) => s.title)));

describe("a card a writer has just emptied (BUG-24 AC2)", () => {
  it("is never published when the write finishes before the rescan", async () => {
    const staged = stagedScanner(real);
    const watches = createWorkWatches(staged.scanner, (m) => logged.push(m));
    const heard: WorkList[] = [];
    const { list, stop } = await watches.watch(repo.main, (l) => heard.push(l));
    try {
      expect(titles(list)).toEqual(["STORY-1"]);
      staged.stage("STORY-1", () => repo.write(repo.main, { ...story, title: "Saved" }));
      await writeFile(repo.file(repo.main, "STORY-1"), "");
      await until(() => heard.some((l) => titles(l)[0] === "Saved"));
      expect(staged.done()).toBe(true);
      expect(heard.map((l) => [titles(l), l.problems])).toEqual([[["Saved"], []]]);
    } finally {
      stop();
      watches.close();
    }
    expect(logged).toEqual([]);
  });

  it("is published as a problem when it is still unreadable after the rescan, and not looked at twice again", async () => {
    await writeFile(repo.file(repo.main, "STORY-1"), "");
    const counted = stagedScanner(real);
    const watches = createWorkWatches(counted.scanner, (m) => logged.push(m), silentWatch);
    const { list, stop } = await watches.watch(repo.main, () => {});
    try {
      expect(counted.calls()).toBe(2);
      expect(titles(list)).toEqual([]);
      expect(list.problems).toEqual([expect.stringMatching(/^Can't read \.featra\/cards\/STORY-1-card\.md in main: /)]);
      // The watchers it started ask for one more look (BUG-12); the card is broken the same way, so that is settled.
      await until(() => counted.calls() === 3);
      await watches.scan(repo.main);
      expect(counted.calls()).toBe(4);
    } finally {
      stop();
      watches.close();
    }
  });
});

interface Seen {
  branches: string[];
  stories: string[];
  problems: string[];
}
const seen: ScanPick<Seen> = (scan, list) => ({
  branches: scan?.collected.git.branches.map((b) => b.name) ?? [],
  stories: titles(list),
  problems: list.problems,
});

describe("a scan that fails (BUG-25 AC1)", () => {
  it("is tried once more when that settles, and a second try that works is all anyone hears", async () => {
    const watches = createWorkWatches(flaky, (m) => logged.push(m));
    const heard: Seen[] = [];
    const { stop } = await watches.observe(repo.main, seen, (v) => heard.push(v));
    try {
      failures = 1;
      repo.git(repo.main, "branch", "feature/8");
      await until(() => heard.some((v) => v.branches.includes("feature/8")));
      expect(failures).toBe(0);
      expect(heard.map((v) => v.problems)).toEqual(heard.map(() => []));
      expect(heard.map((v) => v.stories)).toEqual(heard.map(() => ["STORY-1"]));
    } finally {
      stop();
      watches.close();
    }
    expect(logged).toEqual([`work scan failed: ${LOCKED}`]);
  });

  it("keeps the last good list with the problem when it fails again, and still hears git after", async () => {
    const watches = createWorkWatches(flaky, (m) => logged.push(m));
    const heard: Seen[] = [];
    const { stop } = await watches.observe(repo.main, seen, (v) => heard.push(v));
    try {
      failures = 2;
      repo.git(repo.main, "branch", "feature/9");
      await until(() => heard.length > 0);
      expect(heard[0]).toEqual({
        branches: expect.not.arrayContaining(["feature/9"]),
        stories: ["STORY-1"],
        // Only the first line of git's stderr is shown; the log keeps all of it.
        problems: [`Can't read the cards: ${LOCKED.split("\n")[0]}`],
      });
      // Its file watchers were kept: the next change to git is still heard, and the problem goes.
      repo.git(repo.main, "branch", "feature/10");
      await until(() => heard.some((v) => v.branches.includes("feature/10")));
      expect(heard.at(-1)).toEqual({
        branches: expect.arrayContaining(["feature/9", "feature/10"]),
        stories: ["STORY-1"],
        problems: [],
      });
    } finally {
      stop();
      watches.close();
    }
  });
});
