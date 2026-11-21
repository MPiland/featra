/**
 * STORY-68 (review B1, S5): a story session's `request_action`, shown in the Dev Lead's chat too. It is answered from
 * there, it lives as long as the call (not the session's turn), and it ends when the session's MCP connection closes.
 * Real services, window socket and agent sockets; only the Agent SDK and the clock are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldChat, REQUEST_ACTION_TOOL, type ActionRequest, type ChatEvent } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type Client, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 10\n" });
});
afterAll(() => w.close());

const SIGN_IN: ActionRequest = { title: "Sign in to the CLI", steps: [{ text: "Run it.", command: "gh auth login" }] };

const card = (events: ChatEvent[]) => {
  const row = foldChat(events).items.find((i) => i.kind === "tool" && i.name === REQUEST_ACTION_TOOL);
  return row?.kind === "tool" ? row : undefined;
};
const status = (events: ChatEvent[]) => card(events)?.approval?.status;
const cancelled = (events: ChatEvent[]) => card(events)?.cancelled === true;
const waiting = async (id: string) => (await w.chatList()).find((c) => c.id === id)?.waiting;

/** A lead whose story session's agent asks `request_action` on its own MCP connection, shown pending in the lead's chat. */
async function sessionAsks(story: string) {
  const lead = await w.runningLead();
  const child = await w.spawnAs(lead, story);
  child.run.say(sdk.init());
  const agent: Client = await w.agentOf(child.chat);
  const answer = agent.ask("action.request", { ...SIGN_IN, call: "c1" });
  await w.until(() => status(lead.events()) === "pending");
  const tool = card(lead.events())!.id;
  return { lead, child, agent, answer, tool };
}

describe("a story session's request in the Dev Lead's chat", () => {
  it("is answered from the lead's chat, and Done reaches the session's agent", async () => {
    const { lead, answer, tool } = await sessionAsks("STORY-9");
    expect(await waiting(lead.id)).toBe("approval");
    expect(await w.window.ask("chat.approve", { id: lead.id, tool, choice: "allow" })).toMatchObject({ ok: true });
    expect(await answer).toMatchObject({ ok: true, result: { outcome: "done" } });
    await w.until(() => status(lead.events()) === "allowed");
  });

  it("stays pending in both chats when the session's turn ends, as a background subagent's may", async () => {
    const { lead, child, answer, tool } = await sessionAsks("STORY-10");
    const own = await w.window.watch(child.chat);
    child.run.say(sdk.success("Waiting in the background."));
    await w.until(() => own().some((e) => e.type === "turn-end"));
    expect(status(own())).toBe("pending");
    expect(status(lead.events())).toBe("pending");
    expect(await waiting(lead.id)).toBe("approval");
    await w.window.ask("chat.approve", { id: lead.id, tool, choice: "allow" });
    expect(await answer).toMatchObject({ ok: true, result: { outcome: "done" } });
  });

  it("ends as cancelled in both chats when the session's MCP connection closes, as when its process dies", async () => {
    const { lead, child, agent } = await sessionAsks("STORY-11");
    const own = await w.window.watch(child.chat);
    agent.close();
    await w.until(() => cancelled(own()) && cancelled(lead.events()));
    expect(await waiting(lead.id)).not.toBe("approval");
    expect(await waiting(child.chat)).not.toBe("approval");
  });
});
