import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PushEvent, ServerPushes } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import type { Connection } from "../src/api.ts";
import { createServices } from "../src/services.ts";
import { card, cardPath, cardRepo, type CardRepo } from "./card-repo.ts";
import { countedGit } from "./counted-git.ts";
import { GIT_ASKED_MS, until } from "./until.ts";

/**
 * The server's own writes while a folder is watched run no git beyond the write itself (BUG-6). Under load each git
 * start takes up to about 1 s, so Apply used to miss STORY-3's 2 s by scanning git twice around its one restore.
 */
const { git, calls } = countedGit();
const allowed = createAllowedProjects();
const logged: string[] = [];
const services = createServices({
  allowed,
  log: (m) => logged.push(m),
  now: () => new Date("2026-11-05T12:00:00Z"),
  repoGit: git,
});
const pushes: { event: PushEvent; data: unknown }[] = [];
const stops = new Map<number, () => void>();
const connection: Connection = {
  push: <E extends PushEvent>(event: E, _watch: number, data: ServerPushes[E]) => void pushes.push({ event, data }),
  keep: (id, stop) => void stops.set(id, stop),
  unwatch: (id) => {
    stops.get(id)?.();
    return stops.delete(id);
  },
};
let repo: CardRepo;
let tree: string;
const KEY = `main|${cardPath("STORY-1")}`;
const KEY2 = `main|${cardPath("STORY-2")}`;

const staleKeys = (data: unknown) => ((data as { stale?: { key: string }[] }).stale ?? []).map((s) => s.key);

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  await repo.write(repo.main, card("STORY-2", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
  // STORY-1 is owned by its worktree, so main's edit of it is a stale copy.
  tree = repo.worktree("claude/story-1", "story-1");
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Edited in main" }));
  allowed.set([repo.main]);
});

afterAll(async () => {
  for (const id of stops.keys()) connection.unwatch(id);
  await services.close();
  await repo.dispose();
});

describe("writes while watched (BUG-6)", () => {
  it("applies a stale copy with one git command, the restore, and pushes the list without it", async () => {
    const list = await services.api("work.watch", { dir: repo.main }, 1, connection);
    expect(list).toMatchObject({ stale: [{ key: KEY }] });

    calls.length = 0;
    pushes.length = 0;
    expect(await services.api("work.applyCopy", { dir: repo.main, key: KEY }, 2, connection)).toEqual({ ok: true });
    expect(calls).toEqual(["restore"]);
    expect(pushes.at(-1)).toMatchObject({ event: "work.list", data: { stale: [] } });
    expect(await repo.read(tree, "STORY-1")).toContain("title: Edited in main");
  });

  it("saves a card edit from the pane without running git", async () => {
    calls.length = 0;
    const edit = { field: "notes", from: "", to: "from the pane" };
    const result = await services.api("card.update", { dir: repo.main, id: "STORY-1", edit }, 3, connection);
    expect(result).toMatchObject({ ok: true, view: { notes: "from the pane" } });
    expect(calls).toEqual([]);
    expect(logged).toEqual([]);
  });

  it("asks git again when a worktree is added under the watch, and applies to its new owner", async () => {
    await repo.write(repo.main, card("STORY-2", "story", "FEAT-1", "Ready", { title: "Edited in main" }));
    calls.length = 0;
    pushes.length = 0;
    // A new worktree for STORY-2's branch takes the card over, so main's edit becomes a stale copy.
    const tree2 = repo.worktree("claude/story-2", "story-2");
    await until(() => pushes.some((p) => p.event === "work.list" && staleKeys(p.data).includes(KEY2)));
    expect(calls).toContain("worktrees");

    calls.length = 0;
    expect(await services.api("work.applyCopy", { dir: repo.main, key: KEY2 }, 4, connection)).toEqual({ ok: true });
    expect(calls).toEqual(["restore"]);
    expect(await repo.read(tree2, "STORY-2")).toContain("title: Edited in main");
    expect(await repo.read(repo.main, "STORY-2")).toBe(repo.show(repo.main, "HEAD", "STORY-2"));
  });

  it("edits main's copy once the owning worktree is removed under the watch", async () => {
    calls.length = 0;
    repo.git(repo.main, "worktree", "remove", "--force", join(repo.root, "story-2"));
    repo.git(repo.main, "branch", "-q", "-D", "claude/story-2");
    // Heard the git event: the rescan it starts asks git again, and the edit below queues behind it.
    await until(() => calls.includes("worktrees"), GIT_ASKED_MS);

    const edit = { field: "notes", from: "", to: "back in main" };
    const result = await services.api("card.update", { dir: repo.main, id: "STORY-2", edit }, 5, connection);
    expect(result).toMatchObject({ ok: true, view: { notes: "back in main" } });
    expect(await repo.read(repo.main, "STORY-2")).toContain("back in main");
    expect(logged).toEqual([]);
  });
});
