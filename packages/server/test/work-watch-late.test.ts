import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { GIT_ASKED_MS, until } from "./until.ts";

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
      await until(() => heard.some((l) => titles(l)[0] === "Edited in the gap"), GIT_ASKED_MS);
    } finally {
      stop();
      watches.close();
    }
    expect(logged).toEqual([]);
  });
});
