/** STORY-6 AC5 to AC7: a chat from a role starts in the mode the provider's own settings name, read live, never written. */
import { afterEach, describe, expect, it } from "vitest";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createCodexReader } from "../src/codex-reader.ts";
import { fakeClaude } from "./fake-query.ts";
import { CLAUDE_AGENT, CODEX_AGENT, roleWorld, settings } from "./role-world.ts";

type World = Awaited<ReturnType<typeof roleWorld>>;
const worlds: World[] = [];
const managers: ChatManager[] = [];
const world = async (opts?: Parameters<typeof roleWorld>[0]) => {
  const w = await roleWorld(opts);
  worlds.push(w);
  return w;
};
afterEach(async () => {
  for (const m of managers.splice(0)) m.close();
  for (const w of worlds.splice(0)) await w.dispose();
});

/** A chat through the real manager, registry and Claude adapter over the world's folders; only `query` is fake. */
async function start(w: World, role: string) {
  const claude = fakeClaude();
  const manager = createChatManager({ providers: [createClaudeProvider(claude.deps)], roles: w.registry });
  managers.push(manager);
  const id = await manager.start(w.dir, role);
  const send = async (text = "go") => {
    manager.send(id, text);
    while (claude.runs.length === 0) await new Promise((r) => setTimeout(r, 10));
    return claude.runs[claude.runs.length - 1]!.options;
  };
  return { manager, id, send, claude };
}

const modeOf = async (w: World, role = "developer") => (await w.registry.get(w.dir, role))?.mode;

describe("the mode a role starts in (AC6, AC7)", () => {
  it("is Ask with no setting anywhere, and the SDK's default mode", async () => {
    const w = await world();
    expect(await modeOf(w)).toBeUndefined(); // Ask is an absent mode
    const options = await (await start(w, "developer")).send();
    expect(options.permissionMode).toBe("default");
    expect(options).not.toHaveProperty("allowDangerouslySkipPermissions");
  });

  it("reads Claude's permissions.defaultMode from the user's settings", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("acceptEdits"));
    expect(await modeOf(w)).toEqual({ provider: "claude", name: "acceptEdits", level: "user", fullAccess: false });
    expect((await (await start(w, "qa")).send()).permissionMode).toBe("acceptEdits");
  });

  it("lets the local project file win over the project's, and that over the user's", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("default"));
    expect(await modeOf(w)).toMatchObject({ name: "default", level: "user" });
    await w.put(w.dir, ".claude/settings.json", settings("plan"));
    expect(await modeOf(w)).toMatchObject({ name: "plan", level: "project" });
    await w.put(w.dir, ".claude/settings.local.json", settings("auto"));
    expect(await modeOf(w)).toMatchObject({ name: "auto", level: "local" });
  });

  it("applies to every role alike: built-in, custom and a provider's", async () => {
    const w = await world();
    await w.put(w.dir, ".featra/roles/mine.md", "---\nname: Mine\n---\nM");
    await w.put(w.dir, ".claude/agents/reviewer.md", CLAUDE_AGENT);
    await w.put(w.home, ".claude/settings.json", settings("plan"));
    for (const id of ["qa", "mine", "claude:project:reviewer"])
      expect(await modeOf(w, id)).toMatchObject({ name: "plan", level: "user" });
  });

  it("starts a Codex-origin role on Claude's mode, as Claude runs it", async () => {
    const w = await world();
    await w.put(w.dir, ".codex/agents/scout.toml", CODEX_AGENT);
    await w.put(w.home, ".claude/settings.json", settings("auto"));
    await w.put(w.home, ".codex/config.toml", 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n');
    expect(await modeOf(w, "codex:project:scout")).toMatchObject({ provider: "claude", name: "auto" });
    expect((await (await start(w, "codex:project:scout")).send()).permissionMode).toBe("auto");
  });

  it("honours full access: bypass with the SDK's second opt-in, and the mode marked for a warning", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/settings.json", settings("bypassPermissions"));
    expect(await modeOf(w)).toMatchObject({ name: "bypassPermissions", fullAccess: true });
    const options = await (await start(w, "developer")).send();
    expect(options).toMatchObject({ permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true });
  });

  it("passes dontAsk through as a normal Claude mode, without a full-access mark", async () => {
    const w = await world();
    await w.put(w.dir, ".claude/settings.json", settings("dontAsk"));
    expect(await modeOf(w)).toMatchObject({ name: "dontAsk", level: "project", fullAccess: false });
    expect((await (await start(w, "developer")).send()).permissionMode).toBe("dontAsk");
    expect((await w.registry.read(w.dir)).problems).toEqual([]);
  });

  it("never grants the bypass opt-in for any other mode", async () => {
    for (const mode of ["default", "acceptEdits", "plan", "auto", "dontAsk"]) {
      const w = await world();
      await w.put(w.dir, ".claude/settings.json", settings(mode));
      expect(await (await start(w, "developer")).send()).not.toHaveProperty("allowDangerouslySkipPermissions");
    }
  });

  it("skips a malformed file with a problem and falls to the next file", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("plan"));
    await w.put(w.dir, ".claude/settings.local.json", "{ not json");
    expect(await modeOf(w)).toMatchObject({ name: "plan", level: "user" });
    const { problems } = await w.registry.read(w.dir);
    expect(problems).toHaveLength(1);
    expect(problems.join("\n")).toContain(".claude/settings.local.json");
  });

  it("starts on Ask with a problem naming the file for a mode Featra doesn't run, whatever sits below it", async () => {
    const w = await world();
    await w.put(w.home, ".claude/settings.json", settings("bypassPermissions"));
    await w.put(w.dir, ".claude/settings.json", settings("yolo"));
    const { roles, problems } = await w.registry.read(w.dir);
    expect(roles.every((r) => r.mode === undefined)).toBe(true);
    expect(roles[0]?.note).toContain(".claude/settings.json");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(".claude/settings.json");
  });

  it("starts in Ask with no home folder and no project setting", async () => {
    const w = await world({ home: false });
    await w.put(w.home, ".claude/settings.json", settings("bypassPermissions"));
    expect(await modeOf(w)).toBeUndefined();
    await w.put(w.dir, ".claude/settings.json", settings("plan"));
    expect(await modeOf(w)).toMatchObject({ name: "plan", level: "project" });
  });

  it("follows CLAUDE_CONFIG_DIR for the user's settings", async () => {
    const other = await world();
    const w = await world({ env: { CLAUDE_CONFIG_DIR: other.home + "/cfg" } });
    await w.put(other.home, "cfg/settings.json", settings("plan"));
    await w.put(w.home, ".claude/settings.json", settings("auto"));
    expect(await modeOf(w)).toMatchObject({ name: "plan", level: "user" });
  });

  it("reads the settings live, never writes them, and only chats started afterwards take the change", async () => {
    const w = await world();
    const settingsFile = await w.put(w.home, ".claude/settings.json", settings("plan"));
    const before = await w.contents(w.home);
    const first = await start(w, "developer");
    await w.put(w.home, ".claude/settings.json", settings("acceptEdits"));
    const later = await start(w, "developer");
    expect((await first.send()).permissionMode).toBe("plan");
    expect((await later.send()).permissionMode).toBe("acceptEdits");
    expect(first.manager.watch(first.id, () => {}).mode).toMatchObject({ name: "plan", level: "user" });
    expect(await w.read(settingsFile)).toBe(settings("acceptEdits"));
    expect(Object.keys(await w.contents(w.home))).toEqual(Object.keys(before));
  });
});

const codex = (w: World) => createCodexReader(w.fs).mode(w.dir);

describe("Codex's settings (AC7)", () => {
  it("names no mode without settings, a missing home or a trust entry", async () => {
    expect((await codex(await world())).mode).toBeNull();
    expect((await codex(await world({ home: false }))).mode).toBeNull();
  });

  it("reads approval_policy and sandbox_mode from the user's config, in Codex's own names", async () => {
    const w = await world();
    await w.put(w.home, ".codex/config.toml", 'approval_policy = "on-request"\nsandbox_mode = "read-only"\n');
    expect((await codex(w)).mode).toEqual({
      provider: "codex",
      name: "on-request · read-only",
      level: "user",
      fullAccess: false,
    });
  });

  it("reads a trusted project's own config over the user's, and ignores an untrusted project's", async () => {
    const w = await world();
    await w.put(w.dir, ".codex/config.toml", 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n');
    await w.put(w.home, ".codex/config.toml", 'approval_policy = "untrusted"\n');
    expect((await codex(w)).mode).toMatchObject({ name: "untrusted", level: "user" });
    const trust = `[projects.${JSON.stringify(w.dir)}]\ntrust_level = "trusted"\n`;
    await w.put(w.home, ".codex/config.toml", 'approval_policy = "untrusted"\n' + trust);
    expect((await codex(w)).mode).toMatchObject({
      name: "never · danger-full-access",
      level: "project",
      fullAccess: true,
    });
  });

  it("reads a trusted project with no keys as Codex's own default, and a malformed config as a problem", async () => {
    const w = await world();
    await w.put(w.home, ".codex/config.toml", `[projects.${JSON.stringify(w.dir)}]\ntrust_level = "trusted"\n`);
    expect((await codex(w)).mode).toMatchObject({ name: "on-request · workspace-write" });
    await w.put(w.home, ".codex/config.toml", "approval_policy = ");
    const bad = await codex(w);
    expect(bad.mode).toBeNull();
    expect(bad.problems[0]).toContain("config.toml");
  });

  it("never reads Codex's auth file", async () => {
    const w = await world();
    await w.put(w.home, ".codex/auth.json", '{"OPENAI_API_KEY":"secret"}');
    const read = await codex(w);
    expect(JSON.stringify(read)).not.toContain("secret");
  });
});
