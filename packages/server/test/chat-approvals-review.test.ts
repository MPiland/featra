/**
 * STORY-45 review fixes (PR #10): regression tests through the real session manager, Claude adapter and approval desk.
 * Only the SDK's `query` (and its `canUseTool` calls) and the `claude` lookup are fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { APPROVAL_CANCELLED, CHAT_MESSAGES, type ChatEvent } from "@featra/work-format";
import { createApprovalDesk } from "../src/approval-desk.ts";
import { chat, closeChats, DIR } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const BASH = { command: "npm test" };
const CANCELLED = { behavior: "deny", message: APPROVAL_CANCELLED, interrupt: true };
const of = (events: ChatEvent[], type: ChatEvent["type"]) => events.filter((e) => e.type === type);

async function calling() {
  const c = await chat();
  c.send("test it");
  const run = await c.run();
  run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", BASH)]));
  await until(() => c.events.some((e) => e.type === "tool"));
  return { c, run };
}

/** A chat with Allow for this chat on Bash `npm test`, its turn still running. */
async function allowedForChat() {
  const { c, run } = await calling();
  const first = run.ask("Bash", BASH, "t1");
  await until(() => of(c.events, "approval").length === 1);
  c.manager.approve(c.id, "t1", { choice: "allow-chat" });
  await first;
  return { c, run };
}

describe("Allow for this chat on a shell command covers only the same run", () => {
  it("still asks for the same command run outside the sandbox", async () => {
    const { c, run } = await allowedForChat();
    void run.ask("Bash", { ...BASH, dangerouslyDisableSandbox: true }, "t2");
    await until(() => of(c.events, "approval").length === 2);
    expect(of(c.events, "tool-allowed")).toHaveLength(1);
  });

  it("covers the same command with another description, timeout or background flag", async () => {
    const { c, run } = await allowedForChat();
    const same = { ...BASH, description: "Run tests", timeout: 60_000, run_in_background: true };
    expect(await run.ask("Bash", same, "t2")).toEqual({ behavior: "allow", updatedInput: same });
    expect(of(c.events, "approval")).toHaveLength(1);
  });
});

describe("a request asked again under the same id", () => {
  it("ends the first one as cancelled, so its caller never hangs, and the second one takes the answer", async () => {
    const { c, run } = await calling();
    const first = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    const second = run.ask("Bash", BASH, "t1");
    expect(await first).toEqual({ behavior: "deny", message: APPROVAL_CANCELLED });
    c.manager.approve(c.id, "t1", { choice: "allow" });
    expect(await second).toEqual({ behavior: "allow", updatedInput: BASH });
    expect(c.view().items.find((i) => i.kind === "tool")).toMatchObject({ approval: { status: "allowed" } });
  });
});

describe("the agent fails while a request waits", () => {
  it("cancels the request: nothing is left waiting, and an answer is refused", async () => {
    const { c, run } = await calling();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    run.crash(new Error("claude exited with code 1"));
    expect(await asked).toEqual(CANCELLED);
    await until(() => !c.view().running);
    expect(c.manager.list(DIR)[0]?.waiting).not.toBe("approval");
    expect(() => c.manager.approve(c.id, "t1", { choice: "allow" })).toThrow(CHAT_MESSAGES.noRequest);
    expect(c.view().items.find((i) => i.kind === "tool")).toMatchObject({ approval: null, denied: false });
  });
});

describe("Stop and closing tell the agent to stop, not try another step", () => {
  it("interrupts on Stop", async () => {
    const { c, run } = await calling();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    await c.manager.stop(c.id);
    expect(await asked).toEqual(CANCELLED);
  });

  it("interrupts when the chat closes", async () => {
    const { c, run } = await calling();
    const asked = run.ask("Bash", BASH, "t1");
    await until(() => of(c.events, "approval").length === 1);
    c.manager.closeProjects(() => false);
    expect(await asked).toEqual(CANCELLED);
  });
});

describe("the desk checks a stopped turn before the chat's rules", () => {
  it("allows nothing once the turn is stopped, even what Allow for this chat covers", async () => {
    const { c, run } = await allowedForChat();
    await c.manager.stop(c.id);
    expect(await run.ask("Bash", BASH, "t2")).toEqual(CANCELLED);
    expect(of(c.events, "tool-allowed")).toHaveLength(1);
  });

  it("offers no Allow for this chat on a request that doesn't say it may", async () => {
    const told: ChatEvent[] = [];
    const desk = createApprovalDesk((_chat, e) => told.push(e));
    void desk.approve(
      { chat: "c1", cwd: "/home/u/demo", id: "t1", name: "Bash", input: BASH },
      new AbortController().signal,
    );
    expect(told).toEqual([{ type: "approval", id: "t1", name: "Bash", input: BASH, forChat: false }]);
    expect(() => desk.answer("c1", "t1", { choice: "allow-chat" })).toThrow(CHAT_MESSAGES.onceOnly);
  });
});
