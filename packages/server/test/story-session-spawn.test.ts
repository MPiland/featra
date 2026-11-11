/**
 * STORY-9 (review): a story session is a worker; it can't put agents on other stories. Real services and agent
 * sockets: the session's own socket, as its MCP process opens it, is refused and nothing is made.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_MESSAGES } from "../src/agent-bridge.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld();
});
afterAll(() => w.close());

describe("a story session spawning", () => {
  it("is refused with a clear message, and no session or worktree is made", async () => {
    const lead = await w.runningLead();
    const child = await w.spawnAs(lead, "STORY-5");
    const agent = await w.agentOf(child.chat);
    const before = (await w.chatList()).length;
    const runs = w.claude.runs.length;

    agent.socket.send({ id: 1, method: "story.spawn", params: { story: "STORY-6" } });
    const answered = await agent.socket.next((f) => f.id === 1, 20_000);
    expect(answered.ok).toBe(false);
    expect(JSON.stringify(answered.error)).toContain(AGENT_MESSAGES.sessionSpawn);

    expect((await w.chatList()).length).toBe(before);
    expect(w.claude.runs.length).toBe(runs);
    expect((await w.card("STORY-6")).status).toBe("Ready");
  });
});
