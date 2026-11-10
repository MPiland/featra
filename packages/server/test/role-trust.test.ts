/**
 * STORY-6 AC7: the Codex reader trusts a project the way Codex's own trust table names it: the folder, a folder above
 * it (the git root among them) or the main checkout of its worktree. Real folders; only Codex's config is the test's.
 */
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCodexReader } from "../src/codex-reader.ts";
import { roleWorld } from "./role-world.ts";

type World = Awaited<ReturnType<typeof roleWorld>>;
const worlds: World[] = [];
const world = async () => {
  const w = await roleWorld();
  worlds.push(w);
  return w;
};
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.dispose();
});

const trust = (path: string) => `[projects.${JSON.stringify(path)}]\ntrust_level = "trusted"\n`;
const PROJECT_CONFIG = 'approval_policy = "never"\nsandbox_mode = "read-only"\n';
const modeOf = async (w: World) => (await createCodexReader(w.fs).mode(w.dir)).mode;

describe("Codex trust entries (AC7)", () => {
  it("trust a project through the folder above it, so the project's own config counts", async () => {
    const w = await world();
    await w.put(w.home, ".codex/config.toml", trust(dirname(w.dir)));
    await w.put(w.dir, ".codex/config.toml", PROJECT_CONFIG);
    expect(await modeOf(w)).toMatchObject({ name: "never · read-only", level: "project" });
  });

  it("don't trust a project through a folder beside it", async () => {
    const w = await world();
    await w.put(w.home, ".codex/config.toml", trust(join(dirname(w.dir), "somewhere-else")));
    await w.put(w.dir, ".codex/config.toml", PROJECT_CONFIG);
    expect(await modeOf(w)).toBeNull();
  });

  it("trust a git worktree through its main checkout", async () => {
    const w = await world();
    const main = join(w.home, "main-repo");
    await w.put(w.dir, ".git", `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
    await w.put(w.home, ".codex/config.toml", trust(main));
    await w.put(w.dir, ".codex/config.toml", PROJECT_CONFIG);
    expect(await modeOf(w)).toMatchObject({ name: "never · read-only", level: "project" });
  });

  it("don't trust a worktree whose main checkout isn't in the table", async () => {
    const w = await world();
    await w.put(w.dir, ".git", `gitdir: ${join(w.home, "main-repo", ".git", "worktrees", "wt")}\n`);
    await w.put(w.home, ".codex/config.toml", trust(join(w.home, "another-repo")));
    await w.put(w.dir, ".codex/config.toml", PROJECT_CONFIG);
    expect(await modeOf(w)).toBeNull();
  });

  it("read a plain .git folder as the repository itself, with no error", async () => {
    const w = await world();
    await w.put(w.dir, ".git/HEAD", "ref: refs/heads/main\n");
    const read = await createCodexReader(w.fs).mode(w.dir);
    expect(read).toEqual({ mode: null, problems: [] });
  });
});
