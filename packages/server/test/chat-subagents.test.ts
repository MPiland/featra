/**
 * STORY-55: a subagent a session spawns is a read-only chat nested under it, Stop ends it alone where the provider can,
 * and its approvals say who asked. Real session manager and Claude adapter; only the Agent SDK's `query` is fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, MAX_ENDED_SUBAGENTS, type ChatEvent, type Question } from "@featra/work-format";
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

const COLOUR: Question = {
  question: "Which colour?",
  header: "Colour",
  options: [
    { label: "Blue", description: "Calm" },
    { label: "Red", description: "Loud" },
  ],
  multiSelect: false,
};

describe("AC3: a subagent's question says which subagent asked", () => {
  it("makes a question event that carries the subagent's label, through the real adapter", async () => {
    const { c, run } = await spawned();
    const seen = () => c.events.filter((e) => e.type === "question");
    void run.ask("AskUserQuestion", { questions: [COLOUR] }, "q1", { agentID: TASK });
    await until(() => seen().length === 1);
    expect(seen()[0]).toMatchObject({ type: "question", id: "q1", subagent: "Review the diff" });
    void run.ask("AskUserQuestion", { questions: [COLOUR] }, "q2");
    await until(() => seen().length === 2);
    expect(seen()[1]).not.toHaveProperty("subagent");
  });
});

describe("what an ended subagent leaves", () => {
  it("stays nested, marked ended, with its transcript", async () => {
    const { c, run, sub, watch } = await spawned();
    run.say(sdk.taskDone(TASK, "completed"));
    await until(() => !sub().running);
    expect(c.manager.list(DIR)).toHaveLength(2);
    expect(JSON.stringify(watch())).toContain("Looking at the diff.");
  });

  it("keeps the newest ended subagents of a session, dropping the oldest first", async () => {
    const { c, run } = await spawned();
    for (let i = 0; i <= MAX_ENDED_SUBAGENTS; i += 1) {
      run.say(
        sdk.taskStarted(`extra-${i}`, `extra-call-${i}`, { description: `Extra ${i}` }),
        sdk.taskDone(`extra-${i}`, "completed"),
      );
    }
    const titles = () => c.manager.list(DIR).flatMap((s) => (s.subagent && !s.running ? [s.title] : []));
    await until(() => titles().includes(`Extra ${MAX_ENDED_SUBAGENTS}`));
    expect(titles()).toHaveLength(MAX_ENDED_SUBAGENTS);
    expect(titles()).not.toContain("Extra 0");
    expect(titles()).toContain("Extra 1");
    // The one still running is not an ended one: it stays.
    expect(c.manager.list(DIR).filter((s) => s.subagent && s.running)).toHaveLength(1);
    expect(c.manager.list(DIR).filter((s) => s.subagent && s.running)).toHaveLength(1);
  });

  it("is archived by the user, and only once it has ended", async () => {
    const { c, run, sub } = await spawned();
    expect(() => c.manager.archive(sub().id)).toThrow(CHAT_MESSAGES.noSubagentArchive);
    expect(() => c.manager.archive(c.id)).toThrow(CHAT_MESSAGES.noSubagentArchive);
    run.say(sdk.taskDone(TASK, "completed"));
    await until(() => !sub().running);
    const id = sub().id;
    c.manager.archive(id);
    expect(c.manager.list(DIR).filter((s) => s.subagent)).toEqual([]);
    expect(() => c.manager.watch(id, () => {})).toThrow(CHAT_MESSAGES.noChat);
  });

  it("does not come back from a late message of an archived subagent", async () => {
    const { c, run, sub } = await spawned();
    run.say(sdk.taskDone(TASK, "completed"));
    await until(() => !sub().running);
    c.manager.archive(sub().id);
    run.say(sdk.within(CALL, TASK, sdk.assistant("s9", [sdk.text("late")])), sdk.assistant("m2", [sdk.text("after")]));
    await until(() => JSON.stringify(c.events).includes("after"));
    expect(c.manager.list(DIR).filter((s) => s.subagent)).toEqual([]);
  });

  it("opens again, running and stoppable, when the same task starts again", async () => {
    const { c, run, sub, watch } = await spawned();
    run.say(sdk.taskDone(TASK, "completed"));
    await until(() => !sub().running);
    const id = sub().id;
    run.say(sdk.taskStarted(TASK, CALL, { prompt: "Again." }));
    await until(() => sub().running);
    expect(sub()).toMatchObject({ id, subagent: { parent: c.id, stoppable: true } });
    expect(c.manager.list(DIR).filter((s) => s.subagent)).toHaveLength(1);
    expect(JSON.stringify(watch())).toContain("Looking at the diff.");
    await c.manager.stop(id);
    expect(run.stopped).toEqual([TASK]);
  });
});

describe("how a subagent ends with its session", () => {
  it("ends a foreground subagent with its session's turn, and leaves a background one", async () => {
    const { c, run } = await spawned({ is_backgrounded: false });
    run.say(sdk.taskStarted("t-bg", "c-bg", { description: "In the background" }));
    await until(() => c.manager.list(DIR).filter((s) => s.subagent).length === 2);
    run.say(sdk.success("Done."));
    const rows = () => c.manager.list(DIR).filter((s) => s.subagent);
    await until(() => rows().some((s) => !s.running));
    expect(rows().map((s) => [s.title, s.running])).toEqual([
      ["Review the diff", false],
      ["In the background", true],
    ]);
  });

  it("ends them as stopped when the agent exits quietly with no turn open", async () => {
    const { c, run, sub, watch } = await spawned();
    run.say(sdk.success("Done."));
    await until(() => !c.view().running);
    run.end();
    await until(() => !sub().running);
    expect(JSON.stringify(watch())).toContain('"outcome":"stopped"');
  });

  it("ends them as failed when the agent crashes mid-turn", async () => {
    const { run, sub, watch } = await spawned();
    run.crash(new Error("boom"));
    await until(() => !sub().running);
    expect(JSON.stringify(watch())).toContain('"outcome":"failed"');
  });
});

describe("Stop on the session", () => {
  it("also stops every background subagent it spawned, and not a foreground one", async () => {
    const { c, run } = await spawned();
    run.say(
      sdk.taskStarted("t-fg", "c-fg", { description: "Foreground", is_backgrounded: false }),
      sdk.taskStarted("t-bg2", "c-bg2", { description: "Second" }),
    );
    await until(() => c.manager.list(DIR).filter((s) => s.subagent).length === 3);
    await c.manager.stop(c.id);
    expect(run.interrupts).toBe(1);
    expect(run.stopped.toSorted()).toEqual(["t-bg2", TASK].toSorted());
  });

  it("still ends the turn when a subagent's stop is refused", async () => {
    const { c, run } = await spawned();
    run.stopFails = true;
    await c.manager.stop(c.id);
    expect(run.interrupts).toBe(1);
  });
});

describe("Stop racing the subagent's end", () => {
  it("answers as for any subagent that can't be stopped", async () => {
    const { c, run, sub } = await spawned();
    run.stopFails = true;
    await expect(c.manager.stop(sub().id)).rejects.toThrow(CHAT_MESSAGES.noSubagentStop);
  });
});

describe("a task that is not a subagent", () => {
  it("makes no chat, from its start or its own messages", async () => {
    const { c, run } = await spawned();
    run.say(
      sdk.taskStarted("t-sh", "c-sh", { task_type: "local_bash" }),
      sdk.within("c-sh", "t-sh", sdk.assistant("s7", [sdk.text("shell output")])),
      sdk.assistant("m9", [sdk.text("marker")]),
    );
    await until(() => JSON.stringify(c.events).includes("marker"));
    expect(c.manager.list(DIR).filter((s) => s.subagent)).toHaveLength(1);
  });
});
