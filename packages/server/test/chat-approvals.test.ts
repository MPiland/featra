/**
 * STORY-45: inline tool approvals, through the real session manager, Claude adapter and approval desk. Only the SDK's
 * `query` (and the `canUseTool` calls it makes) and the `claude` lookup are fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { APPROVAL_CANCELLED, BUILT_IN_ROLES, CHAT_MESSAGES, denyMessage, type ChatEvent } from "@featra/work-format";
import { claudeOptions, SDK_PERMISSION_MODES } from "../src/claude-provider.ts";
import { chat, closeChats, DIR } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const BASH = { command: "npm test" };

/** A chat whose agent has just called `name` and is about to ask about it. */
async function calling(name = "Bash", input: Record<string, unknown> = BASH, id = "t1") {
  const c = await chat();
  c.send("test it");
  const run = await c.run();
  run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse(id, name, input)]));
  await until(() => c.events.some((e) => e.type === "tool"));
  return { c, run };
}

const tool = (c: Awaited<ReturnType<typeof chat>>, id = "t1") =>
  c.view().items.find((i) => i.kind === "tool" && i.id === id);
const row = (c: Awaited<ReturnType<typeof chat>>) => c.manager.list(DIR)[0]!;
const of = (events: ChatEvent[], type: ChatEvent["type"]) => events.filter((e) => e.type === type);

describe("AC1, AC2: a tool that needs permission waits inline until the user answers", () => {
  it("shows the tool and its input with the choices, and holds canUseTool until answered", async () => {
    const { c, run } = await calling();
    let answered = false;
    const asked = run.ask("Bash", BASH, "t1").then((d) => ((answered = true), d));
    await until(() => of(c.events, "approval").length === 1);
    expect(of(c.events, "approval")).toEqual([
      { type: "approval", id: "t1", name: "Bash", input: BASH, forChat: true },
    ]);
    expect(tool(c)).toMatchObject({ name: "Bash", input: BASH, approval: { status: "pending", forChat: true } });
    await new Promise((r) => setTimeout(r, 20));
    expect(answered).toBe(false);
    c.manager.approve(c.id, "t1", { choice: "allow" });
    expect(await asked).toEqual({ behavior: "allow", updatedInput: BASH });
    expect(tool(c)).toMatchObject({ approval: { status: "allowed", scope: "once" }, denied: false });
  });

  it("sends Deny's reason to the agent through canUseTool, and marks the row denied with it", async () => {
    const { c, run } = await calling();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "deny", reason: "Run the unit tests only." });
    expect(await asked).toEqual({ behavior: "deny", message: denyMessage("Run the unit tests only.") });
    expect(denyMessage("Run the unit tests only.")).toContain("Run the unit tests only.");
    expect(tool(c)).toMatchObject({ denied: true, reason: "Run the unit tests only.", approval: null });
  });

  it("denies without a reason too, telling the agent the user denied it", async () => {
    const { c, run } = await calling();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "deny" });
    expect(await asked).toEqual({ behavior: "deny", message: denyMessage() });
    expect(tool(c)).toMatchObject({ denied: true, reason: null });
  });

  it("refuses an answer to a request that isn't waiting, and a second answer to one", async () => {
    const { c, run } = await calling();
    expect(() => c.manager.approve(c.id, "t1", { choice: "allow" })).toThrow(CHAT_MESSAGES.noRequest);
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "allow" });
    expect(() => c.manager.approve(c.id, "t1", { choice: "deny" })).toThrow(CHAT_MESSAGES.noRequest);
    expect(await asked).toMatchObject({ behavior: "allow" });
  });

  it("asks again for the same call after a plain Allow", async () => {
    const { c, run } = await calling();
    const first = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "allow" });
    await first;
    void run.ask("Bash", BASH, "t2");
    await until(() => of(c.events, "approval").length === 2);
    expect(of(c.events, "approval")[1]).toMatchObject({ id: "t2", name: "Bash", input: BASH });
  });
});

describe("Allow for this chat", () => {
  it("allows the same shell command again without asking, and shows it allowed for this chat", async () => {
    const { c, run } = await calling();
    const first = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "allow-chat" });
    expect(await first).toEqual({ behavior: "allow", updatedInput: BASH });
    run.say(sdk.assistant("m2", [sdk.toolUse("t2", "Bash", BASH)]));
    await until(() => tool(c, "t2") !== undefined);
    expect(await run.ask("Bash", BASH, "t2")).toEqual({ behavior: "allow", updatedInput: BASH });
    expect(of(c.events, "approval")).toHaveLength(1);
    expect(c.events).toContainEqual({ type: "tool-allowed", id: "t2", name: "Bash", input: BASH, scope: "chat" });
    expect(tool(c, "t2")).toMatchObject({ approval: { status: "allowed", scope: "chat" } });
  });

  it("marks a call allowed for this chat even when the agent asks before its tool row is in", async () => {
    const { c, run } = await calling();
    const first = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "allow-chat" });
    await first;
    // The SDK's permission callback can run before its message reaches the chat.
    expect(await run.ask("Bash", BASH, "t2")).toEqual({ behavior: "allow", updatedInput: BASH });
    run.say(sdk.assistant("m2", [sdk.toolUse("t2", "Bash", BASH)]));
    await until(() => c.events.filter((e) => e.type === "tool").length === 2);
    expect(tool(c, "t2")).toMatchObject({ name: "Bash", input: BASH, approval: { status: "allowed", scope: "chat" } });
  });

  it("still asks for another shell command: it matches the exact command, not the tool", async () => {
    const { c, run } = await calling();
    const first = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "allow-chat" });
    await first;
    void run.ask("Bash", { command: "rm -rf ." }, "t2");
    await until(() => of(c.events, "approval").length === 2);
    expect(of(c.events, "approval")[1]).toMatchObject({ id: "t2", input: { command: "rm -rf ." } });
  });

  it("covers every call of any other tool by its name", async () => {
    const { c, run } = await calling("Write", { file_path: "a.ts", content: "x" });
    const first = run.ask("Write", { file_path: "a.ts", content: "x" }, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "allow-chat" });
    await first;
    const second = await run.ask("Write", { file_path: "b.ts", content: "y" }, "t2");
    expect(second).toEqual({ behavior: "allow", updatedInput: { file_path: "b.ts", content: "y" } });
    expect(of(c.events, "approval")).toHaveLength(1);
  });

  it("isn't offered, taken or applied for a call the agent says may only be allowed once", async () => {
    const { c, run } = await calling();
    const once = { suppressAlwaysAllowRule: true };
    const first = run.ask("Bash", BASH, "t1", once);
    await until(() => of(c.events, "approval").length === 1);
    expect(of(c.events, "approval")[0]).toMatchObject({ forChat: false });
    expect(() => c.manager.approve(c.id, "t1", { choice: "allow-chat" })).toThrow(CHAT_MESSAGES.onceOnly);
    c.manager.approve(c.id, "t1", { choice: "allow" });
    await first;
    // A rule from another call doesn't cover it either.
    const plain = run.ask("Bash", BASH, "t2");
    await until(() => of(c.events, "approval").length === 2);
    c.manager.approve(c.id, "t2", { choice: "allow-chat" });
    await plain;
    void run.ask("Bash", BASH, "t3", once);
    await until(() => of(c.events, "approval").length === 3);
  });

  it("is this chat's only: another chat still asks", async () => {
    const { c, run } = await calling();
    const first = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.approve(c.id, "t1", { choice: "allow-chat" });
    await first;
    const other = await calling();
    void other.run.ask("Bash", BASH, "t1");
    await until(() => of(other.c.events, "approval").length === 1);
    expect(of(other.c.events, "tool-allowed")).toEqual([]);
  });
});

describe("AC4: a chat waiting on an approval is marked waiting", () => {
  it("waits on the approval while it is open, and on nothing once it is answered and the turn goes on", async () => {
    const { c, run } = await calling();
    expect(row(c).waiting).toBeNull();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => row(c).waiting === "approval");
    c.manager.approve(c.id, "t1", { choice: "allow" });
    await asked;
    expect(row(c)).toMatchObject({ waiting: null, running: true });
    run.say(sdk.toolResult("t1", "ok"), sdk.success());
    await until(() => !row(c).running);
    expect(row(c).waiting).toBe("reply");
  });

  it("keeps waiting while a second request is still open", async () => {
    const { c, run } = await calling();
    const one = run.ask("Bash", BASH, "t1");
    void run.ask("Bash", { command: "ls" }, "t2");
    await until(() => of(c.events, "approval").length === 2);
    c.manager.approve(c.id, "t1", { choice: "allow" });
    await one;
    expect(row(c).waiting).toBe("approval");
    c.manager.approve(c.id, "t2", { choice: "deny" });
    await until(() => row(c).waiting === null);
  });
});

describe("a pending approval when the request ends unanswered", () => {
  it("Stop: the request is cancelled, the agent told so, the row stopped (not denied), nothing waits", async () => {
    const { c, run } = await calling();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => row(c).waiting === "approval");
    await c.manager.stop(c.id);
    expect(await asked).toEqual({ behavior: "deny", message: APPROVAL_CANCELLED });
    expect(c.events).toContainEqual({ type: "approval-cancelled", id: "t1" });
    run.say(sdk.failure());
    await until(() => !c.view().running);
    expect(tool(c)).toMatchObject({ denied: false, stopped: true, approval: null });
    expect(of(c.events, "tool-denied")).toEqual([]);
    expect(row(c).waiting).toBeNull();
    expect(() => c.manager.approve(c.id, "t1", { choice: "allow" })).toThrow(CHAT_MESSAGES.noRequest);
  });

  it("the agent cancels it: the row is cancelled, not denied, and the turn goes on", async () => {
    const { c, run } = await calling();
    const abort = new AbortController();
    const asked = run.ask("Bash", BASH, "t1", { signal: abort.signal });
    await until(() => row(c).waiting === "approval");
    abort.abort();
    expect(await asked).toEqual({ behavior: "deny", message: APPROVAL_CANCELLED });
    expect(tool(c)).toMatchObject({ denied: false, cancelled: true, approval: null });
    expect(row(c)).toMatchObject({ waiting: null, running: true });
  });

  it("the chat closes: the request ends, quietly, and the chat is left waiting on nothing but a reply", async () => {
    const { c, run } = await calling();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => row(c).waiting === "approval");
    const before = c.events.length;
    c.manager.closeProjects(() => false);
    expect(await asked).toEqual({ behavior: "deny", message: APPROVAL_CANCELLED });
    expect(c.events).toHaveLength(before);
    c.manager.closeProjects(() => true);
    expect(row(c)).toMatchObject({ running: false, waiting: "reply" });
  });
});

describe("AC3: each role has a permission mode; the built-in five are Ask", () => {
  it("starts every built-in role in Ask, which is the SDK's default mode with canUseTool asked", () => {
    for (const role of BUILT_IN_ROLES) {
      expect(role.permission).toBe("ask");
      const options = claudeOptions(
        role,
        DIR,
        "/bin/claude",
        async () => ({ behavior: "deny", message: "" }),
        {},
        null,
      );
      expect(options.permissionMode).toBe(SDK_PERMISSION_MODES[role.permission]);
      expect(options.permissionMode).toBe("default");
    }
  });
});
