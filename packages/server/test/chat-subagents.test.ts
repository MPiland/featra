/**
 * STORY-55: a subagent a session spawns is a read-only chat nested under it, Stop ends it alone where the provider can,
 * and its approvals say who asked. Real session manager and Claude adapter; only the Agent SDK's `query` is fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, type ChatEvent } from "@featra/work-format";
import { chat, closeChats, DIR } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const TASK = "task-1";
const CALL = "call-1";

/** A session whose agent has spawned one subagent, which has said one thing. */
async function spawned(extra: Record<string, unknown> = {}) {
  const c = await chat();
  c.send("review it");
  const run = await c.run();
  run.say(
    sdk.init(),
    sdk.assistant("m1", [sdk.toolUse(CALL, "Agent", { description: "Review the diff" })]),
    sdk.taskStarted(TASK, CALL, extra),
    sdk.within(CALL, TASK, sdk.assistant("s1", [sdk.text("Looking at the diff.")])),
  );
  const subs = () => c.manager.list(DIR).filter((s) => s.subagent);
  await until(() => subs().length === 1);
  const sub = () => subs()[0]!;
  /** What a watcher of the subagent sees: its log so far, and then live. */
  const watch = () => {
    const events: ChatEvent[] = [];
    const { events: log } = c.manager.watch(sub().id, (e) => events.push(e));
    events.push(...log);
    return events;
  };
  return { c, run, sub, subs, watch };
}

describe("AC1: a subagent appears nested under its session, read-only", () => {
  it("lists it as a chat of its own that names its session, is running and has its transcript", async () => {
    const { c, sub, watch } = await spawned();
    expect(sub()).toMatchObject({
      title: "Review the diff",
      running: true,
      waiting: null,
      subagent: { parent: c.id, stoppable: true },
    });
    expect(c.manager.list(DIR)).toHaveLength(2);
    const seen = JSON.stringify(watch());
    expect(seen).toContain("Looking at the diff.");
    expect(seen).toContain("Review the diff.");
  });

  it("keeps its messages out of the session's own transcript", async () => {
    const { c } = await spawned();
    expect(JSON.stringify(c.events)).not.toContain("Looking at the diff.");
  });

  it("shows later messages live to a watcher, and its end", async () => {
    const { c, run, sub, watch } = await spawned();
    const seen = watch();
    run.say(sdk.within(CALL, TASK, sdk.assistant("s2", [sdk.text("All good.")])), sdk.taskDone(TASK, "completed"));
    await until(() => !sub().running);
    expect(JSON.stringify(seen)).toContain("All good.");
    expect(sub().subagent?.stoppable).toBe(false);
    expect(c.manager.list(DIR).find((s) => s.id === c.id)?.running).toBe(true);
  });

  it("refuses a message to a subagent", async () => {
    const { c, sub } = await spawned();
    await expect(Promise.resolve().then(() => c.manager.send(sub().id, "hi"))).rejects.toThrow(CHAT_MESSAGES.subagent);
  });

  it("shows a failed subagent's problem", async () => {
    const { sub, run, watch } = await spawned();
    run.say(sdk.taskDone(TASK, "failed", "It crashed."));
    await until(() => !sub().running);
    expect(JSON.stringify(watch())).toContain("It crashed.");
  });

  it("is not part of what the manager saves, and is gone with its project", async () => {
    const { c, sub } = await spawned();
    const id = sub().id;
    c.manager.closeProjects(() => false);
    expect(c.manager.list(DIR).filter((s) => s.subagent)).toEqual([]);
    expect(() => c.manager.watch(id, () => {})).toThrow(CHAT_MESSAGES.noChat);
  });
});

describe("AC2: Stop on a nested subagent stops only that subagent", () => {
  it("asks the provider to end that task and leaves the session's turn running", async () => {
    const { c, run, sub } = await spawned();
    await c.manager.stop(sub().id);
    expect(run.stopped).toEqual([TASK]);
    expect(run.interrupts).toBe(0);
    expect(c.view().running).toBe(true);
    run.say(sdk.taskDone(TASK, "stopped"));
    await until(() => !sub().running);
  });

  it("offers no Stop on a foreground subagent, and refuses it", async () => {
    const { c, run, sub } = await spawned({ is_backgrounded: false });
    expect(sub().subagent?.stoppable).toBe(false);
    await expect(c.manager.stop(sub().id)).rejects.toThrow(CHAT_MESSAGES.noSubagentStop);
    expect(run.stopped).toEqual([]);
  });

  it("offers Stop once a foreground subagent is sent to the background", async () => {
    const { c, run, sub } = await spawned({ is_backgrounded: false });
    run.say(sdk.taskUpdated(TASK, { is_backgrounded: true }));
    await until(() => sub().subagent?.stoppable === true);
    await c.manager.stop(sub().id);
    expect(run.stopped).toEqual([TASK]);
  });

  it("refuses Stop on a subagent that has ended", async () => {
    const { c, run, sub } = await spawned();
    run.say(sdk.taskDone(TASK, "completed"));
    await until(() => !sub().running);
    await expect(c.manager.stop(sub().id)).rejects.toThrow(CHAT_MESSAGES.noSubagentStop);
  });
});

describe("AC3: a subagent's approvals say which subagent asked", () => {
  it("labels an approval it asked for, and not the session's own", async () => {
    const { c, run } = await spawned();
    const tool = (id: string) => {
      const row = c.view().items.find((i) => i.kind === "tool" && i.id === id);
      return row?.kind === "tool" ? row.approval : null;
    };
    void run.ask("Bash", { command: "ls" }, "t1", { agentID: TASK });
    await until(() => tool("t1") !== null);
    void run.ask("Bash", { command: "pwd" }, "t2");
    await until(() => tool("t2") !== null);
    expect(tool("t1")).toMatchObject({ status: "pending", subagent: "Review the diff" });
    expect(tool("t2")).not.toHaveProperty("subagent");
  });
});
