/**
 * STORY-55: how the Claude adapter tells a session's subagents apart in the SDK's one stream. The real subagent module and
 * translator; the SDK's messages are the fake's helpers.
 */
import { describe, expect, it } from "vitest";
import { createClaudeSubagents } from "../src/claude-subagents.ts";
import type { SubagentEvent } from "../src/provider.ts";
import { sdk } from "./fake-query.ts";

const noStop = async () => {};

function setup() {
  const told: SubagentEvent[] = [];
  const subagents = createClaudeSubagents((e) => told.push(e));
  return { told, subagents, types: () => told.map((e) => e.type) };
}

describe("which messages are a subagent's", () => {
  it("takes a subagent's task and conversation, and leaves the session's own messages", () => {
    const { subagents, told } = setup();
    expect(subagents.handle(sdk.assistant("m1", [sdk.text("mine")]))).toBe(false);
    expect(subagents.handle(sdk.taskStarted("t1", "c1"))).toBe(true);
    expect(subagents.handle(sdk.within("c1", "t1", sdk.assistant("s1", [sdk.text("theirs")])))).toBe(true);
    expect(told[0]).toEqual({ type: "started", id: "c1", label: "Review the diff", kind: "reviewer", stoppable: true });
    expect(JSON.stringify(told)).toContain("theirs");
  });

  it("ignores tasks that are not subagents", () => {
    const { subagents, told } = setup();
    expect(subagents.handle(sdk.taskStarted("t1", "c1", { task_type: "local_bash" }))).toBe(false);
    expect(told).toEqual([]);
  });

  it("starts a subagent from its messages when they come before its task is announced", () => {
    const { subagents, types } = setup();
    subagents.handle(sdk.within("c1", "t1", sdk.assistant("s1", [sdk.text("early")])));
    subagents.handle(sdk.taskStarted("t1", "c1"));
    expect(types().filter((t) => t === "started")).toHaveLength(1);
  });

  it("ends a subagent once, and drops what it says after", () => {
    const { subagents, types } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskDone("t1", "completed"));
    subagents.handle(sdk.taskDone("t1", "failed", "late"));
    subagents.handle(sdk.within("c1", "t1", sdk.assistant("s1", [sdk.text("late")])));
    expect(types().filter((t) => t === "ended")).toHaveLength(1);
    expect(types().filter((t) => t === "event")).toHaveLength(1);
  });

  it("ends every running subagent when the agent ends", () => {
    const { subagents, told } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskStarted("t2", "c2"));
    subagents.endAll("failed");
    expect(told.filter((e) => e.type === "ended")).toHaveLength(2);
  });
});

describe("who asked", () => {
  it("names the subagent of a task, and no one for the session or an unknown task", () => {
    const { subagents } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    expect(subagents.labelOf("t1")).toBe("Review the diff");
    expect(subagents.labelOf(undefined)).toBeUndefined();
    expect(subagents.labelOf("other")).toBeUndefined();
  });
});

describe("Stop", () => {
  it("ends a background subagent's task through the SDK", async () => {
    const { subagents } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    const stopped: string[] = [];
    await subagents.stop("c1", async (task) => void stopped.push(task));
    expect(stopped).toEqual(["t1"]);
  });

  it("refuses a foreground one, an ended one, and when the SDK has no stopTask", async () => {
    const { subagents } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1", { is_backgrounded: false }));
    subagents.handle(sdk.taskStarted("t2", "c2"));
    subagents.handle(sdk.taskDone("t2", "completed"));
    subagents.handle(sdk.taskStarted("t3", "c3"));
    await expect(subagents.stop("c1", noStop)).rejects.toThrow("not stoppable");
    await expect(subagents.stop("c2", noStop)).rejects.toThrow("not stoppable");
    await expect(subagents.stop("c3", undefined)).rejects.toThrow("not stoppable");
  });
});
