/**
 * STORY-53 AC2, AC3 and AC4: Stop ends a story session's running turn and marks the story Stopped (stage, worktree and
 * changes untouched); Resume goes on in the same provider session and clears the mark; a stopped session frees its
 * slot. Real services, sockets, git and cards; only the Agent SDK and the clock are faked.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, RESUME_MESSAGE, type ChatEvent } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { clockNow, storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld();
});
afterAll(() => w.close());

const folder = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const ask = (method: string, id: string) => w.window.ask(method, { dir: w.repo.main, id });
const sessionOf = async (id: string) => (await w.sessions()).find((c) => c.story?.id === id);
const rowOf = (node: unknown, id: string): Record<string, unknown> | null => {
  if (Array.isArray(node)) return node.map((n) => rowOf(n, id)).find((n) => n !== null) ?? null;
  if (typeof node !== "object" || node === null) return null;
  const rec = node as Record<string, unknown>;
  if (rec.id === id && "stage" in rec) return rec;
  return (
    Object.values(rec)
      .map((n) => rowOf(n, id))
      .find((n) => n !== null) ?? null
  );
};
const row = async (id: string) => rowOf((await w.window.ask("work.watch", { dir: w.repo.main })).result, id);
/** Polls an async condition. */
async function eventually(ok: () => Promise<boolean>) {
  const end = Date.now() + 10_000;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error("Not seen in 10 s");
    await new Promise((r) => setTimeout(r, 20));
  }
}
const kinds = (events: ChatEvent[]) => events.map((e) => (e.type === "turn-end" ? `end:${e.outcome}` : e.type));

/** Starts the story's session and waits until its agent heard the first message. */
async function started(id: string, session: string) {
  const before = w.claude.runs.length;
  const reply = await ask("story.start", id);
  expect(reply).toMatchObject({ ok: true });
  const chat = (reply.result as { chat: string }).chat;
  await w.until(() => (w.claude.runs[before]?.heard.length ?? 0) === 1);
  const run = w.claude.runs[before]!;
  run.say(sdk.init("claude-sonnet-5-5", session), sdk.start("m1"), sdk.delta("Working on it."));
  const events = await w.window.watch(chat);
  return { chat, run, events };
}

describe("AC2: Stop", () => {
  it("ends the running turn, keeps the stage, marks the card Stopped with a history event, and leaves the worktree alone", async () => {
    const { chat, run, events } = await started("STORY-5", "session-5");
    const where = folder("STORY-5-spawn-five");
    writeFileSync(join(where, "scratch.txt"), "work in progress\n");
    const head = w.repo.git(where, "rev-parse", "HEAD");
    const status = w.repo.git(where, "status", "--porcelain");

    expect(await ask("story.stop", "STORY-5")).toMatchObject({ ok: true });
    expect(run.interrupts).toBe(1);
    run.say(sdk.failure());
    await w.until(() => kinds(events()).includes("end:stopped"));
    expect((await sessionOf("STORY-5"))?.running).toBe(false);

    const card = await w.card("STORY-5", where);
    expect(card.status).toBe("In Progress");
    expect(card.history.at(-1)).toEqual({
      at: clockNow.toISOString().replace(".000Z", "Z"),
      field: "stopped",
      from: null,
      to: "stopped",
      by: "user",
    });
    expect(await row("STORY-5")).toMatchObject({ stage: "In Progress", stopped: true });
    expect(w.repo.git(where, "rev-parse", "HEAD")).toBe(head);
    expect(w.repo.git(where, "status", "--porcelain")).toBe(status);
    expect(readFileSync(join(where, "scratch.txt"), "utf8")).toBe("work in progress\n");
    expect(chat).toBeTruthy();
  });

  it("is refused when the story is already stopped, isn't running, has no agent, or isn't there", async () => {
    expect(await ask("story.stop", "STORY-5")).toMatchObject({ ok: false, error: "STORY-5 is already stopped." });
    expect(await ask("story.stop", "STORY-7")).toMatchObject({ ok: false, error: "STORY-7 has no agent to stop." });
    expect(await ask("story.stop", "STORY-99")).toMatchObject({ ok: false, error: "That card is gone." });
    // A session whose turn ended waits for a message; it isn't running.
    const { run } = await started("STORY-9", "session-9");
    run.say(sdk.success("done"));
    await eventually(async () => (await sessionOf("STORY-9"))?.running === false);
    expect(await ask("story.stop", "STORY-9")).toMatchObject({ ok: false, error: "STORY-9 isn't running." });
    expect((await w.card("STORY-9", folder("STORY-9-spawn-9"))).history.some((e) => e.field === "stopped")).toBe(false);
  });
});

describe("AC3: Resume", () => {
  it("goes on in the same session and transcript, and clears Stopped with a history event", async () => {
    const run = w.claude.runs[0]!;
    const chat = (await sessionOf("STORY-5"))!.id;
    const runs = w.claude.runs.length;
    expect(await ask("story.resume", "STORY-5")).toMatchObject({ ok: true });
    await w.until(() => run.heard.length === 2);
    expect(run.heard[1]).toBe(RESUME_MESSAGE);
    expect(w.claude.runs).toHaveLength(runs);
    const events = await w.window.watch(chat);
    expect(kinds(events())).toEqual(["user", "started", "text", "end:stopped", "user"]);
    expect((await sessionOf("STORY-5"))?.running).toBe(true);

    const card = await w.card("STORY-5", folder("STORY-5-spawn-five"));
    expect(card.status).toBe("In Progress");
    expect(card.history.at(-1)).toEqual({
      at: clockNow.toISOString().replace(".000Z", "Z"),
      field: "stopped",
      from: "stopped",
      to: null,
      by: "user",
    });
    expect(await row("STORY-5")).toMatchObject({ stopped: false });
  });

  it("starts the provider's session again with its id when the agent process has gone", async () => {
    const { run } = await started("STORY-6", "session-6");
    expect(await ask("story.stop", "STORY-6")).toMatchObject({ ok: true });
    run.say(sdk.failure());
    await eventually(async () => (await sessionOf("STORY-6"))?.running === false);
    run.end();
    const runs = w.claude.runs.length;
    expect(await ask("story.resume", "STORY-6")).toMatchObject({ ok: true });
    await w.until(() => w.claude.runs.length === runs + 1);
    expect(w.claude.runs[runs]!.options.resume).toBe("session-6");
    await w.until(() => w.claude.runs[runs]!.heard.length === 1);
    expect(w.claude.runs[runs]!.heard[0]).toBe(RESUME_MESSAGE);
  });

  it("is refused for a story that isn't stopped", async () => {
    expect(await ask("story.resume", "STORY-5")).toMatchObject({ ok: false, error: "STORY-5 isn't stopped." });
    expect(await ask("story.resume", "STORY-7")).toMatchObject({ ok: false, error: "STORY-7 isn't stopped." });
    expect(CHAT_MESSAGES.noSession).toBe("This story has no session.");
  });
});
