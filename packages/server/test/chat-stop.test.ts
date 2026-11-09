/**
 * STORY-5 review fixes: Stop marks only the turn that is running, a watcher or a failed lookup can't break a chat, and a tool request
 * Stop cut short shows as stopped, not denied. Real session manager and Claude adapter; `query` and the lookup are fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, foldChat, type ChatEvent } from "@featra/work-format";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { chat, closeChats, DIR } from "./chat-fixture.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const CLAUDE = "/usr/local/bin/claude";

/** The first lookup waits for the test's answer, so Stop can land while Featra is still finding `claude`. */
function slowLookup(claude = fakeClaude()) {
  let answer: ((path: string | null) => void) | undefined;
  const first = new Promise<string | null>((resolve) => (answer = resolve));
  let calls = 0;
  claude.deps.locate = () => (calls++ === 0 ? first : Promise.resolve(CLAUDE));
  return { claude, answer: (path: string | null) => answer?.(path) };
}

const outcomes = (events: ChatEvent[]) => events.flatMap((e) => (e.type === "turn-end" ? [e.outcome] : []));

describe("Stop marks only the turn that is running", () => {
  it("ends the turn as stopped when Stop comes before the agent started, and starts it afresh next time", async () => {
    const { claude, answer } = slowLookup();
    const c = await chat("developer", claude);
    c.send("one");
    await c.manager.stop(c.id);
    answer(CLAUDE);
    await until(() => !c.view().running);
    expect(outcomes(c.events)).toEqual(["stopped"]);
    expect(c.runs).toHaveLength(0);

    c.send("two");
    const run = await c.run();
    expect(run.heard).toEqual(["two"]);
    run.say(sdk.init(), sdk.success());
    await until(() => !c.view().running);
    expect(outcomes(c.events)).toEqual(["stopped", "done"]);
  });

  it("doesn't carry a Stop from a not-installed turn into the next one", async () => {
    const { claude, answer } = slowLookup();
    const c = await chat("developer", claude);
    c.send("one");
    await c.manager.stop(c.id);
    answer(null);
    await until(() => !c.view().running);

    c.send("two");
    const run = await c.run();
    run.say(sdk.init(), sdk.success());
    await until(() => outcomes(c.events).length === 2);
    expect(outcomes(c.events).at(-1)).toBe("done");
  });

  it("ignores a Stop that lands after the turn ended", async () => {
    const claude = fakeClaude();
    const events: ChatEvent[] = [];
    const session = createClaudeProvider(claude.deps).start({
      chat: "c1",
      cwd: DIR,
      role: BUILT_IN_ROLES[0]!,
      emit: (e) => events.push(e),
      approve: async () => ({ allow: false, message: "No." }),
      ask: async () => ({ allow: false, message: "No." }),
    });
    session.send("one");
    await until(() => claude.runs[0]?.heard.length === 1);
    const run = claude.runs[0]!;
    run.say(sdk.init(), sdk.success());
    await until(() => outcomes(events).length === 1);
    await session.interrupt();
    expect(run.interrupts).toBe(0);
    session.send("two");
    await until(() => run.heard.length === 2);
    run.say(sdk.success());
    await until(() => outcomes(events).length === 2);
    expect(outcomes(events)).toEqual(["done", "done"]);
    session.close();
  });
});

describe("a watcher can't break the chat", () => {
  it("keeps the turn and the other watchers going when one watcher throws", async () => {
    const logged: string[] = [];
    const c = await chat("developer", fakeClaude(), { log: (m) => logged.push(m) });
    c.manager.watch(c.id, (e) => {
      if (e.type === "text") throw new Error("socket gone");
    });
    const later: ChatEvent[] = [];
    c.manager.watch(c.id, (e) => later.push(e));
    c.send("hi");
    const run = await c.run();
    run.say(sdk.init(), sdk.start("m1"), sdk.delta("Hello"), sdk.success("Hello"));
    await until(() => !foldChat(later).running && later.length > 1);
    expect(foldChat(later).items.at(-1)).toMatchObject({ kind: "assistant", text: "Hello" });
    expect(outcomes(later)).toEqual(["done"]);
    expect(logged).toEqual(["A chat watcher failed: socket gone"]);
  });
});

describe("a lookup that throws", () => {
  it("fails the turn with why, and takes the next message", async () => {
    const claude = fakeClaude();
    let calls = 0;
    claude.deps.locate = () =>
      calls++ === 0 ? Promise.reject(new Error("where.exe failed")) : Promise.resolve(CLAUDE);
    const c = await chat("developer", claude);
    c.send("hi");
    await until(() => outcomes(c.events).length === 1);
    expect(c.events).toContainEqual({ type: "problem", problem: { type: "failed", message: "where.exe failed" } });
    expect(outcomes(c.events)).toEqual(["failed"]);
    c.send("again");
    (await c.run()).say(sdk.init(), sdk.success());
    await until(() => outcomes(c.events).length === 2);
    expect(outcomes(c.events)).toEqual(["failed", "done"]);
  });
});

describe("a tool request that Stop cut short", () => {
  it("isn't marked denied; the stopped turn marks its row stopped", async () => {
    const c = await chat("developer", fakeClaude(), {
      // An approval waits for the user (STORY-45); Stop ends the wait.
      approve: (_request, signal) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve({ allow: false, message: "Stopped." }), { once: true }),
        ),
    });
    c.send("test it");
    const run = await c.run();
    run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", { command: "npm test" })]));
    await until(() => c.events.some((e) => e.type === "tool"));
    const asked = run.ask("Bash", { command: "npm test" }, "t1");
    await c.manager.stop(c.id);
    expect(await asked).toEqual({ behavior: "deny", message: "Stopped." });
    run.say(sdk.failure());
    await until(() => !c.view().running);
    expect(c.events.some((e) => e.type === "tool-denied")).toBe(false);
    expect(c.view().items.find((i) => i.kind === "tool")).toMatchObject({ denied: false, stopped: true });
  });
});
