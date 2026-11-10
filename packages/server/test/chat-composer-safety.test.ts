/**
 * STORY-22 review: what the composer must never do. Full access has a ceiling (the mode a chat started in), changes made
 * at the same time or while an agent starts or waits on an approval are never lost or misapplied, and several changes
 * before one message make one restart. Real session manager, role registry, readers and Claude adapter; only the SDK's
 * `query`, the PATH lookup and the folders are fake.
 */
import { writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, type SettingsChange } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { roleWorld, settings } from "./role-world.ts";
import { until } from "./until.ts";

type World = Awaited<ReturnType<typeof roleWorld>>;
const worlds: World[] = [];
const managers: ChatManager[] = [];
afterEach(async () => {
  for (const m of managers.splice(0)) m.close();
  for (const w of worlds.splice(0)) await w.dispose();
});

/** A promise and the call that settles it. */
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const BYPASS_ROLE = "claude:project:bypassPermissions";
const NO_BYPASS = JSON.stringify({ permissions: { disableBypassPermissionsMode: "disable" } });
const bypassAgent = "---\nname: bypassPermissions\npermissionMode: bypassPermissions\n---\nGo.";

/** A project with a role that starts in full access, and a chat manager over it. */
async function app(opts: { noBypass?: boolean; noAuto?: string; claude?: ReturnType<typeof fakeClaude> } = {}) {
  const w = await roleWorld();
  worlds.push(w);
  await w.put(w.dir, ".claude/agents/bypassPermissions.md", bypassAgent);
  if (opts.noBypass) await writeFile(w.managedFile, NO_BYPASS, "utf8");
  if (opts.noAuto) await writeFile(w.managedFile, opts.noAuto, "utf8");
  const claude = opts.claude ?? fakeClaude();
  const manager = createChatManager({ providers: [createClaudeProvider(claude.deps)], roles: w.registry });
  managers.push(manager);
  return { w, claude, manager, start: (role: string) => manager.start(w.dir, role) };
}

/** Runs one turn to its end, so the session exists and the next turn resumes it. */
async function turn(a: Awaited<ReturnType<typeof app>>, id: string, n: number, text = `turn ${n}`) {
  a.manager.send(id, text);
  await until(() => a.claude.runs.length > n || (a.claude.runs[n]?.heard.length ?? 0) > 0);
  const run = a.claude.runs.at(-1)!;
  await until(() => run.heard.length > 0);
  run.say(sdk.init("m", "session-1"), sdk.success("ok"));
  await until(() => !a.manager.list(a.w.dir)[0]?.running);
  return run;
}

const modes = async (a: Awaited<ReturnType<typeof app>>, id: string) =>
  (await a.manager.controls(id)).controls.modes.map((m) => m.value);

describe("full access is capped by the mode the chat started in", () => {
  it("is not carried into a chat by a role change: the chat stays in its asking mode, and can't pick it", async () => {
    const a = await app();
    const id = await a.start("qa");
    await a.manager.open(id);
    const state = await a.manager.configure(id, { role: BYPASS_ROLE });
    expect(state.settings).toMatchObject({ role: BYPASS_ROLE, mode: "default" });
    expect(await modes(a, id)).not.toContain("bypassPermissions");
    await expect(a.manager.configure(id, { mode: "bypassPermissions" })).rejects.toThrow(CHAT_MESSAGES.badSetting);
    await turn(a, id, 0);
    expect(a.claude.runs).toHaveLength(1);
    expect(a.claude.runs[0]!.options.permissionMode).toBe("default");
    expect(a.claude.runs[0]!.options).not.toHaveProperty("allowDangerouslySkipPermissions");
  });

  it("is not reached by a role change together with a mode pick either", async () => {
    const a = await app();
    const id = await a.start("qa");
    await expect(a.manager.configure(id, { role: BYPASS_ROLE, mode: "bypassPermissions" })).rejects.toThrow(
      CHAT_MESSAGES.badSetting,
    );
    expect((await a.manager.controls(id)).settings.role).toBe("qa");
  });

  it("is kept by a chat that started in it: it can step down and back, and a role change back restores it", async () => {
    const a = await app();
    const id = await a.start(BYPASS_ROLE);
    expect((await a.manager.controls(id)).settings.mode).toBe("bypassPermissions");
    await a.manager.configure(id, { mode: "plan" });
    expect((await a.manager.configure(id, { mode: "bypassPermissions" })).settings.mode).toBe("bypassPermissions");
    await a.manager.configure(id, { role: "qa" });
    expect(await modes(a, id)).not.toContain("bypassPermissions");
    const back = await a.manager.configure(id, { role: BYPASS_ROLE });
    expect(back.settings.mode).toBe("bypassPermissions");
    expect(await modes(a, id)).toContain("bypassPermissions");
  });

  it("is never offered when Claude's settings disable bypass (disableBypassPermissionsMode), by any path", async () => {
    const a = await app({ noBypass: true });
    const id = await a.start("qa");
    // The agent's own bypass is turned off by the setting, so its role starts in Ask.
    const state = await a.manager.configure(id, { role: BYPASS_ROLE });
    expect(state.settings.mode).toBe("default");
    expect(await modes(a, id)).not.toContain("bypassPermissions");
    await expect(a.manager.configure(id, { mode: "bypassPermissions" })).rejects.toThrow(CHAT_MESSAGES.badSetting);
    await turn(a, id, 0);
    expect(a.claude.runs[0]!.options.permissionMode).toBe("default");
    expect(a.claude.runs[0]!.options).not.toHaveProperty("allowDangerouslySkipPermissions");
    // Nor does a chat started from it have it.
    const direct = await a.start(BYPASS_ROLE);
    expect((await a.manager.controls(direct)).settings.mode).toBe("default");
    await expect(a.manager.configure(direct, { mode: "bypassPermissions" })).rejects.toThrow(CHAT_MESSAGES.badSetting);
  });

  it("is not offered by Claude's own default mode setting either: only an explicit start in it counts", async () => {
    const a = await app();
    await a.w.put(a.w.home, ".claude/settings.json", settings("plan"));
    const id = await a.start("qa");
    expect(await modes(a, id)).not.toContain("bypassPermissions");
  });
});

describe("auto mode is offered, unless Claude's settings disable it (disableAutoMode)", () => {
  const nested = JSON.stringify({ permissions: { disableAutoMode: "disable" } });
  const topLevel = JSON.stringify({ disableAutoMode: "disable" });

  it("is offered from the composer, and the user may pick it", async () => {
    const a = await app();
    const id = await a.start("qa");
    expect(await modes(a, id)).toContain("auto");
    expect((await a.manager.configure(id, { mode: "auto" })).settings.mode).toBe("auto");
  });

  it.each([
    ["permissions.disableAutoMode", nested],
    ["a top-level disableAutoMode", topLevel],
  ])("is not offered or accepted when %s is set", async (_name, file) => {
    const a = await app({ noAuto: file });
    const id = await a.start("qa");
    expect(await modes(a, id)).not.toContain("auto");
    await expect(a.manager.configure(id, { mode: "auto" })).rejects.toThrow(CHAT_MESSAGES.badSetting);
    // A role change doesn't bring it back either.
    await a.manager.configure(id, { role: "developer" });
    expect(await modes(a, id)).not.toContain("auto");
  });

  it("starts a role whose agent asks for auto in Ask, with a note", async () => {
    const a = await app({ noAuto: nested });
    await a.w.put(
      a.w.dir,
      ".claude/agents/autopilot.md",
      ["---", "name: autopilot", "permissionMode: auto", "---", "Go."].join("\n"),
    );
    const role = await a.w.registry.get(a.w.dir, "claude:project:autopilot");
    expect(role?.mode).toBeUndefined();
    expect(role?.note).toContain("auto");
    const id = await a.start("claude:project:autopilot");
    expect((await a.manager.controls(id)).settings.mode).toBe("default");
  });

  it("starts in Ask, with a note, when Claude's own default mode is auto", async () => {
    const a = await app({ noAuto: nested });
    await a.w.put(a.w.home, ".claude/settings.json", settings("auto"));
    const role = await a.w.registry.get(a.w.dir, "qa");
    expect(role?.mode).toBeUndefined();
    expect(role?.note).toContain("auto");
    const id = await a.start("qa");
    expect((await a.manager.controls(id)).settings.mode).toBe("default");
  });
});

describe("changes made at once", () => {
  it("never overwrites a model or effort change made while a role change waits on its lookup", async () => {
    const a = await app();
    const { promise: lookup, resolve: release } = gate<void>();
    const registry = {
      ...a.w.registry,
      get: async (dir: string, id: string) => {
        if (id === "qa") await lookup;
        return a.w.registry.get(dir, id);
      },
    };
    const manager = createChatManager({ providers: [createClaudeProvider(a.claude.deps)], roles: registry });
    managers.push(manager);
    const id = await manager.start(a.w.dir, "developer");
    const role = manager.configure(id, { role: "qa" });
    const model = manager.configure(id, { model: "opus", effort: "low" });
    release();
    await Promise.all([role, model]);
    // The role change came first, so the model and effort picked after it stand on top of it.
    expect((await manager.controls(id)).settings).toEqual({
      role: "qa",
      model: "opus",
      effort: "low",
      mode: "default",
    });
  });

  it("makes one restart for several changes before one message, with the last of each", async () => {
    const a = await app();
    const id = await a.start("developer");
    await turn(a, id, 0);
    const changes: SettingsChange[] = [{ model: "opus" }, { effort: "low" }, { mode: "plan" }, { model: "haiku" }];
    for (const change of changes) await a.manager.configure(id, change);
    expect(a.claude.runs).toHaveLength(1);
    a.manager.send(id, "next");
    await until(() => a.claude.runs.length === 2);
    expect(a.claude.runs[1]!.options).toMatchObject({
      model: "haiku",
      effort: "low",
      permissionMode: "plan",
      resume: "session-1",
    });
    expect(a.claude.runs).toHaveLength(2);
  });

  it("leaves a turn waiting on an approval alone, and applies the change to the turn after it", async () => {
    const a = await app();
    const id = await a.start("developer");
    a.manager.send(id, "go");
    await until(() => a.claude.runs.length === 1 && a.claude.runs[0]!.heard.length === 1);
    const run = a.claude.runs[0]!;
    run.say(sdk.init("m", "session-1"));
    const asked = run.ask("Bash", { command: "npm test" }, "t1");
    await until(() => a.manager.list(a.w.dir)[0]?.waiting === "approval");
    await a.manager.configure(id, { model: "opus", mode: "plan" });
    // The pending request is still answerable, and the running agent was not replaced or interrupted.
    expect(run.closed).toBe(false);
    expect(run.interrupts).toBe(0);
    expect(a.claude.runs).toHaveLength(1);
    a.manager.approve(id, "t1", { choice: "allow" });
    expect(await asked).toMatchObject({ behavior: "allow" });
    run.say(sdk.success("done"));
    await until(() => !a.manager.list(a.w.dir)[0]?.running);
    a.manager.send(id, "again");
    await until(() => a.claude.runs.length === 2);
    expect(a.claude.runs[1]!.options).toMatchObject({ model: "opus", permissionMode: "plan", resume: "session-1" });
  });
});

describe("a change made while the agent starts", () => {
  it("applies from the turn after, and the next message replaces the agent", async () => {
    const { promise: found, resolve: release } = gate<string>();
    const claude = fakeClaude();
    const slow = { ...claude.deps, locate: () => found };
    const a = await app({ claude: { ...claude, deps: slow } });
    const id = await a.start("developer");
    a.manager.send(id, "first");
    await a.manager.configure(id, { model: "opus" });
    release("/usr/local/bin/claude");
    await until(() => claude.runs.length === 1);
    // The agent that was starting runs this turn as the chat was when the message was sent.
    expect(claude.runs[0]!.options.model).toBe("sonnet");
    claude.runs[0]!.say(sdk.init("m", "session-1"), sdk.success("ok"));
    await until(() => !a.manager.list(a.w.dir)[0]?.running);
    a.manager.send(id, "second");
    await until(() => claude.runs.length === 2);
    expect(claude.runs[1]!.options).toMatchObject({ model: "opus", resume: "session-1" });
  });
});
