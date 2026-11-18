import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkWatches, type WatchFolder } from "../src/work-watch.ts";
import { createScanner } from "../src/work-scan.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { countedGit } from "./counted-git.ts";
import { until } from "./until.ts";

/**
 * Every file watcher a watch opens is closed when the watch ends (BUG-6). On Windows an open watcher keeps its folder
 * from being deleted. Only `fs.watch` is faked, so the test can send a closed watcher's late event and error itself.
 */
interface FakeWatcher {
  path: string;
  recursive: boolean;
  closed: boolean;
  emitter: EventEmitter;
  hear: (type: string, name: string | null) => void;
}

const made: FakeWatcher[] = [];
const fakeWatch = ((path: string, options: { recursive?: boolean }, hear: FakeWatcher["hear"]) => {
  const emitter = new EventEmitter();
  const fake: FakeWatcher = { path, recursive: Boolean(options.recursive), closed: false, emitter, hear };
  made.push(fake);
  return Object.assign(emitter, {
    close: () => {
      fake.closed = true;
    },
  }) as unknown as FSWatcher;
}) as unknown as WatchFolder;

const scanner = createScanner(createRepoGit());
const logged: string[] = [];
let repo: CardRepo;

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  repo.commit(repo.main, "plan");
});

afterAll(async () => {
  await scanner.close();
  await repo.dispose();
});

describe("watch handles", () => {
  it("keeps a newer watcher when a closed one sends a late event and error, and closes every watcher at the end", async () => {
    const watches = createWorkWatches(scanner, (m) => logged.push(m), fakeWatch);
    const { stop } = await watches.watch(repo.main, () => {});
    const featra = join(repo.main, ".featra");
    const open = () => made.filter((w) => w.path === featra && w.recursive && !w.closed);
    const old = open()[0];
    expect(old).toBeDefined();

    // Windows names a deleted watched folder by its own absolute path: the watch closes that watcher and rescans,
    // and the rescan watches the folder again.
    old?.hear("rename", featra);
    expect(old?.closed).toBe(true);
    await until(() => open().length === 1);
    const newer = open()[0];

    // The closed watcher's error arrives late.
    old?.emitter.emit("error", new Error("EPERM"));
    stop();
    expect(newer?.closed).toBe(true);
    expect(made.filter((w) => !w.closed)).toEqual([]);
    watches.close();
    expect(logged).toEqual([]);
  });

  it("runs no scan queued on a watch after it closes, so the scanner's index can be deleted at once", async () => {
    const other = await cardRepo();
    await other.write(other.main, card("FEAT-1", "feature", null, "draft"));
    other.commit(other.main, "plan");
    const own = createScanner(createRepoGit());
    const watches = createWorkWatches(own, (m) => logged.push(m), fakeWatch);
    await watches.watch(other.main, () => {});
    // One scan in flight and one queued behind it when the watch closes.
    const scans = [watches.scan(other.main), watches.scan(other.main)];
    watches.close();
    await own.close();
    await Promise.allSettled(scans);
    // No retries: on Windows an index left open makes this EBUSY.
    await expect(rm(other.root, { recursive: true, force: true })).resolves.toBeUndefined();
    expect(logged).toEqual([]);
  });

  it("asks git again for an event on a git target that comes without a file name", async () => {
    const { git, calls } = countedGit();
    const own = createScanner(git);
    const watches = createWorkWatches(own, (m) => logged.push(m), fakeWatch);
    const { stop } = await watches.watch(repo.main, () => {});
    try {
      const common = join(repo.main, ".git");
      const worktrees = made.find((w) => w.path === join(common, "worktrees") && !w.closed);
      calls.length = 0;
      // Node doesn't promise a name; without one the event can't be ruled out (BUG-6).
      worktrees?.hear("rename", null);
      await until(() => calls.includes("worktrees"));
    } finally {
      stop();
      watches.close();
      await own.close();
    }
    expect(logged).toEqual([]);
  });
});
