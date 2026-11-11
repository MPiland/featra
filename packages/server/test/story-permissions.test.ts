/**
 * STORY-9 AC3 and AC7: a story session starts with its Dev Lead's permission mode and always-allow rules, and an
 * approval it still needs shows in the Dev Lead's chat labelled with the story, on every connected client, then in the
 * Inbox. `spawn_session` itself is an ordinary tool of the caller's permissions: no approval only the desktop can give.
 * Real services, two window sockets and the agent socket; only the Agent SDK and the clock are faked.
 */
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatEvent, Inbox } from "@featra/work-format";
import { sdk } from "./fake-query.ts";
import { storyWorld, type Client, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld();
});
afterAll(() => w.close());

const labelled = (events: ChatEvent[]) =>
  events.find((e) => e.type === "approval" && e.id === "c1" && e.story === "STORY-7");

const RULE: PermissionUpdate = {
  type: "addRules",
  rules: [{ toolName: "Bash", ruleContent: "npm test" }],
  behavior: "allow",
  destination: "localSettings",
};

const runningLead = (_window: Client, mode?: string) => w.runningLead(mode);
const spawnAs = (lead: Parameters<StoryWorld["spawnAs"]>[0], story: string) => w.spawnAs(lead, story);

describe("AC3: inheriting the Dev Lead's permissions", () => {
  it("gives the session the lead's permission mode and the allow rules it was given for the chat", async () => {
    const lead = await runningLead(w.window, "acceptEdits");
    lead.run.say(sdk.init());
    const asked = lead.run.ask("Bash", { command: "npm test" }, "t1", { suggestions: [RULE] });
    await w.until(() => lead.events().some((e) => e.type === "approval"));
    await w.window.ask("chat.approve", { id: lead.id, tool: "t1", choice: "allow-chat" });
    expect(await asked).toMatchObject({ behavior: "allow" });

    const child = await spawnAs(lead, "STORY-5");
    expect(child.run.options.permissionMode).toBe("acceptEdits");
    expect(child.run.options.allowedTools).toEqual(expect.arrayContaining(["mcp__featra", "Bash(npm test)"]));
  });

  it("leaves a lead in the default mode with no rules asking as any chat does", async () => {
    const lead = await runningLead(w.window);
    const child = await spawnAs(lead, "STORY-6");
    expect(child.run.options.permissionMode).toBe("default");
    expect(child.run.options.allowedTools).toEqual(["mcp__featra"]);
  });
});

describe("AC3 and AC7: an approval the session still needs", () => {
  it("shows in the lead's chat labelled with the story on every client, is answered there, and reaches the Inbox", async () => {
    const other = await w.open();
    const lead = await runningLead(w.window);
    const seenByOther = await other.watch(lead.id);
    await w.window.ask("inbox.asked", { dir: w.repo.main });
    await other.ask("inbox.asked", { dir: w.repo.main });

    // spawn_session needs no approval: the Featra MCP's tools are allowed outright, whatever the window says.
    expect(lead.run.options.allowedTools).toContain("mcp__featra");
    const child = await spawnAs(lead, "STORY-7");
    expect(lead.events().some((e: ChatEvent) => e.type === "approval")).toBe(false);

    child.run.say(sdk.init());
    const pending = child.run.ask("Bash", { command: "git status" }, "c1");
    await w.until(() => labelled(lead.events()) !== undefined);
    await w.until(() => labelled(seenByOther()) !== undefined);

    // Both clients were told of the request as it was asked, once, for the session's own chat.
    for (const client of [w.window, other]) {
      const frame = await client.socket.next((f) => f.event === "inbox.asked", 5000);
      expect(frame.data).toMatchObject({ chat: child.chat, card: "STORY-7", request: { id: "c1" } });
    }
    const inbox = (await w.window.ask("inbox.watch", { dir: w.repo.main, waitMs: 0 })).result as Inbox;
    expect(inbox.items.filter((i) => i.request.id === "c1").map((i) => i.chat)).toEqual([child.chat]);

    // Answering it in the lead's chat answers the session's request, and both logs say so.
    expect(await w.window.ask("chat.approve", { id: lead.id, tool: "c1", choice: "allow" })).toMatchObject({
      ok: true,
    });
    expect(await pending).toMatchObject({ behavior: "allow" });
    await w.until(() => lead.events().some((e) => e.type === "tool-allowed" && e.id === "c1"));
    await w.until(() => seenByOther().some((e) => e.type === "tool-allowed" && e.id === "c1"));
  });
});
