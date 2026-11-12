/**
 * STORY-54 AC1 and AC4: a story session that ends a turn, stops or fails posts a short notice in the Dev Lead's chat,
 * and notices that arrive while the Dev Lead is busy go together in one message when it is idle. The app writes every
 * notice: no model call. Real services, sockets, git and cards; only the Agent SDK and the clock are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { noticeMessage, type ChatEvent } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";
import { finish, idleLead, noticesIn, settled } from "./story-lead.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 10\n" });
});
afterAll(() => w.close());

const stop = (id: string) => w.window.ask("story.stop", { dir: w.repo.main, id });
const hasEnd = (events: ChatEvent[], outcome: string) =>
  events.some((e) => e.type === "turn-end" && e.outcome === outcome);

describe("AC1: a notice in the Dev Lead's chat", { timeout: 30_000 }, () => {
  it("says the story's turn ended, with the last of what it said, as one message the Dev Lead's agent hears", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-5");
    child.run.say(sdk.init());
    finish(child.run, "Wrote the tests.\nAll of them pass.");

    await w.until(() => noticesIn(lead.events()).length === 1);
    const expected = noticeMessage([
      { story: "STORY-5", outcome: "ended", summary: "Wrote the tests. All of them pass." },
    ]);
    expect(noticesIn(lead.events())).toEqual([expected]);
    // It arrives as a message from the user's side of the chat, and the Dev Lead's agent hears it.
    await w.until(() => lead.run.heard.length === 2);
    expect(lead.run.heard[1]).toBe(expected);
    expect(lead.events().findLast((e) => e.type === "user")).toEqual({ type: "user", text: expected });
  });

  it("says the story failed, with why", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-6");
    child.run.say(sdk.init(), sdk.failure({ result: "Out of credit." }));

    await w.until(() => noticesIn(lead.events()).length === 1);
    expect(noticesIn(lead.events())).toEqual([
      noticeMessage([{ story: "STORY-6", outcome: "failed", summary: "Out of credit." }]),
    ]);
  });

  it("says the story stopped when the user stops it", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-7");
    child.run.say(sdk.init(), sdk.start("s1"), sdk.delta("Halfway there."));
    const events = await w.window.watch(child.chat);
    await w.until(() => events().some((e) => e.type === "text"));

    expect(await stop("STORY-7")).toMatchObject({ ok: true });
    child.run.say(sdk.failure());
    await w.until(() => hasEnd(events(), "stopped"));

    await w.until(() => noticesIn(lead.events()).length === 1);
    expect(noticesIn(lead.events())).toEqual([
      noticeMessage([{ story: "STORY-7", outcome: "stopped", summary: "Halfway there." }]),
    ]);
  });

  it("costs the Dev Lead's agent nothing until a notice arrives, and a notice is not repeated", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-9");
    child.run.say(sdk.init());
    await settled(w);
    expect(lead.run.heard).toHaveLength(1);
    finish(child.run, "Done.");
    await w.until(() => lead.run.heard.length === 2);
    // The Dev Lead's turn on the notice ends; a later turn-end is the marker that nothing more was sent for it.
    lead.run.say(sdk.success("Noted."));
    await w.until(() => lead.events().filter((e) => e.type === "turn-end").length === 2);
    await settled(w);
    expect(noticesIn(lead.events())).toHaveLength(1);
    expect(lead.run.heard).toHaveLength(2);
  });

  it("is not sent when the story was started with no Dev Lead chat (the Start button of an undrafted feature)", async () => {
    const before = w.claude.runs.length;
    const started = await w.window.ask("story.start", { dir: w.repo.main, id: "STORY-10" });
    expect(started).toMatchObject({ ok: true });
    await w.until(() => w.claude.runs.length === before + 1 && w.claude.runs[before]!.heard.length === 1);
    const run = w.claude.runs[before]!;
    run.say(sdk.init());
    finish(run, "Done.");
    const chat = (started.result as { chat: string }).chat;
    const events = await w.window.watch(chat);
    await w.until(() => hasEnd(events(), "done"));
    await settled(w);
    expect(w.claude.runs).toHaveLength(before + 1);
  });
});

describe("AC4: notices that arrive while the Dev Lead is busy", { timeout: 30_000 }, () => {
  it("wait, and go in one message when its turn ends, not one turn each", async () => {
    // The lead's first turn is still running.
    const lead = await w.runningLead();
    const a = await w.spawnAs(lead, "STORY-11");
    const b = await w.spawnAs(lead, "STORY-12");
    a.run.say(sdk.init());
    b.run.say(sdk.init());
    const [eventsA, eventsB] = [await w.window.watch(a.chat), await w.window.watch(b.chat)];
    finish(a.run, "Eleven is done.");
    await w.until(() => hasEnd(eventsA(), "done"));
    finish(b.run, "Twelve is done.");
    await w.until(() => hasEnd(eventsB(), "done"));
    await settled(w);
    expect(lead.run.heard).toHaveLength(1);
    expect(noticesIn(lead.events())).toEqual([]);

    lead.run.say(sdk.init(), sdk.success("Planned."));
    await w.until(() => lead.run.heard.length === 2);
    await settled(w);
    expect(lead.run.heard).toHaveLength(2);
    expect(noticesIn(lead.events())).toEqual([
      noticeMessage([
        { story: "STORY-11", outcome: "ended", summary: "Eleven is done." },
        { story: "STORY-12", outcome: "ended", summary: "Twelve is done." },
      ]),
    ]);
  });
});
