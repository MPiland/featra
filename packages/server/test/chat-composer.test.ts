/**
 * STORY-22 AC1: the composer changes a chat's role, model, effort and permission mode, and the change applies from the
 * next turn. Through the real session manager and Claude adapter; only the Agent SDK's `query` is fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, CHAT_MESSAGES } from "@featra/work-format";
import { claudeControls } from "../src/claude-controls.ts";
import { claudeOptions } from "../src/claude-provider.ts";
import { chat, closeChats } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const role = (id: string) => BUILT_IN_ROLES.find((r) => r.id === id)!;

/** A chat that has finished one turn, so its session exists and the next turn resumes it. */
async function afterOneTurn() {
  const c = await chat();
  c.send("first");
  const run = await c.run();
  run.say(sdk.init("claude-sonnet-5-5", "session-1"), sdk.assistant("m1", [sdk.text("hi")]), sdk.success("hi"));
  await until(() => !c.view().running);
  return { c, first: run };
}

describe("the controls a Claude chat offers, under Claude's own names", () => {
  it("lists Claude's models, effort levels and permission modes, and the settings the chat starts with", async () => {
    const c = await chat("developer");
    const { controls, settings } = await c.manager.controls(c.id);
    expect(settings).toEqual({ role: "developer", model: "sonnet", effort: "high", mode: "default" });
    expect(controls.models.map((m) => m.value)).toEqual([
      "default",
      "sonnet",
      "opus",
      "haiku",
      "sonnet[1m]",
      "opus[1m]",
    ]);
    expect(controls.efforts.map((m) => m.value)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(controls.modes.map((m) => m.value)).toEqual(["default", "acceptEdits", "plan", "auto", "dontAsk"]);
    expect(controls.modes[0]).toEqual({ value: "default", label: "default (Ask)" });
  });

  it("offers full access only to a chat that already started in it, never as a switch up", () => {
    const base = role("developer");
    const bypass = {
      ...base,
      mode: { provider: "claude" as const, name: "bypassPermissions", level: "user" as const, fullAccess: true },
    };
    expect(claudeControls(base).modes.some((m) => m.value === "bypassPermissions")).toBe(false);
    expect(claudeControls(bypass).modes.find((m) => m.value === "bypassPermissions")).toEqual({
      value: "bypassPermissions",
      label: "bypassPermissions",
      fullAccess: true,
    });
  });

  it("adds a role's own model to the models it offers", () => {
    expect(claudeControls({ ...role("developer"), model: "claude-opus-4-1" }).models.at(-1)?.value).toBe(
      "claude-opus-4-1",
    );
  });
});

describe("a change applies from the next turn", () => {
  it("starts the next turn's agent with the new model, effort and mode, resuming the same session", async () => {
    const { c, first } = await afterOneTurn();
    const state = await c.manager.configure(c.id, { model: "opus", effort: "max", mode: "plan" });
    expect(state.settings).toEqual({ role: "developer", model: "opus", effort: "max", mode: "plan" });
    // The change itself runs nothing: no new agent until a message.
    expect(c.runs).toHaveLength(1);
    c.send("second");
    await until(() => c.runs.length === 2);
    const next = await c.run(1);
    expect(next.options).toMatchObject({ model: "opus", effort: "max", permissionMode: "plan", resume: "session-1" });
    expect(next.heard).toEqual(["second"]);
    // The first agent was ended quietly, not interrupted or failed.
    await until(() => first.closed);
    expect(first.interrupts).toBe(0);
    expect(c.view().items.some((i) => i.kind === "notice")).toBe(false);
  });

  it("leaves a running turn as it is, and applies from the turn after it", async () => {
    const c = await chat();
    c.send("first");
    const run = await c.run();
    run.say(sdk.init("m", "session-1"), sdk.start("m1"), sdk.delta("working"));
    await until(() => c.view().items.length > 1);
    await c.manager.configure(c.id, { model: "haiku" });
    expect(run.closed).toBe(false);
    expect(run.interrupts).toBe(0);
    expect(c.runs).toHaveLength(1);
    run.say(sdk.assistant("m1", [sdk.text("working")]), sdk.success("working"));
    await until(() => !c.view().running);
    c.send("second");
    await until(() => c.runs.length === 2);
    expect((await c.run(1)).options.model).toBe("haiku");
  });

  it("keeps the same agent when the change leaves the settings as they are", async () => {
    const { c } = await afterOneTurn();
    await c.manager.configure(c.id, { model: "sonnet", effort: "high" });
    c.send("second");
    const run = await c.run();
    await until(() => run.heard.length === 2);
    expect(c.runs).toHaveLength(1);
  });

  it("starts a Bypass chat's agent with the SDK's second opt-in, and no other with it", () => {
    const ask = claudeOptions(
      role("developer"),
      "/p",
      "claude",
      async () => ({ behavior: "deny", message: "" }),
      {},
      null,
    );
    expect(ask).not.toHaveProperty("allowDangerouslySkipPermissions");
    const settings = { role: "developer", model: "sonnet", effort: "high", mode: "bypassPermissions" };
    const bypass = claudeOptions(
      role("developer"),
      "/p",
      "claude",
      async () => ({ behavior: "deny", message: "" }),
      {},
      null,
      null,
      settings,
    );
    expect(bypass).toMatchObject({ permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true });
  });
});

describe("changing the role", () => {
  it("runs the next turn with the new role's prompt, model, effort and mode, and relabels the chat's row", async () => {
    const { c } = await afterOneTurn();
    const state = await c.manager.configure(c.id, { role: "qa" });
    expect(state.settings).toEqual({ role: "qa", model: "sonnet", effort: "medium", mode: "default" });
    expect(c.manager.list("/home/me/demo")[0]?.role).toMatchObject({ id: "qa", name: "QA" });
    c.send("second");
    await until(() => c.runs.length === 2);
    const { options } = await c.run(1);
    expect(options.systemPrompt).toEqual({ type: "preset", preset: "claude_code", append: role("qa").prompt });
    expect(options.effort).toBe("medium");
  });

  it("applies the user's other choices in the same change over the new role's", async () => {
    const c = await chat();
    const state = await c.manager.configure(c.id, { role: "dev-lead", effort: "low" });
    expect(state.settings).toMatchObject({ role: "dev-lead", model: "opus", effort: "low" });
  });
});

describe("what is refused", () => {
  it.each([
    ["a model the provider doesn't offer", { model: "gpt-5" }],
    ["an effort level it doesn't have", { effort: "ultra" }],
    ["a mode it doesn't have", { mode: "on-request" }],
    ["full access, which a chat is never switched up to", { mode: "bypassPermissions" }],
  ])("%s", async (_name, change) => {
    const c = await chat();
    await expect(c.manager.configure(c.id, change)).rejects.toThrow(CHAT_MESSAGES.badSetting);
    // Nothing changed.
    expect((await c.manager.controls(c.id)).settings.model).toBe("sonnet");
  });

  it("a role the project doesn't have", async () => {
    const c = await chat();
    await expect(c.manager.configure(c.id, { role: "nobody" })).rejects.toThrow(CHAT_MESSAGES.unknownRole);
  });

  it("a chat that doesn't exist", async () => {
    const c = await chat();
    await expect(c.manager.configure("nope", { model: "opus" })).rejects.toThrow(CHAT_MESSAGES.noChat);
  });
});
