/** STORY-6 AC1, AC4, AC7: Settings > Roles follows the files live, including folders made after the watch began. */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RoleList } from "@featra/work-format";
import { createRoleWatches } from "../src/role-watch.ts";
import { CLAUDE_AGENT, roleWorld, settings } from "./role-world.ts";
import { until } from "./until.ts";
import { watchSpy } from "./watch-spy.ts";

const worlds: Awaited<ReturnType<typeof roleWorld>>[] = [];
const stops: (() => void)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  for (const w of worlds.splice(0)) await w.dispose();
});

async function watching(opts?: Parameters<typeof roleWorld>[0]) {
  const w = await roleWorld(opts);
  worlds.push(w);
  const heard: RoleList[] = [];
  const failures: string[] = [];
  const spy = watchSpy();
  const watches = createRoleWatches(w.registry, (m) => failures.push(m), spy.watchFolder);
  const { list, stop } = await watches.watch(w.dir, (next) => heard.push(next));
  stops.push(stop);
  return { w, list, heard, failures, stop, watches, open: spy.open };
}

const ids = (list: RoleList | undefined) => list?.roles.map((r) => r.id) ?? [];
const last = (heard: RoleList[]) => heard[heard.length - 1];

describe("the roles page follows the files", () => {
  it("answers with the roles now, nothing yet heard", async () => {
    const { list, heard } = await watching();
    expect(ids(list)).toHaveLength(5);
    expect(heard).toEqual([]);
  });

  it("shows a Featra role file made or edited outside, and one deleted", async () => {
    const { w, heard } = await watching();
    await w.put(w.dir, ".featra/roles/mine.md", "---\nname: Mine\n---\nM");
    await until(() => ids(last(heard)).includes("mine"));
    await w.put(w.dir, ".featra/roles/qa.md", "---\neffort: max\n---\nQ");
    await until(() => last(heard)?.roles.find((r) => r.id === "qa")?.effort === "max");
    await rm(join(w.dir, ".featra/roles/mine.md"));
    await until(() => !ids(last(heard)).includes("mine"));
    expect(ids(last(heard))).toHaveLength(5);
  });

  it("shows a Claude agent made in a .claude folder that didn't exist, in the project and in the home", async () => {
    const { w, heard } = await watching();
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    await until(() => ids(last(heard)).includes("claude:project:reviewer"));
    await w.put(w.home, ".claude/agents/helper.md", "---\nname: helper\n---\nH");
    await until(() => ids(last(heard)).includes("claude:user:helper"));
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT.replace("You review.", "You audit."));
    await until(() => last(heard)?.roles.find((r) => r.id === "claude:project:reviewer")?.prompt === "You audit.");
    expect(ids(last(heard))).toContain("claude:user:helper");
  });

  it("shows a change to the provider's settings in every role's mode", async () => {
    const { w, heard } = await watching();
    await w.put(w.home, ".claude/settings.json", settings("plan"));
    await until(() => last(heard)?.roles.every((r) => r.mode?.name === "plan") === true);
    await w.put(w.dir, ".claude/settings.local.json", settings("bypassPermissions"));
    await until(() => last(heard)?.roles[0]?.mode?.fullAccess === true);
    await rm(join(w.dir, ".claude/settings.local.json"));
    await until(() => last(heard)?.roles[0]?.mode?.name === "plan");
    expect(last(heard)?.roles[0]?.mode).toMatchObject({ level: "user", fullAccess: false });
  });

  it("shows a problem file, and its fix", async () => {
    const { w, heard } = await watching();
    await w.put(w.dir, ".claude/agents/bad.md", "no frontmatter");
    await until(() => (last(heard)?.problems.length ?? 0) === 1);
    await w.put(w.dir, ".claude/agents/bad.md", CLAUDE_AGENT);
    await until(() => last(heard)?.problems.length === 0);
    expect(ids(last(heard))).toContain("claude:project:bad");
  });

  it("tells a listener only about a list that changed", async () => {
    const { w, heard } = await watching();
    await w.put(w.dir, ".claude/agents/x.md", "---\nname: x\n---\nX");
    await until(() => heard.length === 1);
    // Same bytes again: an event, but the same list.
    await w.put(w.dir, ".claude/agents/x.md", "---\nname: x\n---\nX");
    await w.put(w.dir, ".claude/agents/y.md", "---\nname: y\n---\nY");
    await until(() => ids(last(heard)).includes("claude:project:y"));
    expect(heard.map((l) => l.roles.length)).toEqual([6, 7]);
  });

  it("goes quiet when stopped, and works with no home folder", async () => {
    const { w, heard, stop, failures } = await watching({ home: false });
    await w.put(w.dir, ".claude/agents/a.md", "---\nname: a\n---\nA");
    await until(() => heard.length === 1);
    stop();
    await w.put(w.dir, ".claude/agents/b.md", "---\nname: b\n---\nB");
    await new Promise((r) => setTimeout(r, 300));
    expect(heard).toHaveLength(1);
    expect(failures).toEqual([]);
  });
});

describe("a closed project holds no watcher (AC1)", () => {
  it("closeProjects ends the watches of projects no longer kept, and only those", async () => {
    const a = await watching();
    const b = await watching();
    const spy = watchSpy();
    const watches = createRoleWatches(a.w.registry, () => {}, spy.watchFolder);
    const mine = await watches.watch(a.w.dir, () => {});
    const other = await watches.watch(b.w.dir, () => {});
    stops.push(mine.stop, other.stop);
    expect(spy.open.size).toBeGreaterThan(0);
    const both = spy.open.size;
    watches.closeProjects((dir) => dir === b.w.dir);
    expect(spy.open.size).toBeGreaterThan(0);
    expect(spy.open.size).toBeLessThan(both);
    watches.closeProjects(() => false);
    expect(spy.open.size).toBe(0);
  });

  it("close ends every watch", async () => {
    const { w } = await watching();
    const spy = watchSpy();
    const mine = createRoleWatches(w.registry, () => {}, spy.watchFolder);
    await mine.watch(w.dir, () => {});
    expect(spy.open.size).toBeGreaterThan(0);
    mine.close();
    expect(spy.open.size).toBe(0);
  });
});
