/**
 * STORY-54 AC1 (a stop): the user's Stop on a story session still waiting in the queue drops it, and the Dev Lead that
 * spawned it is told it was stopped, since no turn will end to say so. Real services, sockets, git and cards; only the
 * Agent SDK and the clock are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MESSAGE_MESSAGES, noticeMessage } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";
import { idleLead, noticesIn } from "./story-lead.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 1\n" });
});
afterAll(() => w.close());

describe("AC1: a story taken off the queue", { timeout: 30_000 }, () => {
  it("tells the Dev Lead it was stopped before it started", async () => {
    const lead = await idleLead(w);
    const first = await w.spawnAs(lead, "STORY-5");
    first.run.say(sdk.init());

    const id = 4711;
    lead.agent.socket.send({ id, method: "story.spawn", params: { story: "STORY-6" } });
    const answered = await lead.agent.socket.next((f) => f.id === id, 20_000);
    expect(answered).toMatchObject({ ok: true, result: { queued: true } });

    // Queued, it has no turn to message: the Dev Lead is told when it can be.
    expect(await lead.agent.ask("session.message", { story: "STORY-6", text: "Hi." })).toMatchObject({
      ok: false,
      error: MESSAGE_MESSAGES.queued("STORY-6"),
    });

    expect(await w.window.ask("story.stop", { dir: w.repo.main, id: "STORY-6" })).toMatchObject({ ok: true });
    await w.until(() => noticesIn(lead.events()).length === 1);
    expect(noticesIn(lead.events())).toEqual([
      noticeMessage([{ story: "STORY-6", outcome: "stopped", summary: "Taken off the queue before it started." }]),
    ]);
  });
});
