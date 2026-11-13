/**
 * STORY-11 through the server's API, as the window calls it: Project settings' PR settings and local-mode line
 * (`checks.load`, `checks.set`), Create PR (`story.createPr`), the PR on `card.watch` and `work.watch`, and the focus
 * refresh (`prs.refresh`). Real services, git and cards; GitHub, the remote and the clock are faked.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serializeCard, type CardView, type ChecksView, type WorkList } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import type { Connection } from "../src/api.ts";
import { createServices } from "../src/services.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeGh, type FakeGh } from "./fake-gh.ts";
import { manualClock, MINUTE } from "./manual-clock.ts";
import { FEATURE_BRANCH, STORY_BRANCH, storyCard } from "./story-prs-world.ts";
import { until } from "./until.ts";

let repo: CardRepo;
let gh: FakeGh;
let services: ReturnType<typeof createServices>;
let clock: ReturnType<typeof manualClock>;
let tree: string;
const pushed: { event: string; data: unknown }[] = [];
const connection: Connection = {
  push: (event, _watch, data) => void pushed.push({ event, data }),
  keep: () => {},
  unwatch: () => false,
};
const ask = (method: string, params: unknown) =>
  services.api(method as Parameters<typeof services.api>[0], params, 1, connection);
const latest = (event: string): unknown => pushed.findLast((p) => p.event === event)?.data;
const cardView = () => latest("card.view") as CardView | undefined;
/** STORY-1's row in the last Work list pushed. */
const story = () =>
  (latest("work.list") as WorkList | undefined)?.epics
    .flatMap((e) => e.features.flatMap((f) => f.stories))
    .find((s) => s.id === "STORY-1");

beforeEach(async () => {
  repo = await cardRepo();
  repo.git(repo.main, "config", "user.name", "Test");
  repo.git(repo.main, "config", "user.email", "test@example.invalid");
  await writeFile(join(repo.main, ".featra", "config.yaml"), "version: 1\nopenStoryPrs: false\n");
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, storyCard("Ready"));
  repo.commit(repo.main, "plan");
  const remote = join(repo.root, "github.com", "acme", "app.git").replace(/\\/g, "/");
  await mkdir(remote, { recursive: true });
  repo.git(remote, "init", "-q", "--bare");
  repo.git(repo.main, "remote", "add", "origin", remote);
  repo.git(repo.main, "branch", FEATURE_BRANCH);
  tree = repo.worktree(STORY_BRANCH, "story-1", FEATURE_BRANCH);
  await writeFile(join(tree, ".featra", "cards", "STORY-1-card.md"), serializeCard(storyCard("In Review")));
  gh = await fakeGh();
  clock = manualClock(Date.parse("2026-11-12T10:00:00Z"));
  const allowed = createAllowedProjects();
  allowed.set([repo.main]);
  services = createServices({ allowed, log: () => {}, now: clock.now, ghCommand: gh.command, prTimers: clock.timers });
  pushed.length = 0;
});
afterEach(async () => {
  await services.close();
  await gh.dispose();
  await repo.dispose();
});

describe("Project settings (AC1, AC2, AC4)", { timeout: 60_000 }, () => {
  it("say GitHub is usable and change the PR settings in the project's config", async () => {
    const shown = (await ask("checks.load", { dir: repo.main })) as ChecksView;
    expect(shown).toMatchObject({ github: { usable: true, missing: null }, openStoryPrs: false, prRefreshMinutes: 2 });
    const set = (await ask("checks.set", {
      dir: repo.main,
      patch: { openStoryPrs: true, prRefreshMinutes: 10 },
    })) as ChecksView;
    expect(set).toMatchObject({ openStoryPrs: true, prRefreshMinutes: 10, error: null });
    const config = await readFile(join(repo.main, ".featra", "config.yaml"), "utf8");
    expect(config).toContain("openStoryPrs: true");
    expect(config).toContain("prRefreshMinutes: 10");
  });

  it("refuse an interval outside 1 to 60 minutes", async () => {
    const refused = "Expected { dir, patch }.";
    await expect(ask("checks.set", { dir: repo.main, patch: { prRefreshMinutes: 0 } })).rejects.toThrow(refused);
    await expect(ask("checks.set", { dir: repo.main, patch: { prRefreshMinutes: 61 } })).rejects.toThrow(refused);
    await expect(ask("checks.set", { dir: repo.main, patch: { openStoryPrs: "yes" } })).rejects.toThrow(refused);
  });
});

describe("Create PR and the PR chip's data (AC2, AC3, AC4)", { timeout: 60_000 }, () => {
  it("offers Create PR on card.watch, opens the PR, and the card and Work row carry its state", async () => {
    const view = (await ask("card.watch", { dir: repo.main, id: "STORY-1" })) as CardView;
    const rows = (await ask("work.watch", { dir: repo.main })) as WorkList;
    expect(rows.epics.length).toBeGreaterThan(0);
    await until(() => cardView()?.prState?.create === true || view.prState?.create === true);
    expect(await ask("story.createPr", { dir: repo.main, id: "STORY-1" })).toBeNull();
    const url = "https://github.com/acme/app/pull/1";
    await until(() => cardView()?.prState?.status?.state === "open", 10_000);
    expect(cardView()).toMatchObject({ pr: url, prState: { create: false, opening: false } });
    await until(() => story()?.prStatus?.state === "open", 10_000);
    expect(story()).toMatchObject({ pr: url, prStatus: { state: "open", checks: "none" } });
  });

  it("re-reads open PRs on prs.refresh, after the focus settles", async () => {
    await writeFile(
      join(tree, ".featra", "cards", "STORY-1-card.md"),
      serializeCard(storyCard("In Review", { pr: "https://github.com/acme/app/pull/14" })),
    );
    await gh.change((s) => {
      s.prs.push({ number: 14, url: "https://github.com/acme/app/pull/14", head: STORY_BRANCH, state: "OPEN" });
      // A read that is slow to start: other timers, such as the feature's, are set before it is made (BUG-21).
      s.viewStartDelayMs = 1500;
    });
    await ask("work.watch", { dir: repo.main });
    const reads = async () => (await gh.calls()).filter((c) => c.args[0] === "pr" && c.args[1] === "view").length;
    // Both pollers have read once and wait for their next read: the story PRs' and the features'. Any timer alone may be
    // the features', set before the story's first read is made (BUG-21).
    const settled = () => story()?.prStatus?.state === "open" && clock.timersSet() === 2;
    await until(settled, 10_000);
    const before = await reads();
    // The first read, when watching starts, is counted before the refresh (BUG-21).
    expect(before).toBe(1);
    expect(await ask("prs.refresh", {})).toBeNull();
    clock.advance(1_000);
    await expect.poll(reads, { timeout: 10_000 }).toBe(before + 1);
    // The reads have finished once both next ones are scheduled; the interval counts from there.
    await until(() => clock.timersSet() === 2, 10_000);
    clock.advance(2 * MINUTE);
    await expect.poll(reads, { timeout: 10_000 }).toBe(before + 2);
  });

  it("refuses Create PR for a folder that isn't open and without an id", async () => {
    await expect(ask("story.createPr", { dir: `${repo.main}-other`, id: "STORY-1" })).rejects.toThrow(
      "Not an open project.",
    );
    await expect(ask("story.createPr", { dir: repo.main })).rejects.toThrow("Expected { dir, id }.");
  });
});
