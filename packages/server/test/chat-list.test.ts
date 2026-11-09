/**
 * STORY-21: the session manager's chat list, through the real manager and Claude adapter. Only the Agent SDK's
 * `query`, the PATH lookup and the clock are faked.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { ChatSummary } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { until } from "./until.ts";

const DIR = "/home/me/demo";
const OTHER = "/home/me/other";
const managers: ChatManager[] = [];

afterEach(() => {
  for (const m of managers.splice(0)) m.close();
});

/** A manager on a clock that ticks one minute per chat started. */
function setup(claudePath: string | null = "/usr/local/bin/claude") {
  const claude = fakeClaude(claudePath);
  let minute = 0;
  const manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    now: () => new Date(Date.UTC(2026, 10, 9, 10, minute++)),
  });
  managers.push(manager);
  return { claude, manager };
}

describe("AC1: New chat starts a plain chat", () => {
  it("lists each chat started in the project, stamped by the clock and named by its role", async () => {
    const { manager } = setup();
    const a = await manager.start(DIR, "developer");
    const b = await manager.start(DIR, "qa");
    await manager.start(OTHER, "qa");
    expect(manager.list(DIR)).toEqual([
      expect.objectContaining({ id: a, provider: "claude", title: null, startedAt: "2026-11-09T10:00:00.000Z" }),
      expect.objectContaining({ id: b, provider: "claude", title: null, startedAt: "2026-11-09T10:01:00.000Z" }),
    ]);
    expect(manager.list(DIR).map((c) => c.role.name)).toEqual(["Developer", "QA"]);
  });
});

describe("AC2: grouped by the providers the user has installed", () => {
  it("reports each registered provider by its name, installed when its agent is found", async () => {
    expect(await setup().manager.providers()).toEqual([{ id: "claude", name: "Claude Code", installed: true }]);
    expect(await setup(null).manager.providers()).toEqual([{ id: "claude", name: "Claude Code", installed: false }]);
  });

  it("reads a lookup that throws as not installed", async () => {
    const claude = fakeClaude();
    const manager = createChatManager({
      providers: [createClaudeProvider({ ...claude.deps, locate: () => Promise.reject(new Error("where failed")) })],
      roles: createRoleRegistry(),
    });
    managers.push(manager);
    expect(await manager.providers()).toEqual([{ id: "claude", name: "Claude Code", installed: false }]);
  });
});

describe("AC3: a chat waiting on the user", () => {
  it("pushes the list when a chat starts, a turn starts and a turn ends, but not for each streamed delta", async () => {
    const { claude, manager } = setup();
    const heard: ChatSummary[][] = [];
    const watch = manager.watchList(DIR, (chats) => heard.push(chats));
    expect(watch.chats).toEqual([]);

    const id = await manager.start(DIR, "developer");
    expect(heard).toHaveLength(1);
    manager.send(id, "Fix the login bug\nplease");
    expect(heard).toHaveLength(2);
    expect(heard[1]![0]).toMatchObject({ title: "Fix the login bug", running: true, waiting: null });

    await until(() => (claude.runs[0]?.heard.length ?? 0) > 0);
    const run = claude.runs[0]!;
    run.say(sdk.init(), sdk.start("m1"), sdk.delta("Looking"), sdk.delta(" at it"));
    await until(() => manager.watch(id, () => {}).events.length >= 3);
    expect(heard).toHaveLength(2);

    run.say(sdk.success());
    await until(() => heard.length === 3);
    expect(heard[2]![0]).toMatchObject({ running: false, waiting: "reply" });

    manager.send(id, "and the tests");
    expect(heard[3]![0]).toMatchObject({ title: "Fix the login bug", running: true, waiting: null });
    watch.stop();
  });

  it("doesn't wait after the user stops the turn", async () => {
    const { claude, manager } = setup();
    const id = await manager.start(DIR, "developer");
    manager.send(id, "slow");
    await until(() => (claude.runs[0]?.heard.length ?? 0) > 0);
    claude.runs[0]!.say(sdk.init(), sdk.start("m1"), sdk.delta("Thinking"));
    await until(() => manager.watch(id, () => {}).events.some((e) => e.type === "text"));
    await manager.stop(id);
    claude.runs[0]!.say(sdk.failure());
    await until(() => manager.list(DIR)[0]?.running === false);
    expect(manager.list(DIR)[0]?.waiting).toBeNull();
  });
});

describe("the list's watchers", () => {
  it("hears only its own project, and a closed project's chats leave its list", async () => {
    const { manager } = setup();
    const mine: ChatSummary[][] = [];
    manager.watchList(DIR, (chats) => mine.push(chats));
    await manager.start(OTHER, "qa");
    expect(mine).toEqual([]);
    await manager.start(DIR, "qa");
    manager.closeProjects((dir) => dir !== DIR);
    expect(mine.at(-1)).toEqual([]);
    expect(manager.list(OTHER)).toHaveLength(1);
  });

  it("stops hearing after stop, and a watcher that throws doesn't stop the others", async () => {
    const { manager } = setup();
    const heard: number[] = [];
    const stopped = manager.watchList(DIR, () => heard.push(1));
    manager.watchList(DIR, () => {
      throw new Error("socket closed");
    });
    manager.watchList(DIR, () => heard.push(3));
    stopped.stop();
    await manager.start(DIR, "qa");
    expect(heard).toEqual([3]);
  });
});
