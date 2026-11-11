/**
 * STORY-9 (review): a story session's approval shown in the Dev Lead's chat belongs to the session's turn, not the
 * lead's. The lead's turn ending leaves it answerable; it closes when the session answers, ends its turn or ends.
 * Real services, window socket and agent socket; only the Agent SDK and the clock are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldChat, type ChatEvent } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 10\n" });
});
afterAll(() => w.close());

const toolRow = (events: ChatEvent[], id: string) => {
  const row = foldChat(events).items.find((i) => i.kind === "tool" && i.id === id);
  return row?.kind === "tool" ? row : undefined;
};
const status = (events: ChatEvent[], id: string) => toolRow(events, id)?.approval?.status;
const waiting = async (lead: string) => (await w.chatList()).find((c) => c.id === lead)?.waiting;

/** A lead with a session that asks for Bash; then the lead's own turn ends. */
async function askedThenLeadEnds(story: string, id: string) {
  const lead = await w.runningLead();
  const child = await w.spawnAs(lead, story);
  child.run.say(sdk.init());
  const pending = child.run.ask("Bash", { command: "git status" }, id);
  await w.until(() => status(lead.events(), id) === "pending");
  lead.run.say(sdk.init(), sdk.success("Done."));
  await w.until(() => lead.events().some((e) => e.type === "turn-end"));
  return { lead, child, pending };
}

describe("a mirrored approval and the Dev Lead's turn", { timeout: 30_000 }, () => {
  it("stays pending and answerable after the lead's turn ends, and is answered from the lead's chat", async () => {
    const { lead, pending } = await askedThenLeadEnds("STORY-9", "m1");
    expect(status(lead.events(), "m1")).toBe("pending");
    expect(await waiting(lead.id)).toBe("approval");
    const answered = await w.window.ask("chat.approve", { id: lead.id, tool: "m1", choice: "allow" });
    expect(answered).toMatchObject({ ok: true });
    expect(await pending).toMatchObject({ behavior: "allow" });
    await w.until(() => status(lead.events(), "m1") === "allowed");
    expect(await waiting(lead.id)).toBe("reply");
  });

  it("resolves when it is answered in the session's own chat", async () => {
    const { lead, child, pending } = await askedThenLeadEnds("STORY-10", "m2");
    await w.window.ask("chat.approve", { id: child.chat, tool: "m2", choice: "deny" });
    await pending;
    await w.until(() => toolRow(lead.events(), "m2")?.denied === true);
    expect(await waiting(lead.id)).toBe("reply");
  });

  it("resolves when it is answered from the Inbox", async () => {
    const { lead, pending } = await askedThenLeadEnds("STORY-11", "m3");
    const inbox = (await w.window.ask("inbox.watch", { dir: w.repo.main, waitMs: 0 })).result as {
      items: { chat: string; request: { id: string } }[];
    };
    const item = inbox.items.find((i) => i.request.id === "m3");
    expect(item).toBeDefined();
    await w.window.ask("chat.approve", { id: item!.chat, tool: "m3", choice: "allow" });
    await pending;
    await w.until(() => status(lead.events(), "m3") === "allowed");
  });

  it("closes when the session's own turn ends, cancelled in the lead's chat", async () => {
    const lead = await w.runningLead();
    const child = await w.spawnAs(lead, "STORY-12");
    child.run.say(sdk.init());
    void child.run.ask("Bash", { command: "git log" }, "m4");
    await w.until(() => status(lead.events(), "m4") === "pending");
    child.run.say(sdk.success("Stopped asking."));
    await w.until(() => toolRow(lead.events(), "m4")?.cancelled === true);
    expect(await waiting(lead.id)).not.toBe("approval");
  });
});
