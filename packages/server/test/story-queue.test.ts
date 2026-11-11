/**
 * STORY-9 AC5: at most `maxStoryAgents` story sessions run at once (the project's setting, default 3); further spawns
 * show Queued and start in order as running ones end their turn. Real services, sockets and git.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAT_MESSAGES } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 1\n" });
});
afterAll(() => w.close());

const where = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const spawn = async (id: string) =>
  (await w.window.ask("story.start", { dir: w.repo.main, id })).result as { chat: string; queued: boolean };
const queuedIds = async () => (await w.sessions()).filter((c) => c.queued).map((c) => c.story?.id);

describe("AC5: the limit of story agents at once", () => {
  it("starts the first, queues the rest in order, and shows Queued on the sessions", async () => {
    const first = await spawn("STORY-5");
    expect(first.queued).toBe(false);
    const second = await spawn("STORY-6");
    const third = await spawn("STORY-7");
    expect([second.queued, third.queued]).toEqual([true, true]);
    expect(await queuedIds()).toEqual(["STORY-6", "STORY-7"]);
    // A queued story has no worktree yet, and is not In Progress: it starts when its turn comes.
    expect(existsSync(where("STORY-6-spawn-six"))).toBe(false);
    expect(await w.card("STORY-6")).toMatchObject({ status: "Ready" });
    // It can't be sent to, and can't be queued twice.
    const sent = await w.window.ask("chat.send", { id: second.chat, text: "hello" });
    expect(sent).toMatchObject({ ok: false, error: CHAT_MESSAGES.queued });
    expect(await w.window.ask("story.start", { dir: w.repo.main, id: "STORY-6" })).toMatchObject({
      ok: false,
      error: "STORY-6 is already queued.",
    });
    expect(w.claude.runs).toHaveLength(1);
  });

  it("starts the next in order as the running session ends its turn, and the one after as that ends", async () => {
    w.claude.runs[0]!.say(sdk.init(), sdk.success("done"));
    await w.until(() => w.claude.runs.length === 2);
    await w.until(() => existsSync(where("STORY-6-spawn-six")));
    expect(await queuedIds()).toEqual(["STORY-7"]);
    expect(existsSync(where("STORY-7-spawn-seven"))).toBe(false);
    const started = await w.card("STORY-6", where("STORY-6-spawn-six"));
    expect(started).toMatchObject({ status: "In Progress" });
    await w.until(() => (w.claude.runs[1]?.heard.length ?? 0) === 1);
    expect(w.claude.runs[1]!.heard[0]).toContain("STORY-6");

    w.claude.runs[1]!.say(sdk.init(), sdk.success("done"));
    await w.until(() => w.claude.runs.length === 3);
    await w.until(() => existsSync(where("STORY-7-spawn-seven")));
    expect(await queuedIds()).toEqual([]);
    expect(await w.card("STORY-7", where("STORY-7-spawn-seven"))).toMatchObject({ status: "In Progress" });
  });
});
