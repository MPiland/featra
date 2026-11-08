import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PushEvent, ServerPushes } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import type { Connection } from "../src/api.ts";
import { createServices } from "../src/services.ts";
import { card, cardPath, cardRepo, type CardRepo } from "./card-repo.ts";
import { countedGit } from "./counted-git.ts";

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

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
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
});
