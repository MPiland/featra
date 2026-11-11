/**
 * STORY-53 (review): the card is written first. Stop marks Stopped and then interrupts, so a failure after the mark
 * still leaves Resume; Resume checks everything, clears the mark and then sends, so a failed card write sends nothing.
 * The interrupt is bounded and does not hold the card lane. Real services, sockets, git and cards; only the Agent SDK,
 * the clock and the disk's rename (made to fail on demand) are faked.
 */
import { join } from "node:path";
import type * as FsPromises from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RESUME_MESSAGE, type ChatSummary } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

const disk = vi.hoisted(() => ({ failing: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return {
    ...real,
    rename: async (...args: Parameters<typeof real.rename>) => {
      if (disk.failing) throw new Error("The disk is full");
      return real.rename(...args);
    },
  };
});

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 5\n", interruptMs: 1500 });
});
afterAll(() => w.close());

const folder = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const ask = (method: string, id: string) => w.window.ask(method, { dir: w.repo.main, id });
const sessionOf = async (id: string): Promise<ChatSummary | undefined> =>
  (await w.sessions()).find((c) => c.story?.id === id);
const stoppedEvents = async (id: string, name: string) =>
  (await w.card(id, folder(name))).history.filter((e) => e.field === "stopped");

async function started(id: string, session: string) {
  const before = w.claude.runs.length;
  expect(await ask("story.start", id)).toMatchObject({ ok: true });
  await w.until(() => (w.claude.runs[before]?.heard.length ?? 0) === 1);
  const run = w.claude.runs[before]!;
  run.say(sdk.init("claude-sonnet-5-5", session), sdk.start("m1"), sdk.delta("Working."));
  return run;
}

describe("a card write that fails", () => {
  it("fails Stop before anything is interrupted: the agent runs on, and Stop can be asked again", async () => {
    const run = await started("STORY-5", "session-5");
    disk.failing = true;
    const refused = await ask("story.stop", "STORY-5");
    disk.failing = false;
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("The disk is full") });
    expect(run.interrupts).toBe(0);
    expect((await sessionOf("STORY-5"))?.running).toBe(true);
    expect(await stoppedEvents("STORY-5", "STORY-5-spawn-five")).toEqual([]);

    expect(await ask("story.stop", "STORY-5")).toMatchObject({ ok: true });
    expect(run.interrupts).toBe(1);
    expect(await stoppedEvents("STORY-5", "STORY-5-spawn-five")).toHaveLength(1);
  });

  it("fails Resume before anything is sent: the story stays Stopped, and Resume works when the disk does", async () => {
    const run = w.claude.runs[0]!;
    run.say(sdk.failure());
    await w.until(() => run.interrupts === 1);
    for (let i = 0; i < 250 && (await sessionOf("STORY-5"))?.running !== false; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    disk.failing = true;
    const refused = await ask("story.resume", "STORY-5");
    disk.failing = false;
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("The disk is full") });
    expect(run.heard).toHaveLength(1);
    expect(await stoppedEvents("STORY-5", "STORY-5-spawn-five")).toHaveLength(1);

    expect(await ask("story.resume", "STORY-5")).toMatchObject({ ok: true });
    await w.until(() => run.heard.length === 2);
    expect(run.heard[1]).toBe(RESUME_MESSAGE);
    expect(await stoppedEvents("STORY-5", "STORY-5-spawn-five")).toHaveLength(2);
  });
});

describe("the interrupt", () => {
  it("does not hold the card lane: another story's Stop finishes while the first interrupt is stuck", async () => {
    const stuck = await started("STORY-9", "session-9");
    const other = await started("STORY-10", "session-10");
    stuck.onInterrupt = () => new Promise<void>(() => {});
    let settled = false;
    const first = ask("story.stop", "STORY-9").then((r) => {
      settled = true;
      return r;
    });
    await w.until(() => stuck.interrupts === 1);
    expect(await ask("story.stop", "STORY-10")).toMatchObject({ ok: true });
    expect(other.interrupts).toBe(1);
    expect(settled).toBe(false);
    // The wait for the provider is bounded: Stop answers, the story is Stopped, and the turn ends when it does.
    expect(await first).toMatchObject({ ok: true });
    expect(await stoppedEvents("STORY-9", "STORY-9-spawn-9")).toHaveLength(1);
  });

  it("keeps the story Stopped when the provider's interrupt fails, so Resume is reachable once the turn ends", async () => {
    const run = await started("STORY-11", "session-11");
    run.onInterrupt = async () => {
      throw new Error("The agent didn't answer");
    };
    expect(await ask("story.stop", "STORY-11")).toMatchObject({
      ok: false,
      error: expect.stringContaining("The agent didn't answer"),
    });
    expect(await stoppedEvents("STORY-11", "STORY-11-spawn-11")).toHaveLength(1);
    run.onInterrupt = null;
    run.say(sdk.failure());
    for (let i = 0; i < 250 && (await sessionOf("STORY-11"))?.running !== false; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(await ask("story.resume", "STORY-11")).toMatchObject({ ok: true });
    await w.until(() => run.heard.length === 2);
  });
});
