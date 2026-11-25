/**
 * At start the server's services each watch every project, then the page asks for its own watch, and actions ask for
 * scans of their own (BUG-44). Each used to queue a full scan behind the others; on Windows, where every git process
 * costs hundreds of ms, the page's first answers waited out several scans in a row. Asks that come while a scan runs,
 * watchers' first answers and actions alike, now share the next one, which still starts after they asked. Real scanner, watches, cards and
 * git; the scanner only holds its scans until the test lets them go, and counts them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner, type Scanner } from "../src/work-scan.ts";
import { createWorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { until } from "./until.ts";

let repo: CardRepo;
const real = createScanner(createRepoGit());

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  repo.commit(repo.main, "plan");
});

afterAll(async () => {
  await real.close();
  await repo.dispose();
});

/**
 * The real scanner, whose scans wait until `open` is called. `started` counts the scans asked for, `finished` those
 * done: a rescan the watch starts itself may begin as an answer goes out, but not finish before it.
 */
function heldScanner() {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let started = 0;
  let finished = 0;
  const scanner: Scanner = {
    ...real,
    async scan(dir, reuse, onPaths) {
      started += 1;
      await gate;
      try {
        return await real.scan(dir, reuse, onPaths);
      } finally {
        finished += 1;
      }
    },
  };
  return { scanner, open, started: () => started, finished: () => finished };
}

const epics = (scan: { list: { epics: unknown[] } } | null) => scan?.list.epics.length ?? -1;
const features = (list: WorkList) => list.epics.flatMap((e) => e.features.map((f) => f.title));

describe("sharing scans (BUG-44)", () => {
  it("answers a new watcher with the scan after the one in flight, not after a scan of its own per earlier watcher", async () => {
    const held = heldScanner();
    const watches = createWorkWatches(held.scanner, () => {});
    const stops: (() => void)[] = [];
    try {
      // The services' watches at start: the first starts a scan, the rest come while it runs.
      const services = Array.from({ length: 5 }, () => watches.observe(repo.main, epics, () => {}));
      await until(() => held.started() === 1);
      let doneAtAnswer = -1;
      const page = watches
        .watch(repo.main, () => {})
        .then((w) => {
          doneAtAnswer = held.finished();
          return w;
        });
      held.open();
      const { list, stop } = await page;
      stops.push(stop);
      for (const s of await Promise.all(services)) {
        expect(s.value).toBe(1);
        stops.push(s.stop);
      }
      expect(list.epics).toHaveLength(1);
      expect(doneAtAnswer).toBe(2);
    } finally {
      for (const stop of stops) stop();
      watches.close();
    }
  });

  it("gives the actions that ask while a scan runs one scan between them, started after they asked", async () => {
    const held = heldScanner();
    const watches = createWorkWatches(held.scanner, () => {});
    const first = watches.observe(repo.main, epics, () => {});
    try {
      await until(() => held.started() === 1);
      // How many scans were done as each action had its answer.
      const doneAtAnswer: number[] = [];
      const actions = Array.from({ length: 3 }, () =>
        watches.scan(repo.main).then((scan) => {
          doneAtAnswer.push(held.finished());
          return scan;
        }),
      );
      held.open();
      const scans = await Promise.all(actions);
      expect(doneAtAnswer).toEqual([2, 2, 2]);
      for (const scan of scans) expect(epics(scan)).toBe(1);
    } finally {
      (await first).stop();
      watches.close();
    }
  });

  // Last: it adds a card.
  it("answers a new watcher with the cards as they are when it asks, though a scan that read them earlier runs", async () => {
    let read!: () => void;
    const hasRead = new Promise<void>((resolve) => (read = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let scans = 0;
    const scanner: Scanner = {
      ...real,
      async scan(dir, reuse, onPaths) {
        const scan = await real.scan(dir, reuse, onPaths);
        if (++scans === 1) {
          read();
          await released;
        }
        return scan;
      },
    };
    const watches = createWorkWatches(scanner, () => {});
    const first = watches.observe(repo.main, epics, () => {});
    try {
      await hasRead;
      await repo.write(repo.main, card("FEAT-2", "feature", null, "draft"));
      const page = watches.watch(repo.main, () => {});
      release();
      const { list, stop } = await page;
      stop();
      expect(features(list)).toEqual(["FEAT-1", "FEAT-2"]);
    } finally {
      (await first).stop();
      watches.close();
    }
  });
});
