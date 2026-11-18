import { watch } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { until } from "./until.ts";

/**
 * An edit that lands after a watch's first scan read the files but before its file watchers start is heard by no
 * watcher, so the list stayed stale until the next unrelated event (BUG-12). The scanner here makes that edit happen
 * at the exact moment: right after the real scan returns, as the watch is about to start watching.
 */
let repo: CardRepo;
const real = createScanner(createRepoGit());
const logged: string[] = [];

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
});

afterAll(async () => {
  await real.close();
  await repo.dispose();
});

const features = (list: WorkList) => list.epics.flatMap((e) => e.features.map((f) => f.title));
const titles = (list: WorkList) => list.epics.flatMap((e) => e.features.flatMap((f) => f.stories.map((s) => s.title)));

describe("a watch's first scan", () => {
  it("still hears an edit made after it read the files and before its watchers started", async () => {
    let edited = false;
    const scanner = {
      ...real,
      scan: async (dir: string, reuse?: Parameters<typeof real.scan>[1]) => {
        const scan = await real.scan(dir, reuse);
        if (!edited) {
          edited = true;
          await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Edited in the gap" }));
        }
        return scan;
      },
    };
    const watches = createWorkWatches(scanner, (m) => logged.push(m));
    const heard: WorkList[] = [];
    const { list, stop } = await watches.watch(repo.main, (l) => heard.push(l));
    try {
      expect(titles(list)).toEqual(["STORY-1"]);
      await until(() => heard.some((l) => titles(l)[0] === "Edited in the gap"));
    } finally {
      stop();
      watches.close();
    }
    expect(logged).toEqual([]);
  });

  it("asks git again for a branch made just before its git watchers started (BUG-24 review)", async () => {
    // A feature branch with its own card, made and then removed before the watch, so only its ref comes back.
    repo.git(repo.main, "checkout", "-q", "-b", "feature/2");
    await repo.write(repo.main, card("FEAT-2", "feature", null, "draft"));
    repo.commit(repo.main, "feature 2");
    const tip = repo.git(repo.main, "rev-parse", "HEAD");
    repo.git(repo.main, "checkout", "-q", "main");
    repo.git(repo.main, "branch", "-q", "-D", "feature/2");
    // The real file watcher, with the branch made the moment before the branch watcher starts: no watcher hears it.
    let made = false;
    const watchFolder = ((...args: Parameters<typeof watch>) => {
      if (!made && String(args[0]) === join(repo.main, ".git", "refs", "heads")) {
        made = true;
        repo.git(repo.main, "branch", "feature/2", tip);
      }
      return watch(...args);
    }) as typeof watch;
    const watches = createWorkWatches(real, (m) => logged.push(m), watchFolder);
    const heard: WorkList[] = [];
    const { list, stop } = await watches.watch(repo.main, (l) => heard.push(l));
    try {
      expect(made).toBe(true);
      expect(features(list)).toEqual(["FEAT-1"]);
      await until(() => heard.some((l) => features(l).includes("FEAT-2")));
    } finally {
      stop();
      watches.close();
    }
    expect(logged).toEqual([]);
  });
});
