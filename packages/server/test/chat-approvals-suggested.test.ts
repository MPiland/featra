/**
 * STORY-45: Allow for this chat uses the provider's own rule first (decided by the user, 2026-11-09). Through the real
 * session manager, Claude adapter and approval desk; only the SDK's `query` (and its `canUseTool` calls, which apply
 * session allow rules as Claude does) is fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import type { ChatEvent } from "@featra/work-format";
import { chat, closeChats } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const BASH = { command: "npm test" };
const of = (events: ChatEvent[], type: ChatEvent["type"]) => events.filter((e) => e.type === type);
/** Claude's suggestion for a Bash call: a rule for the user's local settings, as the SDK docs describe. */
const SUGGESTED: PermissionUpdate[] = [
  {
    type: "addRules",
    rules: [{ toolName: "Bash", ruleContent: "npm test:*" }],
    behavior: "allow",
    destination: "localSettings",
  },
  { type: "setMode", mode: "acceptEdits", destination: "session" },
];

async function asked(input: Record<string, unknown>, suggestions?: PermissionUpdate[]) {
  const c = await chat();
  c.send("test it");
  const run = await c.run();
  run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", input)]));
  await until(() => c.events.some((e) => e.type === "tool"));
  const first = run.ask("Bash", input, "t1", suggestions ? { suggestions } : {});
  await until(() => of(c.events, "approval").length === 1);
  return { c, run, first };
}

describe("Claude suggests a rule: Allow for this chat applies it for the session, and Claude matches", () => {
  it("offers it with a line built from the rule", async () => {
    const { c } = await asked(BASH, SUGGESTED);
    expect(of(c.events, "approval")[0]).toMatchObject({ forChat: true, covers: "npm test commands" });
  });

  it("passes the rule back unchanged but for the session, drops anything else, and later calls never ask", async () => {
    const { c, run, first } = await asked(BASH, SUGGESTED);
    c.manager.approve(c.id, "t1", { choice: "allow-chat" });
    expect(await first).toEqual({
      behavior: "allow",
      updatedInput: BASH,
      updatedPermissions: [{ ...SUGGESTED[0], destination: "session" }],
    });

    expect(await run.ask("Bash", BASH, "t2", { suggestions: SUGGESTED })).toEqual({
      behavior: "allow",
      updatedInput: BASH,
    });
    expect(of(c.events, "approval")).toHaveLength(1);
    expect(of(c.events, "tool-allowed")).toHaveLength(1);
  });

  it("passes nothing back on a plain Allow", async () => {
    const { c, first } = await asked(BASH, SUGGESTED);
    c.manager.approve(c.id, "t1", { choice: "allow" });
    expect(await first).toEqual({ behavior: "allow", updatedInput: BASH });
  });

  it("offers nothing for the chat when Claude says not to offer an always-allow", async () => {
    const c = await chat();
    c.send("test it");
    const run = await c.run();
    void run.ask("Bash", BASH, "t1", { suggestions: SUGGESTED, suppressAlwaysAllowRule: true });
    await until(() => of(c.events, "approval").length === 1);
    expect(of(c.events, "approval")[0]).toEqual({
      type: "approval",
      id: "t1",
      name: "Bash",
      input: BASH,
      forChat: false,
    });
  });
});

describe("no suggestion: Featra's own rule", () => {
  it("offers the exact command, keeps the rule itself, and passes nothing to Claude", async () => {
    const { c, run, first } = await asked(BASH);
    expect(of(c.events, "approval")[0]).toMatchObject({ forChat: true, covers: "This command: npm test" });
    c.manager.approve(c.id, "t1", { choice: "allow-chat" });
    expect(await first).toEqual({ behavior: "allow", updatedInput: BASH });
    expect(run.updates).toEqual([]);
    expect(await run.ask("Bash", BASH, "t2")).toEqual({ behavior: "allow", updatedInput: BASH });
    expect(of(c.events, "tool-allowed")).toHaveLength(2);
  });

  it("offers nothing for the chat when a suggestion holds no allow rule and Featra has none", async () => {
    const c = await chat();
    c.send("test it");
    const run = await c.run();
    const mode: PermissionUpdate[] = [{ type: "setMode", mode: "acceptEdits", destination: "session" }];
    void run.ask("Edit", { file_path: "/etc/hosts", old_string: "a", new_string: "b" }, "t1", { suggestions: mode });
    await until(() => of(c.events, "approval").length === 1);
    expect(of(c.events, "approval")[0]).toMatchObject({ forChat: false });
    expect(of(c.events, "approval")[0]).not.toHaveProperty("covers");
  });
});
