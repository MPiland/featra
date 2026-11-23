/**
 * Something a listener's pick reads besides the scan (the review screen's diff counts, read from git in the
 * background, STORY-69) changed: `repush` lets every listener hear the last scan again, with no new scan. Real
 * scanner, watches, cards and git; the scanner only counts its scans.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
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

describe("re-pushing a watch", () => {
  it("re-runs each listener's pick against the last scan, without scanning again", async () => {
    let scans = 0;
    const scanner = { ...real, scan: (...args: Parameters<typeof real.scan>) => (scans++, real.scan(...args)) };
    const watches = createWorkWatches(scanner, () => {});
    let outside = "before";
    const heard: string[] = [];
    const { value, stop } = await watches.observe(
      repo.main,
      (scan) => `${scan?.list.epics.length ?? -1}:${outside}`,
      (v) => heard.push(v),
    );
    try {
      expect(value).toBe("1:before");
      const before = scans;
      outside = "after";
      watches.repush(repo.main);
      await until(() => heard.length > 0);
      expect(heard).toEqual(["1:after"]);
      expect(scans).toBe(before);
    } finally {
      stop();
      watches.close();
    }
  });

  it("does nothing for a folder nobody watches", () => {
    const watches = createWorkWatches(real, () => {});
    expect(() => watches.repush(repo.main)).not.toThrow();
    watches.close();
  });
});
