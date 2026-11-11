/**
 * STORY-53 (review): Stop on a story still waiting in the queue, never started, drops it from the queue; its card keeps
 * its stage and gets no Stopped mark (its card is on the feature branch, so there is no copy to write an event to), and the
 * queue's order is kept. Also Resume on an idle session that
 * stopped without the user: one whose turn failed. Real services, sockets, git and cards; only the Agent SDK and the
 * clock are faked.
 */
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESUME_MESSAGE, type ChatSummary } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 1\n" });
});
afterAll(() => w.close());

const ask = (method: string, id: string) => w.window.ask(method, { dir: w.repo.main, id });
const sessionOf = async (id: string): Promise<ChatSummary | undefined> =>
  (await w.sessions()).find((c) => c.story?.id === id);
const folder = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
/** Polls an async condition. */
async function eventually(ok: () => Promise<boolean>) {
  const end = Date.now() + 10_000;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error("Not seen in 10 s");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("Stop on a story that is queued and never started", () => {
  it("takes it out of the queue: no session, the card keeps its stage with an event and no Stopped mark", async () => {
    expect(await ask("story.start", "STORY-5")).toMatchObject({ ok: true, result: { queued: false } });
    await w.until(() => w.claude.runs.length === 1);
    const first = w.claude.runs[0]!;
    await w.until(() => first.heard.length === 1);
    first.say(sdk.init("claude-sonnet-5-5", "session-5"));
    expect(await ask("story.start", "STORY-6")).toMatchObject({ ok: true, result: { queued: true } });
    expect(await ask("story.start", "STORY-7")).toMatchObject({ ok: true, result: { queued: true } });
    expect((await sessionOf("STORY-6"))?.queued).toBe(true);

    expect(await ask("story.stop", "STORY-6")).toMatchObject({ ok: true });
    expect(await sessionOf("STORY-6")).toBeUndefined();
    const card = await w.card("STORY-6");
    expect(card.status).toBe("Ready");
    expect(card.agent).toBeNull();
    // Its card is on the feature branch, which nobody has checked out: there is no copy to write, so it is as it was.
    expect(card.history.some((e) => e.field === "stopped")).toBe(false);
    expect(w.claude.runs).toHaveLength(1);
  });

  it("keeps the order of the others: the next one in line starts when the slot frees, not the dropped one", async () => {
    const first = w.claude.runs[0]!;
    first.say(sdk.success("done"));
    await w.until(() => w.claude.runs.length === 2);
    await w.until(() => (w.claude.runs[1]?.heard.length ?? 0) === 1);
    expect(w.claude.runs[1]!.heard[0]).toContain("STORY-7");
    expect((await sessionOf("STORY-7"))?.queued).toBeFalsy();
    expect(await sessionOf("STORY-6")).toBeUndefined();
    expect(w.claude.runs).toHaveLength(2);
  });

  it("is refused for a story that has neither a session nor an agent", async () => {
    expect(await ask("story.stop", "STORY-10")).toMatchObject({ ok: false, error: "STORY-10 has no agent to stop." });
  });
});

describe("Resume on an idle session whose turn failed", () => {
  it("goes on in the same session with no Stopped mark cleared, because there was none", async () => {
    const second = w.claude.runs[1]!;
    second.say(sdk.init("claude-sonnet-5-5", "session-7"), sdk.failure());
    await eventually(async () => (await sessionOf("STORY-7"))?.stalled === true);
    const chat = (await sessionOf("STORY-7"))!;
    expect(chat.running).toBe(false);
    const before = (await w.card("STORY-7", folder("STORY-7-spawn-seven"))).history.length;

    expect(await ask("story.resume", "STORY-7")).toMatchObject({ ok: true });
    await w.until(() => second.heard.length === 2);
    expect(second.heard[1]).toBe(RESUME_MESSAGE);
    expect((await sessionOf("STORY-7"))?.stalled).toBeUndefined();
    expect((await w.card("STORY-7", folder("STORY-7-spawn-seven"))).history).toHaveLength(before);
  });

  it("is not offered after a turn that finished", async () => {
    const second = w.claude.runs[1]!;
    second.say(sdk.success("done"));
    await eventually(async () => (await sessionOf("STORY-7"))?.running === false);
    expect(await ask("story.resume", "STORY-7")).toMatchObject({ ok: false, error: "STORY-7 isn't stopped." });
  });
});

describe("after the drop", () => {
  it("can be started again afterwards", async () => {
    expect(await ask("story.start", "STORY-6")).toMatchObject({ ok: true });
    expect(await sessionOf("STORY-6")).toBeDefined();
  });
});
