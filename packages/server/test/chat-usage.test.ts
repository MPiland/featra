/**
 * STORY-22 AC2 and AC3: the context meter's numbers come from the agent session's own messages (the assistant
 * messages' `usage` and the result's `modelUsage`), through the real Claude adapter and session manager. Nothing is
 * asked of the model, so no tokens are spent: the fake `query` is only ever fed the user's own messages.
 */
import { afterEach, describe, expect, it } from "vitest";
import { foldChat, type ChatEvent } from "@featra/work-format";
import { createClaudeTranslator } from "../src/claude-messages.ts";
import { transcriptEvents } from "../src/claude-transcript.ts";
import { chat, closeChats } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const usage = {
  input_tokens: 1000,
  cache_read_input_tokens: 2000,
  cache_creation_input_tokens: 300,
  output_tokens: 200,
};
const windowOf = (model: string, contextWindow: number) => ({ modelUsage: { [model]: { contextWindow } } });
const usageEvents = (events: ChatEvent[]) => events.filter((e) => e.type === "usage");

describe("AC2: the meter shows tokens used of the model's window and updates after each turn", () => {
  it("reports the context the turn's last assistant message used, with the window the result names", async () => {
    const c = await chat();
    c.send("hello");
    const run = await c.run();
    run.say(sdk.init("claude-sonnet-5-5"), sdk.assistant("m1", [sdk.text("hi")], {}, usage));
    // Nothing yet: the meter updates when the turn ends.
    await until(() => c.events.some((e) => e.type === "text"));
    expect(usageEvents(c.events)).toEqual([]);
    run.say(sdk.success("hi", windowOf("claude-sonnet-5-5", 200_000)));
    await until(() => !c.view().running && c.view().usage !== null);
    expect(c.view().usage).toEqual({ used: 3500, window: 200_000 });
    // The usage comes before the turn's end.
    expect(c.events.map((e) => e.type).slice(-2)).toEqual(["usage", "turn-end"]);
  });

  it("updates after each turn, using the last assistant message when a turn calls tools", async () => {
    const c = await chat();
    c.send("one");
    const run = await c.run();
    run.say(
      sdk.init("m"),
      sdk.assistant("a", [sdk.toolUse("t", "Read", {})], {}, { input_tokens: 100, output_tokens: 10 }),
    );
    run.say(
      sdk.toolResult("t", "ok"),
      sdk.assistant("b", [sdk.text("done")], {}, { input_tokens: 150, output_tokens: 20 }),
    );
    run.say(sdk.success("done", windowOf("m", 1_000_000)));
    await until(() => c.view().usage?.used === 170);
    c.send("two");
    run.say(sdk.init("m"), sdk.assistant("c", [sdk.text("more")], {}, { input_tokens: 400, output_tokens: 50 }));
    run.say(sdk.success("more", windowOf("m", 1_000_000)));
    await until(() => c.view().usage?.used === 450);
    expect(c.view().usage).toEqual({ used: 450, window: 1_000_000 });
  });

  it("shows tokens without a window when the result doesn't name one: Featra doesn't guess", async () => {
    const c = await chat();
    c.send("hello");
    const run = await c.run();
    run.say(sdk.init("claude-sonnet-5-5"), sdk.assistant("m1", [sdk.text("hi")], {}, usage), sdk.success("hi"));
    await until(() => c.view().usage !== null);
    expect(c.view().usage).toEqual({ used: 3500, window: null });
  });

  it("takes the window of the session's own model when a subagent's model is in the result too, and none when unsure", () => {
    const both = {
      modelUsage: { "claude-sonnet-5-5": { contextWindow: 200_000 }, "claude-haiku-5-5": { contextWindow: 100_000 } },
    };
    const own = createClaudeTranslator();
    own.translate(sdk.init("claude-sonnet-5-5"));
    own.translate(sdk.assistant("m", [], {}, usage));
    expect(own.translate(sdk.success("", both))[0]).toEqual({ type: "usage", used: 3500, window: 200_000 });

    const unsure = createClaudeTranslator();
    unsure.translate(sdk.init("claude-sonnet-5-5[1m]"));
    unsure.translate(sdk.assistant("m", [], {}, usage));
    expect(unsure.translate(sdk.success("", both))[0]).toEqual({ type: "usage", used: 3500, window: null });
  });

  it("ignores a subagent's own messages, which are not the chat's context", () => {
    const t = createClaudeTranslator();
    t.translate({ ...sdk.assistant("sub", [], {}, { input_tokens: 99_999 }), parent_tool_use_id: "task-1" });
    t.translate(sdk.assistant("main", [], {}, { input_tokens: 10 }));
    expect(t.translate(sdk.success(""))[0]).toEqual({ type: "usage", used: 10, window: null });
  });

  it("reports no usage for a turn whose messages carried none", async () => {
    const c = await chat();
    c.send("hello");
    const run = await c.run();
    run.say(
      sdk.init(),
      sdk.assistant("m1", [sdk.text("hi")]),
      sdk.success("hi", windowOf("claude-sonnet-5-5", 200_000)),
    );
    await until(() => !c.view().running);
    expect(usageEvents(c.events)).toEqual([]);
  });

  it("reads a restored chat's context from its session's messages, without a window", () => {
    const events = transcriptEvents([
      { type: "user", message: { role: "user", content: "hi" } },
      sdk.assistant("m1", [sdk.text("hello")], {}, usage),
      { type: "user", message: { role: "user", content: "again" } },
      sdk.assistant("m2", [sdk.text("sure")], {}, { input_tokens: 5000, output_tokens: 10 }),
    ]);
    expect(usageEvents(events)).toEqual([
      { type: "usage", used: 3500, window: null },
      { type: "usage", used: 5010, window: null },
    ]);
    expect(foldChat(events).usage).toEqual({ used: 5010, window: null });
  });
});

describe("AC3: Featra reads token use from the session's own events, spending no extra tokens", () => {
  it("feeds the agent only the user's messages: no probe, no extra turn, to learn the usage", async () => {
    const c = await chat();
    c.send("hello");
    const run = await c.run();
    run.say(
      sdk.init(),
      sdk.assistant("m", [sdk.text("hi")], {}, usage),
      sdk.success("hi", windowOf("claude-sonnet-5-5", 200_000)),
    );
    await until(() => c.view().usage !== null);
    expect(run.heard).toEqual(["hello"]);
    expect(c.runs).toHaveLength(1);
    expect(run.interrupts).toBe(0);
  });
});
