/**
 * STORY-6 AC6, AC7: Claude's managed settings are the highest layer, and a role's own `permissionMode` beats the
 * settings files. Real folders and the real registry and readers; the managed file is a path in the test's own folder.
 */
import { writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { claudeManagedPath } from "../src/role-fs.ts";
import { fakeClaude } from "./fake-query.ts";
import { roleWorld, settings } from "./role-world.ts";

type World = Awaited<ReturnType<typeof roleWorld>>;
const worlds: World[] = [];
const managers: ChatManager[] = [];
const world = async () => {
  const w = await roleWorld();
  worlds.push(w);
  return w;
};
afterEach(async () => {
  for (const m of managers.splice(0)) m.close();
  for (const w of worlds.splice(0)) await w.dispose();
});

const NO_BYPASS = JSON.stringify({ permissions: { disableBypassPermissionsMode: "disable" } });
const agent = (permissionMode: string) => `---\nname: ${permissionMode}\npermissionMode: ${permissionMode}\n---\nGo.`;

async function optionsOf(w: World, role: string) {
  const claude = fakeClaude();
  const manager = createChatManager({ providers: [createClaudeProvider(claude.deps)], roles: w.registry });
  managers.push(manager);
  manager.send(await manager.start(w.dir, role), "go");
  while (claude.runs.length === 0) await new Promise((r) => setTimeout(r, 10));
  return claude.runs[0]!.options;
}

const modeOf = async (w: World, role: string) => (await w.registry.get(w.dir, role))?.mode;
const noteOf = async (w: World, role: string) => (await w.registry.get(w.dir, role))?.note;

describe("Claude's managed settings (AC7)", () => {
  it("are where Claude keeps them on each platform", () => {
    expect(claudeManagedPath("win32")).toBe(String.raw`C:\Program Files\ClaudeCode\managed-settings.json`);
    expect(claudeManagedPath("darwin")).toBe("/Library/Application Support/ClaudeCode/managed-settings.json");
    expect(claudeManagedPath("linux")).toBe("/etc/claude-code/managed-settings.json");
    expect(claudeManagedPath("aix")).toBeNull();
  });

  it("outrank the local, project and user settings", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("default"));
    await w.put(w.dir, ".claude/settings.json", settings("plan"));
    await w.put(w.dir, ".claude/settings.local.json", settings("auto"));
    await writeFile(w.managedFile, settings("acceptEdits"), "utf8");
    expect(await modeOf(w, "qa")).toEqual({
      provider: "claude",
      name: "acceptEdits",
      level: "managed",
      fullAccess: false,
    });
    expect((await optionsOf(w, "qa")).permissionMode).toBe("acceptEdits");
  });

  it("are read live, and a missing file is no layer", async () => {
    const w = await world();
    expect(await modeOf(w, "qa")).toBeUndefined();
    await writeFile(w.managedFile, settings("plan"), "utf8");
    expect(await modeOf(w, "qa")).toMatchObject({ name: "plan", level: "managed" });
  });

  it("that disable bypass turn bypassPermissions into Ask with a note, whatever layer asks for it", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("bypassPermissions"));
    await writeFile(w.managedFile, NO_BYPASS, "utf8");
    expect(await modeOf(w, "qa")).toBeUndefined();
    expect(await noteOf(w, "qa")).toContain("full access");
    const options = await optionsOf(w, "qa");
    expect(options.permissionMode).toBe("default");
    expect(options).not.toHaveProperty("allowDangerouslySkipPermissions");
  });

  it("that disable bypass leave every other mode alone, and turn off an agent's own bypass too", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("plan"));
    await w.put(w.dir, ".claude/agents/bypassPermissions.md", agent("bypassPermissions"));
    await writeFile(w.managedFile, NO_BYPASS, "utf8");
    expect(await modeOf(w, "qa")).toMatchObject({ name: "plan", level: "user" });
    expect(await modeOf(w, "claude:project:bypassPermissions")).toBeUndefined();
    expect(await noteOf(w, "claude:project:bypassPermissions")).toContain("full access");
  });
});

describe("a Claude agent's own permissionMode (AC6, AC7)", () => {
  it("beats the settings files for that role only, and names the agent as its source", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("plan"));
    await w.put(w.dir, ".claude/agents/acceptEdits.md", agent("acceptEdits"));
    expect(await modeOf(w, "claude:project:acceptEdits")).toEqual({
      provider: "claude",
      name: "acceptEdits",
      level: "agent",
      fullAccess: false,
    });
    expect(await modeOf(w, "qa")).toMatchObject({ name: "plan", level: "user" });
    expect((await optionsOf(w, "claude:project:acceptEdits")).permissionMode).toBe("acceptEdits");
  });

  it("honours bypassPermissions as full access, with the same second opt-in", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/agents/bypassPermissions.md", agent("bypassPermissions"));
    expect(await modeOf(w, "claude:project:bypassPermissions")).toMatchObject({ level: "agent", fullAccess: true });
    expect(await optionsOf(w, "claude:project:bypassPermissions")).toMatchObject({
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    });
  });

  it("starts a mode Featra doesn't know on Ask, with a problem and a note naming the file", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("bypassPermissions"));
    await w.put(w.dir, ".claude/agents/yolo.md", agent("yolo"));
    expect(await modeOf(w, "claude:project:yolo")).toBeUndefined();
    expect(await noteOf(w, "claude:project:yolo")).toContain("permissionMode");
    const { problems } = await w.registry.read(w.dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".claude/agents/yolo.md");
  });

  it("leaves a Codex-origin role on Claude's settings, as decided for M1", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("plan"));
    await w.put(
      w.dir,
      ".codex/agents/scout.toml",
      'sandbox_mode = "danger-full-access"\ndeveloper_instructions = "Go."',
    );
    expect(await modeOf(w, "codex:project:scout")).toMatchObject({ name: "plan", level: "user" });
  });
});
