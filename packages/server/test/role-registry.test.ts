/** STORY-6 AC1 to AC5: the project's roles from Featra's own files and the providers' agent files, on real folders. */
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, type RoleEdit } from "@featra/work-format";
import { CLAUDE_AGENT, CODEX_AGENT, roleWorld } from "./role-world.ts";

const worlds: Awaited<ReturnType<typeof roleWorld>>[] = [];
const world = async (opts?: Parameters<typeof roleWorld>[0]) => {
  const w = await roleWorld(opts);
  worlds.push(w);
  return w;
};
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.dispose();
});

const edit = (w: Awaited<ReturnType<typeof roleWorld>>, e: RoleEdit) => w.registry.edit(w.dir, e);
const byId = async (w: Awaited<ReturnType<typeof roleWorld>>, id: string) =>
  (await w.registry.read(w.dir)).roles.find((r) => r.id === id);

describe("the built-in roles (AC1)", () => {
  it("lists the five with prompt, model, effort and mode, and nothing else on an empty project", async () => {
    const w = await world();
    const { roles, problems } = await w.registry.read(w.dir);
    expect(problems).toEqual([]);
    expect(roles.map((r) => r.id)).toEqual(BUILT_IN_ROLES.map((r) => r.id));
    for (const r of roles) {
      expect(r.source).toEqual({ kind: "built-in", edited: false });
      expect(r.prompt).not.toBe("");
      expect(r).not.toHaveProperty("mode"); // no setting: Ask, which an absent mode reads as
    }
    expect(roles[0]).toMatchObject({ name: "Researcher", model: "sonnet", effort: "medium" });
  });
});

describe("editing a built-in role (AC2)", () => {
  it("writes .featra/roles/<role>.md, and chats started after it see the change", async () => {
    const w = await world();
    const saved = await edit(w, { action: "save", id: "qa", prompt: "Be picky.", model: "opus", effort: "max" });
    expect(saved).toEqual({ ok: true, id: "qa" });
    expect(await w.exists(w.dir, ".featra/roles/qa.md")).toBe(true);
    expect(await w.registry.get(w.dir, "qa")).toMatchObject({
      name: "QA",
      prompt: "Be picky.",
      model: "opus",
      effort: "max",
      source: { kind: "built-in", edited: true },
    });
    // The others are untouched.
    expect(await byId(w, "developer")).toMatchObject({ source: { kind: "built-in", edited: false } });
  });

  it("Reset deletes the file and the built-in comes back", async () => {
    const w = await world();
    await edit(w, { action: "save", id: "qa", prompt: "Be picky.", model: "opus", effort: "max" });
    expect(await edit(w, { action: "reset", id: "qa" })).toEqual({ ok: true, id: "qa" });
    expect(await w.exists(w.dir, ".featra/roles/qa.md")).toBe(false);
    expect(await byId(w, "qa")).toMatchObject({ prompt: BUILT_IN_ROLES.find((r) => r.id === "qa")!.prompt });
  });

  it("reads a hand-edited override live, a missing field keeping the built-in's", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/developer.md", "---\neffort: low\n---\nBy hand.");
    expect(await byId(w, "developer")).toMatchObject({ prompt: "By hand.", effort: "low", model: "sonnet" });
    await w.put(w.dir, ".featra/roles/developer.md", "---\neffort: high\n---\nAgain.");
    expect(await byId(w, "developer")).toMatchObject({ prompt: "Again.", effort: "high" });
  });

  it("refuses a model-less save and resetting what isn't a built-in", async () => {
    const w = await world();
    expect(await edit(w, { action: "save", id: "qa", prompt: "x", model: " ", effort: "low" })).toMatchObject({
      ok: false,
    });
    expect(await edit(w, { action: "reset", id: "nobody" })).toMatchObject({ ok: false });
    expect(await w.exists(w.dir, ".featra/roles/qa.md")).toBe(false);
  });
});

describe("custom roles (AC3)", () => {
  it("creates, duplicates, renames and deletes, each as a file in .featra/roles", async () => {
    const w = await world();
    expect(await edit(w, { action: "create", name: "Reviewer" })).toEqual({ ok: true, id: "reviewer" });
    expect(await w.exists(w.dir, ".featra/roles/reviewer.md")).toBe(true);
    expect(await byId(w, "reviewer")).toMatchObject({ name: "Reviewer", source: { kind: "custom" } });

    await edit(w, { action: "save", id: "reviewer", prompt: "Review.", model: "haiku", effort: "low" });
    expect(await edit(w, { action: "duplicate", id: "reviewer" })).toEqual({ ok: true, id: "reviewer-2" });
    expect(await byId(w, "reviewer-2")).toMatchObject({
      name: "Reviewer 2",
      prompt: "Review.",
      model: "haiku",
      effort: "low",
    });

    // A rename changes the name only: the file, and so the id, stay.
    expect(await edit(w, { action: "rename", id: "reviewer-2", name: "Auditor" })).toEqual({
      ok: true,
      id: "reviewer-2",
    });
    expect(await byId(w, "reviewer-2")).toMatchObject({ name: "Auditor", prompt: "Review." });

    expect(await edit(w, { action: "delete", id: "reviewer-2" })).toEqual({ ok: true, id: "reviewer-2" });
    expect(await w.exists(w.dir, ".featra/roles/reviewer-2.md")).toBe(false);
    expect((await w.registry.list(w.dir)).map((r) => r.name)).toEqual([
      ...BUILT_IN_ROLES.map((r) => r.name),
      "Reviewer",
    ]);
  });

  it("duplicates a built-in as a custom role", async () => {
    const w = await world();
    expect(await edit(w, { action: "duplicate", id: "qa" })).toEqual({ ok: true, id: "qa-2" });
    expect(await byId(w, "qa-2")).toMatchObject({
      name: "QA 2",
      source: { kind: "custom" },
      prompt: BUILT_IN_ROLES[4]!.prompt,
    });
  });

  it("refuses a blank, overlong or taken name, however it is spelled, and writes nothing", async () => {
    const w = await world();
    await edit(w, { action: "create", name: "Reviewer" });
    const before = await w.contents(w.dir);
    for (const name of ["", "   ", "x".repeat(61), "reviewer", " QA ", "Dev Lead"])
      expect(await edit(w, { action: "create", name })).toMatchObject({ ok: false });
    expect(await edit(w, { action: "rename", id: "reviewer", name: "qa" })).toMatchObject({ ok: false });
    expect(await w.contents(w.dir)).toEqual(before);
  });

  it("lets a custom role keep its own name when renamed in another case", async () => {
    const w = await world();
    await edit(w, { action: "create", name: "Reviewer" });
    expect(await edit(w, { action: "rename", id: "reviewer", name: "REVIEWER" })).toEqual({ ok: true, id: "reviewer" });
  });

  it("gives colliding names distinct ids", async () => {
    const w = await world();
    await edit(w, { action: "create", name: "A/B" });
    expect(await edit(w, { action: "create", name: "A B" })).toEqual({ ok: true, id: "a-b-2" });
  });

  it("won't rename or delete a built-in, or touch a role that is gone", async () => {
    const w = await world();
    expect(await edit(w, { action: "rename", id: "qa", name: "Tester" })).toMatchObject({ ok: false });
    expect(await edit(w, { action: "delete", id: "qa" })).toMatchObject({ ok: false });
    expect(await edit(w, { action: "delete", id: "ghost" })).toMatchObject({ ok: false });
    expect(await edit(w, { action: "duplicate", id: "ghost" })).toMatchObject({ ok: false });
  });

  it("lists custom roles by name after the built-ins, and reports a malformed file without losing the rest", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/zed.md", "---\nname: Zed\n---\nz");
    await w.put(w.dir, ".featra/roles/alpha.md", "---\nname: Alpha\n---\na");
    await w.put(w.dir, ".featra/roles/broken.md", "---\n: [\n---\nx");
    await w.put(w.dir, ".featra/roles/notes.txt", "ignored");
    const { roles, problems } = await w.registry.read(w.dir);
    expect(roles.slice(5).map((r) => r.name)).toEqual(["Alpha", "Zed"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".featra/roles/broken.md");
    expect(w.log).toEqual(problems);
  });
});

describe("provider roles (AC4)", () => {
  it("lists Claude and Codex agents from the project and the user, tagged with their source", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    await w.put(w.home, ".claude/agents/helper.md", "---\ndescription: helps\n---\nHelp.");
    await w.put(w.dir, ".codex/agents/scout.toml", CODEX_AGENT);
    await w.put(w.home, ".codex/agents/judge.toml", 'developer_instructions = "Judge."');
    const found = (await w.registry.read(w.dir)).roles.slice(5);
    expect(found.map((r) => [r.id, r.name, r.source])).toEqual([
      ["claude:project:reviewer", "reviewer", { kind: "provider", provider: "claude", scope: "project" }],
      ["claude:user:helper", "helper", { kind: "provider", provider: "claude", scope: "user" }],
      ["codex:project:scout", "scout", { kind: "provider", provider: "codex", scope: "project" }],
      ["codex:user:judge", "judge", { kind: "provider", provider: "codex", scope: "user" }],
    ]);
    expect(found[0]).toMatchObject({
      prompt: "You review.",
      model: "opus",
      effort: "high",
      description: "Reviews code",
    });
  });

  it("reads them live, and never writes them", async () => {
    const w = await world();
    const agent = await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    const mine = await w.put(w.home, ".codex/agents/judge.toml", 'developer_instructions = "Judge."');
    const before = [await w.contents(w.dir), await w.contents(w.home)];
    await w.registry.read(w.dir);
    expect(await w.read(agent)).toBe(CLAUDE_AGENT);
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT.replace("You review.", "You audit."));
    expect(await byId(w, "claude:project:reviewer")).toMatchObject({ prompt: "You audit." });
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    // Listing, customizing and editing leave the providers' files exactly as they were.
    await edit(w, { action: "customize", id: "claude:project:reviewer" });
    await edit(w, { action: "customize", id: "codex:user:judge" });
    expect(await w.read(agent)).toBe(CLAUDE_AGENT);
    expect(await w.read(mine)).toBe('developer_instructions = "Judge."');
    expect(await w.contents(w.home)).toEqual(before[1]);
    const after = await w.contents(w.dir);
    expect(Object.keys(after).filter((f) => !f.startsWith(".featra/"))).toEqual(Object.keys(before[0]!));
    expect(after[".claude/agents/reviewer.md"]).toBe(CLAUDE_AGENT);
  });

  it("Customize copies the role into .featra/roles as a custom role, leaving the original listed", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    // The copy gets a name of its own, as the original is still listed under "reviewer".
    expect(await edit(w, { action: "customize", id: "claude:project:reviewer" })).toEqual({
      ok: true,
      id: "reviewer-2",
    });
    expect(await w.exists(w.dir, ".featra/roles/reviewer-2.md")).toBe(true);
    expect(await byId(w, "reviewer-2")).toMatchObject({
      name: "reviewer 2",
      prompt: "You review.",
      model: "opus",
      source: { kind: "custom" },
    });
    expect(await byId(w, "claude:project:reviewer")).toBeDefined();
    // Customize again: a new copy, never an overwrite.
    expect(await edit(w, { action: "customize", id: "claude:project:reviewer" })).toEqual({
      ok: true,
      id: "reviewer-3",
    });
    // The copy edits like any custom role; the provider's own role can't be saved over.
    expect(
      await edit(w, { action: "save", id: "claude:project:reviewer", prompt: "x", model: "opus", effort: "low" }),
    ).toMatchObject({ ok: false });
  });

  it("skips a malformed agent file with a problem, and keeps the others", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/agents/ok.md", CLAUDE_AGENT);
    await w.put(w.dir, ".claude/agents/bare.md", "No frontmatter at all");
    await w.put(w.home, ".codex/agents/bad.toml", "name = ");
    const { roles, problems } = await w.registry.read(w.dir);
    expect(roles.slice(5).map((r) => r.id)).toEqual(["claude:project:ok"]);
    expect(problems.map((p) => p.split(":")[0])).toEqual([
      "Can't read .claude/agents/bare.md",
      "Can't read ~/.codex/agents/bad.toml",
    ]);
  });

  it("works with no home folder: only the project's agents, and no error", async () => {
    const w = await world({ home: false });
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    await w.put(w.home, ".claude/agents/helper.md", "---\nname: helper\n---\nHelp.");
    const { roles, problems } = await w.registry.read(w.dir);
    expect(roles.slice(5).map((r) => r.id)).toEqual(["claude:project:reviewer"]);
    expect(problems).toEqual([]);
  });

  it("follows CLAUDE_CONFIG_DIR and CODEX_HOME to the providers' folders", async () => {
    const other = await roleWorld();
    worlds.push(other);
    const w = await world({ env: { CLAUDE_CONFIG_DIR: other.home + "/c", CODEX_HOME: other.home + "/x" } });
    await w.put(other.home, "c/agents/moved.md", "---\nname: moved\n---\nM");
    await w.put(other.home, "x/agents/shifted.toml", 'developer_instructions = "S"');
    await w.put(w.home, ".claude/agents/old.md", "---\nname: old\n---\nO");
    expect((await w.registry.read(w.dir)).roles.slice(5).map((r) => r.id)).toEqual([
      "claude:user:moved",
      "codex:user:shifted",
    ]);
  });

  it("never reads the providers' credential files", async () => {
    const w = await world();
    await w.put(w.home, ".claude/.credentials.json", '{"token":"secret"}');
    await w.put(w.home, ".codex/auth.json", '{"token":"secret"}');
    await w.registry.read(w.dir);
    expect(w.log.join()).not.toContain("secret");
  });
});
