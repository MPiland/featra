/**
 * STORY-55: how the Claude adapter tells a session's subagents apart in the SDK's one stream. The real subagent module and
 * translator; the SDK's messages are the fake's helpers.
 */
import { describe, expect, it } from "vitest";
import { createClaudeSubagents } from "../src/claude-subagents.ts";
import type { SubagentEvent } from "../src/provider.ts";
import { MAX_ENDED_SUBAGENTS } from "@featra/work-format";
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
    expect(told[0]).toEqual({ type: "started", id: "t1", label: "Review the diff", kind: "reviewer", stoppable: true });
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
    await subagents.stop("t1", async (task) => void stopped.push(task));
    expect(stopped).toEqual(["t1"]);
  });

  it("refuses a foreground one, an ended one, and when the SDK has no stopTask", async () => {
    const { subagents } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1", { is_backgrounded: false }));
    subagents.handle(sdk.taskStarted("t2", "c2"));
    subagents.handle(sdk.taskDone("t2", "completed"));
    subagents.handle(sdk.taskStarted("t3", "c3"));
    await expect(subagents.stop("t1", noStop)).rejects.toThrow("not stoppable");
    await expect(subagents.stop("t2", noStop)).rejects.toThrow("not stoppable");
    await expect(subagents.stop("t3", undefined)).rejects.toThrow("not stoppable");
  });
});

describe("how a subagent ends", () => {
  it.each([
    ["completed", "done"],
    ["failed", "failed"],
    ["killed", "stopped"],
  ])("ends on a task update whose status is %s", (status, outcome) => {
    const { subagents, told } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskUpdated("t1", { status }));
    expect(told.at(-1)).toEqual({ type: "ended", id: "t1", outcome });
  });

  it("does not end on a task update that says it is still running", () => {
    const { subagents, types } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskUpdated("t1", { status: "running" }));
    expect(types()).not.toContain("ended");
  });

  it("ends a foreground subagent with its session's turn, and leaves a background one running", () => {
    const { subagents, told } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1", { is_backgrounded: false }));
    subagents.handle(sdk.taskStarted("t2", "c2"));
    subagents.turnEnded("stopped");
    expect(told.filter((e) => e.type === "ended")).toEqual([{ type: "ended", id: "t1", outcome: "stopped" }]);
  });
});

describe("tasks that are not subagents", () => {
  it("make no chat from their own messages, whichever of task or call they name", () => {
    const { subagents, told } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1", { task_type: "local_bash" }));
    expect(subagents.handle(sdk.within("c1", "t1", sdk.assistant("s1", [sdk.text("output")])))).toBe(true);
    expect(subagents.handle({ ...sdk.assistant("s2", [sdk.text("more")]), agent_id: "t1" })).toBe(true);
    expect(subagents.handle({ ...sdk.assistant("s3", [sdk.text("more")]), parent_tool_use_id: "c1" })).toBe(true);
    expect(told).toEqual([]);
  });
});

describe("a task that starts again", () => {
  it("reopens the same subagent when its task is announced again after it ended", () => {
    const { subagents, told } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskDone("t1", "completed"));
    subagents.handle(sdk.taskStarted("t1", "c9", { is_backgrounded: false }));
    expect(told.filter((e) => e.type === "started").map((e) => e.id)).toEqual(["t1", "t1"]);
    expect(told.at(-2)).toMatchObject({ type: "started", id: "t1", stoppable: false });
    subagents.handle(sdk.within("c9", "t1", sdk.assistant("s1", [sdk.text("again")])));
    expect(JSON.stringify(told.at(-1))).toContain("again");
    subagents.turnEnded("done");
    expect(told.at(-1)).toEqual({ type: "ended", id: "t1", outcome: "done" });
  });

  it("is stoppable once it reopens in the background", async () => {
    const { subagents } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskDone("t1", "completed"));
    subagents.handle(sdk.taskStarted("t1", "c1"));
    const stopped: string[] = [];
    await subagents.stop("t1", async (task) => void stopped.push(task));
    expect(stopped).toEqual(["t1"]);
  });
});

describe("a task announced after its messages", () => {
  it("sets its background, kind and label, and says it is stoppable now", async () => {
    const { subagents, told } = setup();
    subagents.handle(sdk.within("c1", "t1", sdk.assistant("s1", [sdk.text("early")])));
    expect(told[0]).toMatchObject({ type: "started", stoppable: false });
    subagents.handle(sdk.taskStarted("t1", "c1"));
    expect(told.find((e) => e.type === "updated")).toEqual({
      type: "updated",
      id: "t1",
      label: "Review the diff",
      kind: "reviewer",
      stoppable: true,
    });
    const stopped: string[] = [];
    await subagents.stop("t1", async (task) => void stopped.push(task));
    expect(stopped).toEqual(["t1"]);
  });
});

describe("a message that names both its task and its call", () => {
  it("lets the call stand for the subagent from then on", () => {
    const { subagents, types } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    // Its call is learned from a message, not from the announcement.
    subagents.handle(sdk.within("c2", "t1", sdk.assistant("s1", [sdk.text("one")])));
    subagents.handle({ ...sdk.assistant("s2", [sdk.text("two")]), parent_tool_use_id: "c2" });
    expect(types().filter((t) => t === "started")).toHaveLength(1);
    expect(types().filter((t) => t === "event")).toHaveLength(3);
  });
});

describe("what an ended subagent leaves behind", () => {
  it("keeps the newest ended subagents only, and forgets the oldest first", () => {
    const { subagents, told } = setup();
    for (let i = 0; i <= MAX_ENDED_SUBAGENTS; i += 1) {
      subagents.handle(sdk.taskStarted(`t${i}`, `c${i}`));
      subagents.handle(sdk.taskDone(`t${i}`, "completed"));
    }
    // t0 is forgotten: a late message of it makes no chat, and its label is no one's.
    const before = told.length;
    subagents.handle(sdk.within("c0", "t0", sdk.assistant("s1", [sdk.text("late")])));
    expect(told).toHaveLength(before);
    expect(subagents.labelOf("t0")).toBeUndefined();
    expect(subagents.labelOf("t1")).toBe("Review the diff");
  });

  it("forgets an archived subagent, but not one still running", () => {
    const { subagents } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskStarted("t2", "c2"));
    subagents.handle(sdk.taskDone("t2", "completed"));
    subagents.forget("t1");
    subagents.forget("t2");
    expect(subagents.labelOf("t1")).toBe("Review the diff");
    expect(subagents.labelOf("t2")).toBeUndefined();
  });
});

describe("Stop on the session", () => {
  it("ends every running background subagent and skips a foreground one, an ended one, and one that refuses", async () => {
    const { subagents } = setup();
    subagents.handle(sdk.taskStarted("t1", "c1"));
    subagents.handle(sdk.taskStarted("t2", "c2", { is_backgrounded: false }));
    subagents.handle(sdk.taskStarted("t3", "c3"));
    subagents.handle(sdk.taskDone("t3", "completed"));
    subagents.handle(sdk.taskStarted("t4", "c4"));
    const asked: string[] = [];
    await subagents.stopAll(async (task) => {
      asked.push(task);
      if (task === "t1") throw new Error("gone");
    });
    expect(asked).toEqual(["t1", "t4"]);
  });
});
