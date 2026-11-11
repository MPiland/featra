/**
 * STORY-54 AC3: `message_session(story, text)` from the Dev Lead goes to the story's session, resuming it when idle; any
 * other chat is refused. A session the user Stopped is not messaged (the card's open note from STORY-53): Stop is the
 * user's, so the message is refused and the story stays Stopped. Real services, sockets, git and cards; only the Agent
 * SDK and the clock are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leadMessage, MESSAGE_MESSAGES } from "@featra/work-format";
import { AGENT_MESSAGES } from "../src/agent-bridge.ts";
import { sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";
import { finish, idleLead, settled } from "./story-lead.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 10\n" });
});
afterAll(() => w.close());

const message = (agent: Awaited<ReturnType<StoryWorld["agentOf"]>>, params: unknown) =>
  agent.ask("session.message", params);

describe("AC3: message_session", { timeout: 30_000 }, () => {
  it("sends to the session of the Dev Lead's story, in the same provider session, when it is idle", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-5");
    const events = await w.window.watch(child.chat);
    child.run.say(sdk.init());
    finish(child.run, "Done for now.");
    await w.until(() => events().some((e) => e.type === "turn-end"));
    const runs = w.claude.runs.length;

    const sent = await message(lead.agent, { story: "STORY-5", text: "Now add the tests." });
    expect(sent).toMatchObject({ ok: true, result: { story: "STORY-5" } });
    await w.until(() => child.run.heard.length === 2);
    expect(child.run.heard[1]).toBe(leadMessage("Now add the tests."));
    expect(w.claude.runs).toHaveLength(runs);
    expect((await w.sessions()).find((c) => c.story?.id === "STORY-5")?.running).toBe(true);
  });

  it("is refused to any other chat, including another Dev Lead and a story session", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-6");
    const events = await w.window.watch(child.chat);
    child.run.say(sdk.init());
    finish(child.run, "Done for now.");
    await w.until(() => events().some((e) => e.type === "turn-end"));

    const other = await w.devLead();
    expect(await message(other.agent, { story: "STORY-6", text: "Hi." })).toMatchObject({
      ok: false,
      error: MESSAGE_MESSAGES.notLead("STORY-6"),
    });
    const own = await w.agentOf(child.chat);
    expect(await message(own, { story: "STORY-6", text: "Hi." })).toMatchObject({
      ok: false,
      error: AGENT_MESSAGES.sessionMessage,
    });
    await settled(w);
    expect(child.run.heard).toHaveLength(1);
  });

  it("is refused while the session is working, and for a story with no session or that is no story", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-7");
    child.run.say(sdk.init());
    expect(await message(lead.agent, { story: "STORY-7", text: "Hi." })).toMatchObject({
      ok: false,
      error: MESSAGE_MESSAGES.working("STORY-7"),
    });
    expect(await message(lead.agent, { story: "STORY-13", text: "Hi." })).toMatchObject({
      ok: false,
      error: MESSAGE_MESSAGES.noSession("STORY-13"),
    });
    expect(await message(lead.agent, { story: "FEAT-2", text: "Hi." })).toMatchObject({
      ok: false,
      error: MESSAGE_MESSAGES.badStory,
    });
    expect(await message(lead.agent, { story: "STORY-7", text: "  " })).toMatchObject({
      ok: false,
      error: MESSAGE_MESSAGES.badText,
    });
    expect(child.run.heard).toHaveLength(1);
  });

  it("is refused to a session the user Stopped: 'Only the user can resume it', and the story stays Stopped", async () => {
    const lead = await idleLead(w);
    const child = await w.spawnAs(lead, "STORY-9");
    const events = await w.window.watch(child.chat);
    child.run.say(sdk.init(), sdk.start("s1"), sdk.delta("Working."));
    await w.until(() => events().some((e) => e.type === "text"));
    expect(await w.window.ask("story.stop", { dir: w.repo.main, id: "STORY-9" })).toMatchObject({ ok: true });
    child.run.say(sdk.failure());
    await w.until(() => events().some((e) => e.type === "turn-end"));

    const refused = await message(lead.agent, { story: "STORY-9", text: "Carry on." });
    expect(refused).toMatchObject({ ok: false, error: "STORY-9 is stopped. Only the user can resume it." });
    await settled(w);
    expect(child.run.heard).toHaveLength(1);
    const card = await w.card("STORY-9", `${w.repo.main}/.claude/worktrees/STORY-9-spawn-9`);
    expect(card.history.at(-1)).toMatchObject({ field: "stopped", to: "stopped" });
    expect((await w.sessions()).find((c) => c.story?.id === "STORY-9")?.running).toBe(false);

    // Only the user's Resume goes on, and then the Dev Lead may message it again once the turn ends.
    expect(await w.window.ask("story.resume", { dir: w.repo.main, id: "STORY-9" })).toMatchObject({ ok: true });
    await w.until(() => child.run.heard.length === 2);
  });
});
