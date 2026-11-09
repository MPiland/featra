/**
 * STORY-6 AC2, AC3, AC4: an edit never overwrites a role file it didn't make, however the file is spelled or whether
 * it parses, and a save writes only the fields the user changed. Real folders and the real registry.
 */
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, type RoleEdit } from "@featra/work-format";
import { CLAUDE_AGENT, roleWorld } from "./role-world.ts";

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

const edit = (w: World, e: RoleEdit) => w.registry.edit(w.dir, e);
const roleFile = (w: World, name: string) => join(w.dir, ".featra", "roles", name);
const folder = async (w: World) => (await w.names(join(w.dir, ".featra", "roles"))).toSorted();
/** A file Featra can't read: frontmatter that doesn't parse. */
const BROKEN = "---\nname: [unclosed\n---\nKeep me.";

describe("create, duplicate and customize never overwrite a file (AC3, AC4)", () => {
  it("create leaves a file that doesn't parse alone, and takes the next id", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/tester.md", BROKEN);
    expect(await edit(w, { action: "create", name: "Tester" })).toEqual({ ok: true, id: "tester-2" });
    expect(await w.read(roleFile(w, "tester.md"))).toBe(BROKEN);
    expect(await folder(w)).toEqual(["tester-2.md", "tester.md"]);
  });

  it("create compares file names ignoring case, so Tester.md and tester.md never become one file", async () => {
    const w = await world();
    const mixed = "---\nname: Other\n---\nO";
    await w.put(w.dir, ".featra/roles/Tester.md", mixed);
    const made = await edit(w, { action: "create", name: "Tester" });
    expect(made.ok && made.id.toLowerCase()).not.toBe("tester");
    expect(await w.read(roleFile(w, "Tester.md"))).toBe(mixed);
    expect(await folder(w)).toHaveLength(2);
  });

  it("duplicate leaves the next file in line alone when it doesn't parse", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/mine.md", "---\nname: Mine\n---\nM");
    await w.put(w.dir, ".featra/roles/mine-2.md", BROKEN);
    const made = await edit(w, { action: "duplicate", id: "mine" });
    expect(made.ok && made.id).not.toBe("mine-2");
    expect(await w.read(roleFile(w, "mine-2.md"))).toBe(BROKEN);
  });

  it("customize leaves a file of another spelling alone, and copies the agent beside it", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    await w.put(w.dir, ".featra/roles/Reviewer.md", BROKEN);
    const made = await edit(w, { action: "customize", id: "claude:project:reviewer" });
    expect(made.ok && made.id.toLowerCase()).not.toBe("reviewer");
    expect(await w.read(roleFile(w, "Reviewer.md"))).toBe(BROKEN);
    expect(await folder(w)).toHaveLength(2);
  });
});

describe("a save writes only what the user changed (AC2)", () => {
  const qa = BUILT_IN_ROLES.find((r) => r.id === "qa")!;

  it("a prompt-only save of a built-in writes no model or effort, so Featra's updates keep applying", async () => {
    const w = await world();
    expect(await edit(w, { action: "save", id: "qa", prompt: "Be picky." })).toEqual({ ok: true, id: "qa" });
    const text = await w.read(roleFile(w, "qa.md"));
    expect(text).toContain("Be picky.");
    expect(text).not.toMatch(/model|effort/);
    const role = (await w.registry.read(w.dir)).roles.find((r) => r.id === "qa");
    expect(role).toMatchObject({ prompt: "Be picky.", model: qa.model, effort: qa.effort });
  });

  it("a model-only save keeps the built-in's prompt following Featra too", async () => {
    const w = await world();
    await edit(w, { action: "save", id: "qa", model: "haiku" });
    const role = (await w.registry.read(w.dir)).roles.find((r) => r.id === "qa");
    expect(role).toMatchObject({ model: "haiku", prompt: qa.prompt, effort: qa.effort });
  });

  it("adds a changed field to the ones the file already has, and no others", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/qa.md", "---\nmodel: haiku\n---\nBe picky.");
    await edit(w, { action: "save", id: "qa", effort: "max" });
    const text = await w.read(roleFile(w, "qa.md"));
    expect(text).toContain("model: haiku");
    expect(text).toContain("effort: max");
    expect(text).toContain("Be picky.");
    expect(text).not.toContain("name:");
  });

  it("a custom role keeps all its other fields", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/mine.md", "---\nname: Mine\nmodel: opus\neffort: low\n---\nM");
    await edit(w, { action: "save", id: "mine", effort: "high" });
    expect((await w.registry.read(w.dir)).roles.find((r) => r.id === "mine")).toMatchObject({
      name: "Mine",
      model: "opus",
      effort: "high",
      prompt: "M",
    });
  });

  it("still refuses a blank model", async () => {
    const w = await world();
    expect(await edit(w, { action: "save", id: "qa", model: "  " })).toMatchObject({ ok: false });
    expect(await w.exists(w.dir, ".featra/roles/qa.md")).toBe(false);
  });
});
