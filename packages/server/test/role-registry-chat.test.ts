/** STORY-6 AC5: a provider's role, or any role with a model Claude doesn't have, as a chat runs it. Real folders. */
import { afterEach, describe, expect, it } from "vitest";
import { CODEX_AGENT, roleWorld } from "./role-world.ts";

const worlds: Awaited<ReturnType<typeof roleWorld>>[] = [];
const world = async (opts?: Parameters<typeof roleWorld>[0]) => {
  const w = await roleWorld(opts);
  worlds.push(w);
  return w;
};
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.dispose();
});

const byId = async (w: Awaited<ReturnType<typeof roleWorld>>, id: string) =>
  (await w.registry.read(w.dir)).roles.find((r) => r.id === id);

describe("a provider role in a chat (AC5)", () => {
  it("falls back to Claude's default for a model it doesn't have, with a one-line note", async () => {
    const w = await world();
    await w.put(w.dir, ".codex/agents/scout.toml", CODEX_AGENT);
    const role = await w.registry.get(w.dir, "codex:project:scout");
    expect(role).toMatchObject({ provider: "claude", model: "default", prompt: "Look around.", effort: "low" });
    expect(role?.note).toBe("Claude doesn't have the model \"gpt-5\": using Claude's default.");
  });

  it("keeps a Claude model, with no note, and Claude's default for none or inherit", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/agents/a.md", "---\nname: a\nmodel: inherit\n---\nA");
    await w.put(w.dir, ".claude/agents/b.md", "---\nname: b\n---\nB");
    await w.put(w.dir, ".claude/agents/c.md", "---\nname: c\nmodel: sonnet\n---\nC");
    const roles = (await w.registry.read(w.dir)).roles.slice(5);
    expect(roles.map((r) => [r.model, r.note])).toEqual([
      ["default", undefined],
      ["default", undefined],
      ["sonnet", undefined],
    ]);
  });

  it("notes a custom role's unknown model too, and drops the note once the model is fixed", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/mine.md", "---\nname: Mine\nmodel: gemini-pro\n---\nM");
    expect((await byId(w, "mine"))?.note).toContain("gemini-pro");
    await w.put(w.dir, ".featra/roles/mine.md", "---\nname: Mine\nmodel: opus\n---\nM");
    expect((await byId(w, "mine"))?.note).toBeUndefined();
  });
});
