/**
 * STORY-5: a chat from a role, through the real session manager and Claude adapter. Only the Agent SDK's `query` and
 * the PATH lookup are faked (fake-query.ts).
 */
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, foldChat, type ChatEvent } from "@featra/work-format";
import { CHAT_COPY, createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { FAILED } from "../src/claude-messages.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { until } from "./until.ts";

const DIR = "/home/me/demo";
const role = (id: string) => BUILT_IN_ROLES.find((r) => r.id === id)!;
let manager: ChatManager | null = null;
afterEach(() => manager?.close());

/** A chat started from `roleId`, with every event it records. */
async function chat(roleId = "developer", claude = fakeClaude()) {
  manager = createChatManager({ providers: [createClaudeProvider(claude.deps)], roles: createRoleRegistry() });
  const id = await manager.start(DIR, roleId);
  const events: ChatEvent[] = [];
  manager.watch(id, (e) => events.push(e));
  const m = manager;
  return {
    ...claude,
    id,
    events,
    manager: m,
    send: (text: string) => m.send(id, text),
    run: async (n = 0) => {
      await until(() => claude.runs.length > n && (claude.runs[n]?.heard.length ?? 0) > 0);
      return claude.runs[n]!;
    },
    view: () => foldChat(events),
  };
}

describe("AC1: a new chat starts the user's claude with the role's settings", () => {
  it("runs in the project folder with the role prompt appended, the role's model and effort, and Ask", async () => {
    const c = await chat("dev-lead", fakeClaude("C:\\Users\\me\\.local\\bin\\claude.exe"));
    c.send("hello");
    const { options, heard } = await c.run();
    expect(heard).toEqual(["hello"]);
    expect(options.cwd).toBe(DIR);
    expect(options.pathToClaudeCodeExecutable).toBe("C:\\Users\\me\\.local\\bin\\claude.exe");
    expect(options.systemPrompt).toEqual({ type: "preset", preset: "claude_code", append: role("dev-lead").prompt });
    expect(options.model).toBe(role("dev-lead").model);
    expect(options.effort).toBe(role("dev-lead").effort);
    expect(options.permissionMode).toBe("default");
    expect(typeof options.canUseTool).toBe("function");
  });

  it("leaves settingSources to the SDK, so CLAUDE.md, skills and hooks load as usual", async () => {
    const c = await chat();
    c.send("hello");
    const { options } = await c.run();
    expect("settingSources" in options).toBe(false);
  });

  it("passes the user's environment, without the flag that runs Electron as Node", async () => {
    const c = await chat("developer", fakeClaude("/bin/claude", { HOME: "/home/me", ELECTRON_RUN_AS_NODE: "1" }));
    c.send("hello");
    const { options } = await c.run();
    expect(options.env).toEqual({ HOME: "/home/me" });
  });

  it("starts nothing until the first message", async () => {
    const c = await chat();
    expect(c.runs).toHaveLength(0);
  });

  it("refuses a role the project doesn't have", async () => {
    manager = createChatManager({ providers: [createClaudeProvider(fakeClaude().deps)], roles: createRoleRegistry() });
    await expect(manager.start(DIR, "nobody")).rejects.toThrow(CHAT_COPY.unknownRole);
  });
});

describe("AC2: the reply streams, and Stop interrupts the turn", () => {
  it("shows each delta as it comes, once, and ends the turn", async () => {
    const c = await chat();
    c.send("hi");
    const run = await c.run();
    run.say(sdk.init("claude-sonnet-5-5"), sdk.start("m1"), sdk.delta("Hel"));
    await until(() => c.view().items.at(-1)?.kind === "assistant");
    expect(c.view().items.at(-1)).toMatchObject({ kind: "assistant", text: "Hel" });
    expect(c.view().running).toBe(true);
    run.say(sdk.delta("lo"), sdk.assistant("m1", [sdk.text("Hello")]), sdk.success("Hello"));
    await until(() => !c.view().running);
    expect(c.view().items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    expect(c.view().items[1]).toMatchObject({ text: "Hello" });
    expect(c.view().model).toBe("claude-sonnet-5-5");
    expect(c.events.at(-1)).toEqual({ type: "turn-end", outcome: "done" });
  });

  it("interrupts the running turn on Stop, and the turn ends as stopped", async () => {
    const c = await chat();
    c.send("slow");
    const run = await c.run();
    run.say(sdk.init(), sdk.start("m1"), sdk.delta("Thinking"));
    await until(() => c.events.some((e) => e.type === "text"));
    await c.manager.stop(c.id);
    expect(run.interrupts).toBe(1);
    run.say(sdk.failure());
    await until(() => !c.view().running);
    expect(c.events.at(-1)).toEqual({ type: "turn-end", outcome: "stopped" });
    expect(c.view().items.at(-1)).toMatchObject({ kind: "notice", notice: { type: "stopped" } });
  });

  it("does nothing on Stop when no turn runs", async () => {
    const c = await chat();
    await c.manager.stop(c.id);
    expect(c.runs).toHaveLength(0);
  });

  it("refuses a second message while a turn runs, then takes it on the same session", async () => {
    const c = await chat();
    c.send("one");
    const run = await c.run();
    expect(() => c.send("two")).toThrow(CHAT_COPY.busy);
    run.say(sdk.init(), sdk.success());
    await until(() => !c.view().running);
    c.send("two");
    await until(() => run.heard.length === 2);
    expect(run.heard).toEqual(["one", "two"]);
    expect(c.runs).toHaveLength(1);
  });

  it("resumes the session when claude exited between turns", async () => {
    const c = await chat();
    c.send("one");
    const first = await c.run();
    first.say(sdk.init("claude-sonnet-5-5", "session-42"), sdk.success());
    first.end();
    await until(() => !c.view().running);
    c.send("two");
    const second = await c.run(1);
    expect(second.options.resume).toBe("session-42");
    expect(second.heard).toEqual(["two"]);
  });

  it("fails a turn claude left open when it exited", async () => {
    const c = await chat();
    c.send("one");
    const run = await c.run();
    run.say(sdk.init(), sdk.start("m1"), sdk.delta("Half"));
    run.end();
    await until(() => !c.view().running);
    expect(c.events.slice(-2)).toEqual([
      { type: "problem", problem: { type: "failed", message: FAILED } },
      { type: "turn-end", outcome: "failed" },
    ]);
  });

  it("shows why when the stream breaks", async () => {
    const c = await chat();
    c.send("one");
    const run = await c.run();
    run.crash(new Error("claude exited with code 1"));
    await until(() => !c.view().running);
    expect(c.view().items.at(-1)).toMatchObject({
      kind: "notice",
      notice: { type: "failed", message: "claude exited with code 1" },
    });
  });
});

describe("AC3: each tool call is one row with its input and result", () => {
  it("records the call, then its result on the same row", async () => {
    const c = await chat();
    c.send("read it");
    const run = await c.run();
    run.say(
      sdk.init(),
      sdk.assistant("m1", [sdk.toolUse("t1", "Read", { file_path: "src/app.ts" })]),
      sdk.toolResult("t1", [sdk.text("export {}")]),
      sdk.success(),
    );
    await until(() => !c.view().running);
    const tools = c.view().items.filter((i) => i.kind === "tool");
    expect(tools).toEqual([
      expect.objectContaining({
        name: "Read",
        summary: "src/app.ts",
        input: { file_path: "src/app.ts" },
        result: { output: "export {}", isError: false },
        denied: false,
      }),
    ]);
  });

  it("keeps a subagent's own messages out of the chat", async () => {
    const c = await chat();
    c.send("go");
    const run = await c.run();
    run.say(
      sdk.init(),
      sdk.assistant("m1", [sdk.toolUse("t1", "Task", { description: "Find tests" })]),
      { ...sdk.assistant("m2", [sdk.toolUse("t2", "Grep", { pattern: "it(" })]), parent_tool_use_id: "t1" },
      sdk.success(),
    );
    await until(() => !c.view().running);
    expect(
      c
        .view()
        .items.filter((i) => i.kind === "tool")
        .map((i) => i.kind === "tool" && i.name),
    ).toEqual(["Task"]);
  });
});

describe("AC4: a missing or logged-out claude shows one line", () => {
  it("says claude isn't installed, and never starts the agent", async () => {
    const c = await chat("developer", fakeClaude(null));
    c.send("hello");
    await until(() => !c.view().running);
    expect(c.runs).toHaveLength(0);
    expect(c.view().items.filter((i) => i.kind === "notice")).toEqual([
      expect.objectContaining({ notice: { type: "not-installed" } }),
    ]);
  });

  it("says claude isn't logged in when the SDK reports an authentication failure", async () => {
    const c = await chat();
    c.send("hello");
    const run = await c.run();
    run.say(
      sdk.init(),
      sdk.assistant("m1", [sdk.text("Invalid API key · Please run /login")], { error: "authentication_failed" }),
      sdk.failure({ result: "Invalid API key · Please run /login" }),
    );
    await until(() => !c.view().running);
    expect(c.view().items.filter((i) => i.kind !== "user")).toEqual([
      expect.objectContaining({ kind: "notice", notice: { type: "logged-out" } }),
    ]);
  });

  it("reads the login message as logged out when it comes as plain text", async () => {
    const c = await chat();
    c.send("hello");
    const run = await c.run();
    run.say(sdk.init(), sdk.assistant("m1", [sdk.text("Not logged in · Please run /login")]), sdk.success());
    await until(() => !c.view().running);
    expect(c.view().items.filter((i) => i.kind !== "user")).toEqual([
      expect.objectContaining({ kind: "notice", notice: { type: "logged-out" } }),
    ]);
  });

  it("shows a failed start in one line", async () => {
    const claude = fakeClaude();
    claude.deps.loadQuery = async () => {
      throw new Error("Cannot find package '@anthropic-ai/claude-agent-sdk'");
    };
    const c = await chat("developer", claude);
    c.send("hello");
    await until(() => !c.view().running);
    expect(c.view().items.at(-1)).toMatchObject({
      kind: "notice",
      notice: { type: "failed", message: "Cannot find package '@anthropic-ai/claude-agent-sdk'" },
    });
  });
});

describe("AC5: until approvals exist, a tool that needs one is denied and shows as denied", () => {
  it("answers canUseTool with a deny the agent can act on, and marks the row", async () => {
    const c = await chat();
    c.send("test it");
    const run = await c.run();
    run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", { command: "npm test" })]));
    const decision = await run.ask("Bash", { command: "npm test" }, "t1");
    expect(decision).toEqual({ behavior: "deny", message: CHAT_COPY.denied });
    run.say(sdk.toolResult("t1", CHAT_COPY.denied, true), sdk.success());
    await until(() => !c.view().running);
    expect(c.view().items.filter((i) => i.kind === "tool")).toEqual([
      expect.objectContaining({
        name: "Bash",
        summary: "npm test",
        denied: true,
        result: { output: CHAT_COPY.denied, isError: true },
      }),
    ]);
  });

  it("takes another approval handler in its place (the STORY-45 seam)", async () => {
    const claude = fakeClaude();
    manager = createChatManager({
      providers: [createClaudeProvider(claude.deps)],
      roles: createRoleRegistry(),
      approve: async (request) => ({ allow: true, input: { ...request.input, approved: request.chat } }),
      newId: () => "chat-1",
    });
    const id = await manager.start(DIR, "qa");
    manager.send(id, "go");
    await until(() => claude.runs[0]?.heard.length === 1);
    const decision = await claude.runs[0]!.ask("Bash", { command: "ls" }, "t1");
    expect(decision).toEqual({ behavior: "allow", updatedInput: { command: "ls", approved: "chat-1" } });
  });
});
