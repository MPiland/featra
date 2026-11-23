/**
 * STORY-69 through the server's API, as the window calls it: `review.watch` for a feature with a merged Done story, a
 * story in progress in its worktree and a bug. Real services, scanner, watches, cards and git (the diff stats are
 * git's own); the summary is written by the real writer. Only the platform is faked: GitHub (`gh` and a bare remote
 * on disk whose path names github.com) and the clock.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendHistory,
  DEFAULT_CONFIG,
  FEATURE_END_MESSAGES,
  mergeCommitMessage,
  newCard,
  provenEvent,
  ranEvent,
  recordEvidence,
  setStatus,
  toIso,
  withCheckEvidence,
  type Card,
  type FeatureReview,
} from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import type { Connection } from "../src/api.ts";
import { createFeatureSummary } from "../src/feature-summary.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createServices } from "../src/services.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { FAKE_GH_TIMEOUT_MS, fakeGh, type FakeGh } from "./fake-gh.ts";
import { manualClock } from "./manual-clock.ts";
import { until } from "./until.ts";

const FEATURE = "feature/1-review";
const DONE = "featra/story-1-done";
const WIP = "featra/story-2-wip";
const CI_RUN = "https://github.com/acme/app/actions/runs/99";
const CI_RUN_2 = "https://github.com/acme/app/actions/runs/100";
const AT = "2026-11-02T00:00:00Z";

let repo: CardRepo;
let gh: FakeGh;
let services: ReturnType<typeof createServices>;
let scanner: ReturnType<typeof createScanner>;
let wip: string;
const pushed: { event: string; data: unknown }[] = [];
const connection: Connection = {
  push: (event, _watch, data) => void pushed.push({ event, data }),
  keep: () => {},
  unwatch: () => false,
};
const ask = (method: string, params: unknown) =>
  services.api(method as Parameters<typeof services.api>[0], params, 1, connection);
const review = () => pushed.findLast((p) => p.event === "review.view")?.data as FeatureReview | null | undefined;
const item = (r: FeatureReview | null | undefined, id: string) =>
  [...(r?.stories ?? []), ...(r?.bugs ?? [])].find((i) => i.view.id === id);

const story = (id: string, title: string, status: string, extra: Partial<Card> = {}): Card => ({
  ...setStatus(card(id, "story", "FEAT-1", "Ready"), status, "session:chat-9", AT),
  title,
  description: `As a reviewer, I want ${title.toLowerCase()}.`,
  ...extra,
});

/** STORY-1: Done and merged by its PR, its first criterion proven by a CI run, its second linked to a test only. */
const doneStory = () => {
  let c = story("STORY-1", "See the summary", "Done", {
    pr: "https://github.com/acme/app/pull/7",
    branch: DONE,
    acs: [
      { text: "Shows the summary", done: true, test: "test/a.test.ts::summary > shows" },
      { text: "Shows the diff", done: false, test: "test/a.test.ts::summary > diff" },
    ],
  });
  c = recordEvidence(c, provenEvent(1), "system", AT);
  c = recordEvidence(c, ranEvent(1, CI_RUN), "system", AT);
  return appendHistory(c, { at: AT, field: "merged", from: DONE, to: FEATURE, by: "system" });
};

/** STORY-2: in progress in its worktree, its criterion proven by a run on this computer. */
const wipStory = (status = "In Progress") => {
  const c = story("STORY-2", "See each proof", status, {
    branch: WIP,
    acs: [{ text: "Shows the proof", done: true, test: "test/b.test.ts::proof > shows" }],
  });
  return recordEvidence(recordEvidence(c, provenEvent(1), "system", AT), ranEvent(1, "local"), "system", AT);
};

/** Commits on a branch no worktree has checked out: a merge of `from` into it, as GitHub's PR merge makes. */
function mergeInto(branch: string, from: string, message: string) {
  const tree = resolve(repo.root, "merging");
  repo.git(repo.main, "worktree", "add", "-q", "--detach", tree, branch);
  repo.git(tree, "merge", "-q", "--no-ff", "-m", message, from);
  repo.git(repo.main, "update-ref", `refs/heads/${branch}`, repo.git(tree, "rev-parse", "HEAD"));
  repo.git(repo.main, "worktree", "remove", "--force", tree);
}

beforeEach(async () => {
  repo = await cardRepo();
  repo.git(repo.main, "config", "user.name", "Test");
  repo.git(repo.main, "config", "user.email", "test@example.invalid");
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  // The cards as the stories left them; each story's branch then changes code only, so git's counts are known.
  await repo.write(repo.main, doneStory());
  await repo.write(repo.main, wipStory());
  // Found after the feature started: scope added, and an open bug.
  await repo.write(
    repo.main,
    newCard({ id: "BUG-1", type: "bug", title: "Run link", status: "New", parent: "FEAT-1" }, "user", AT),
  );
  repo.commit(repo.main, "plan");
  const remote = join(repo.root, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  repo.git(remote, "init", "-q", "--bare");
  repo.git(repo.main, "remote", "add", "origin", remote);
  repo.git(repo.main, "branch", FEATURE);
  await repo.commitOn(FEATURE, async () => {}, "start");
  repo.git(repo.main, "branch", DONE, FEATURE);
  await repo.commitOn(
    DONE,
    async (tree) => {
      await mkdir(join(tree, "src"));
      await writeFile(join(tree, "src", "a.ts"), "one\ntwo\nthree\n");
    },
    "STORY-1: a",
  );
  mergeInto(FEATURE, DONE, "Merge pull request #7 from acme/featra/story-1-done");
  wip = repo.worktree(WIP, "story-2", FEATURE);
  await writeFile(join(wip, "src", "a.ts"), "one\n2\nthree\n");
  await writeFile(join(wip, "src", "b.ts"), "b\nb\n");
  repo.commit(wip, "STORY-2: b");
  gh = await fakeGh({ remote });
  clock = manualClock(Date.parse("2026-11-12T10:00:00Z"));
  const allowed = createAllowedProjects();
  allowed.set([repo.main]);
  services = createServices({
    allowed,
    log: () => {},
    now: clock.now,
    ghCommand: gh.command,
    ghTimeoutMs: FAKE_GH_TIMEOUT_MS,
    prTimers: clock.timers,
  });
  scanner = createScanner(createRepoGit());
  pushed.length = 0;
});
let clock: ReturnType<typeof manualClock>;
afterEach(async () => {
  await services?.close();
  await scanner?.close();
  await gh?.dispose();
  await repo.dispose();
});

describe("a feature's review screen (STORY-69)", () => {
  it("opens on a summary from the cards and git: each story's user story, stage, diff, criteria and proof (AC2, AC3)", async () => {
    await ask("review.watch", { dir: repo.main, id: "FEAT-1" });
    await until(() => review()?.diff != null && review()?.files != null && item(review(), "STORY-2")?.diff != null);
    const r = review();
    expect(r?.feature).toMatchObject({ id: "FEAT-1", type: "feature" });
    expect(r?.stories.map((s) => [s.view.id, s.view.status, s.tone])).toEqual([
      ["STORY-1", "Done", "done"],
      ["STORY-2", "In Progress", "active"],
    ]);
    expect(item(r, "STORY-1")?.view.description).toBe("As a reviewer, I want see the summary.");
    expect(r?.bugs.map((b) => b.view.id)).toEqual(["BUG-1"]);
    expect(r?.scope).toMatchObject({ added: 1, openBugs: 1 });
    expect(item(r, "BUG-1")?.added).toBe(true);
    expect(item(r, "STORY-1")?.added).toBe(false);
    expect(r?.breakdown).not.toBe("");
    // Files and lines per story, from git: the merged story's merge, the open one's branch, the feature against main.
    expect(item(r, "STORY-1")?.diff).toEqual({ files: 1, added: 3, removed: 0 });
    expect(item(r, "STORY-2")?.diff).toEqual({ files: 2, added: 3, removed: 1 });
    expect(r?.diff).toEqual({ files: 1, added: 3, removed: 0 });
    // Each criterion with its test, its result, and the run that proved it.
    expect(item(r, "STORY-1")?.view.acs).toEqual([
      { text: "Shows the summary", done: true, test: "test/a.test.ts::summary > shows", proof: "passed", run: CI_RUN },
      { text: "Shows the diff", done: false, test: "test/a.test.ts::summary > diff", proof: "linked" },
    ]);
    expect(item(r, "STORY-2")?.view.acs[0]).toMatchObject({ proof: "passed", run: "local" });
  });

  it("links GitHub's Files changed for the feature and each story's PR, with the feature's checks (AC5)", async () => {
    await ask("review.watch", { dir: repo.main, id: "FEAT-1" });
    await until(() => review()?.files != null);
    const r = review();
    expect(r?.files).toBe(`https://github.com/acme/app/compare/main...${FEATURE}`);
    expect(item(r, "STORY-1")?.files).toBe("https://github.com/acme/app/pull/7/files");
    expect(item(r, "STORY-2")?.files).toBeNull();
    // Before the feature is accepted it has no checks of its own (ADR 0037): the screen says none ran yet.
    expect(r?.feature.checks).toBeUndefined();
  });

  it("shows the Dev Lead's summary once written, and updates live as a story moves (AC6, AC7)", async () => {
    const first = (await ask("review.watch", { dir: repo.main, id: "FEAT-1" })) as FeatureReview;
    expect(first.summary).toBeNull();
    const writer = createFeatureSummary({ scan: scanner.scan, now: clock.now });
    await writer.write(repo.main, { feature: "FEAT-1", summary: "Ready for review." }, "chat-1");
    await until(() => review()?.summary != null);
    expect(review()?.summary).toEqual({ text: "Ready for review.", at: toIso(clock.now()) });
    await repo.write(wip, wipStory("In Review"));
    await until(() => item(review(), "STORY-2")?.view.status === "In Review");
    expect(review()?.summary?.text).toBe("Ready for review.");
  });

  it("pushes a story's new proof and its run, as the evidence writer records them, without reopening (AC7)", async () => {
    // STORY-2's card in its worktree, which owns it, with a second criterion its PR's CI hasn't proven yet.
    const linked = { text: "Shows the run", done: false, test: "test/b.test.ts::proof > run" };
    const before = { ...wipStory(), pr: "https://github.com/acme/app/pull/8", acs: [...wipStory().acs, linked] };
    await repo.write(wip, before);
    await ask("review.watch", { dir: repo.main, id: "FEAT-1" });
    await until(() => item(review(), "STORY-2")?.view.acs[1]?.proof === "linked");
    const head = repo.git(wip, "rev-parse", "HEAD");
    const outcome = { passed: null, acs: [{ ac: 2, passed: true, run: CI_RUN_2 }], head };
    await repo.write(wip, withCheckEvidence(before, DEFAULT_CONFIG, outcome, "system", AT));
    await until(() => item(review(), "STORY-2")?.view.acs[1]?.proof === "passed");
    expect(item(review(), "STORY-2")?.view.acs[1]).toEqual({ ...linked, proof: "passed", run: CI_RUN_2 });
  });
  it("counts a commit pushed to an open story's branch that no worktree has checked out (AC2)", async () => {
    const OPEN = "featra/story-3-open";
    await repo.write(repo.main, story("STORY-3", "Count a push", "In Progress", { branch: OPEN }));
    repo.commit(repo.main, "story 3");
    repo.git(repo.main, "branch", OPEN, FEATURE);
    await repo.commitOn(OPEN, (tree) => writeFile(join(tree, "src", "c.ts"), "c\n"), "STORY-3: c");
    await ask("review.watch", { dir: repo.main, id: "FEAT-1" });
    await until(() => item(review(), "STORY-3")?.diff != null);
    expect(item(review(), "STORY-3")?.diff).toEqual({ files: 1, added: 1, removed: 0 });
    await repo.commitOn(OPEN, (tree) => writeFile(join(tree, "src", "d.ts"), "d\nd\n"), "STORY-3: d");
    await until(() => item(review(), "STORY-3")?.diff?.files === 2);
    expect(item(review(), "STORY-3")?.diff).toEqual({ files: 2, added: 3, removed: 0 });
  });

  it("counts every round of a story merged, sent back and merged again (AC2)", async () => {
    await repo.commitOn(DONE, (tree) => writeFile(join(tree, "src", "e.ts"), "e\ne\n"), "STORY-1: e");
    mergeInto(FEATURE, DONE, mergeCommitMessage({ id: "STORY-1", title: "See the summary" }));
    await ask("review.watch", { dir: repo.main, id: "FEAT-1" });
    await until(() => item(review(), "STORY-1")?.diff != null);
    expect(item(review(), "STORY-1")?.diff).toEqual({ files: 2, added: 5, removed: 0 });
  });

  it("carries Approve, off with the unfinished items first, and refuses it (STORY-70 AC2)", async () => {
    await ask("review.watch", { dir: repo.main, id: "FEAT-1" });
    await until(() => review()?.approval != null);
    const reason = FEATURE_END_MESSAGES.unfinished("FEAT-1", 2);
    expect(review()?.approval).toEqual({ step: "approve", ready: false, reason, base: "main" });
    await expect(ask("feature.approve", { dir: repo.main, id: "FEAT-1" })).rejects.toThrow(reason);
  });

  it("is null for an id that isn't a feature", async () => {
    expect(await ask("review.watch", { dir: repo.main, id: "STORY-1" })).toBeNull();
  });
});
