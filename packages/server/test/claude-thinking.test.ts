/** STORY-53 AC1: the agent's thinking, where Claude exposes it (summarized), reaches the transcript as thinking events. */
import { afterEach, describe, expect, it } from "vitest";
import { createClaudeTranslator } from "../src/claude-messages.ts";
import { chat, closeChats } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";

const translate = (...messages: unknown[]) => {
  const t = createClaudeTranslator();
  return messages.flatMap((m) => t.translate(m));
};
const thinkingDelta = (thinking: string, index = 0) => ({
  parent_tool_use_id: null,
  type: "stream_event",
  event: { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking } },
});

afterEach(closeChats);

describe("AC1: thinking", () => {
  it("streams thinking deltas apart from the text of the same message", () => {
    expect(
      translate(sdk.start("m1"), thinkingDelta("Let me", 0), thinkingDelta(" see.", 0), sdk.delta("Done.", 1)),
    ).toEqual([
      { type: "thinking", block: "m1:0", delta: "Let me" },
      { type: "thinking", block: "m1:0", delta: " see." },
      { type: "text", block: "m1:1", delta: "Done." },
    ]);
  });

  it("shows a message's thinking from its full block when none streamed, and not twice when it did", () => {
    const full = sdk.assistant("m1", [{ type: "thinking", thinking: "Plan." }, sdk.text("Hi")]);
    expect(translate(full)).toEqual([
      { type: "thinking", block: "m1:0", delta: "Plan." },
      { type: "text", block: "m1:1", delta: "Hi" },
    ]);
    expect(translate(sdk.start("m1"), thinkingDelta("Plan."), full)).toEqual([
      { type: "thinking", block: "m1:0", delta: "Plan." },
      { type: "text", block: "m1:1", delta: "Hi" },
    ]);
  });

  it("asks the Agent SDK for summarized thinking on a model that takes adaptive thinking", async () => {
    const c = await chat();
    c.send("hi");
    const run = await c.run();
    expect(run.options.model).toBe("sonnet");
    expect(run.options.thinking).toEqual({ type: "adaptive", display: "summarized" });
  });

  it("asks for no thinking on a model not known to take it, so its turns are not put at risk", async () => {
    const c = await chat();
    await c.manager.configure(c.id, { model: "haiku" });
    c.send("hi");
    const run = await c.run();
    expect(run.options.model).toBe("haiku");
    expect("thinking" in run.options).toBe(false);
  });
});
