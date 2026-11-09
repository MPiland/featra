/** STORY-5: the Agent SDK's messages, as chat events. The messages are shaped as the SDK sends them (fake-query.ts). */
import { describe, expect, it } from "vitest";
import { createClaudeTranslator, FAILED } from "../src/claude-messages.ts";
import { sdk } from "./fake-query.ts";

const translate = (...messages: unknown[]) => {
  const t = createClaudeTranslator();
  return messages.flatMap((m) => t.translate(m));
};

describe("AC2: streamed text", () => {
  it("names each text block by its message and index, so two blocks don't run together", () => {
    expect(translate(sdk.start("m1"), sdk.delta("a", 0), sdk.delta("b", 1))).toEqual([
      { type: "text", block: "m1:0", delta: "a" },
      { type: "text", block: "m1:1", delta: "b" },
    ]);
  });

  it("shows a message's text from its full copy when no deltas came", () => {
    expect(translate(sdk.assistant("m1", [sdk.text("Hi"), sdk.text("there")]))).toEqual([
      { type: "text", block: "m1:0", delta: "Hi" },
      { type: "text", block: "m1:1", delta: "there" },
    ]);
  });

  it("reports the session id and model the agent started with", () => {
    const t = createClaudeTranslator();
    expect(t.translate(sdk.init("claude-opus-5-5", "s-9"))).toEqual([{ type: "started", model: "claude-opus-5-5" }]);
    expect(t.sessionId()).toBe("s-9");
  });

  it("ignores what it doesn't know", () => {
    expect(translate(null, "x", { type: "system", subtype: "compact_boundary" }, { type: "rate_limit" })).toEqual([]);
  });
});

describe("AC3: tool calls and results", () => {
  it("joins a result's text blocks and marks the rest", () => {
    expect(translate(sdk.toolResult("t1", [sdk.text("one"), { type: "image" }, sdk.text("two")], true))).toEqual([
      { type: "tool-result", id: "t1", output: "one\n[image]\ntwo", isError: true },
    ]);
  });

  it("keeps a call with no input", () => {
    expect(translate(sdk.assistant("m1", [{ type: "tool_use", id: "t1", name: "TodoRead" }]))).toEqual([
      { type: "tool", id: "t1", name: "TodoRead", input: null },
    ]);
  });
});

describe("AC4: how a turn ends", () => {
  it("fails with the result's errors when it has no text", () => {
    expect(translate(sdk.failure({ errors: ["Overloaded.", "Try later."] }))).toEqual([
      { type: "problem", problem: { type: "failed", message: "Overloaded. Try later." } },
      { type: "turn-end", outcome: "failed" },
    ]);
  });

  it("fails with a stock line when the result says nothing", () => {
    expect(translate(sdk.failure())[0]).toEqual({ type: "problem", problem: { type: "failed", message: FAILED } });
  });

  it("fails a success that is marked as an error", () => {
    expect(translate({ ...sdk.success("API Error: 500"), is_error: true })).toEqual([
      { type: "problem", problem: { type: "failed", message: "API Error: 500" } },
      { type: "turn-end", outcome: "failed" },
    ]);
  });

  it("reads a failed result that mentions logging in as a failure with that message, not as logged out", () => {
    expect(translate(sdk.failure({ result: "Invalid API key · Please run /login" }))[0]).toEqual({
      type: "problem",
      problem: { type: "failed", message: "Invalid API key · Please run /login" },
    });
  });

  it("keeps assistant text that mentions logging in", () => {
    expect(translate(sdk.assistant("m1", [sdk.text("Not logged in · Please run /login")]))).toEqual([
      { type: "text", block: "m1:0", delta: "Not logged in · Please run /login" },
    ]);
  });

  it("says logged out once a turn, and again on the next turn", () => {
    const auth = sdk.assistant("m1", [sdk.text("Not logged in")], { error: "authentication_failed" });
    const logout = { type: "problem", problem: { type: "logged-out" } };
    expect(translate(auth, auth, sdk.failure(), auth)).toEqual([
      logout,
      { type: "turn-end", outcome: "failed" },
      logout,
    ]);
  });

  it("ends a turn the user stopped as stopped, then the next as usual", () => {
    const t = createClaudeTranslator();
    t.interrupted();
    expect(t.translate(sdk.failure())).toEqual([{ type: "turn-end", outcome: "stopped" }]);
    expect(t.translate(sdk.success())).toEqual([{ type: "turn-end", outcome: "done" }]);
  });
});
