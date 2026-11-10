/** STORY-7: the Inbox when a request leaves or never arrives, and what the page hears as each is asked, through the real chat manager. Only the SDK, the `claude` lookup, the clock and timers are fake. */
import { describe, expect, it } from "vitest";
import type { InboxItem } from "@featra/work-format";
import { DIR } from "./chat-fixture.ts";
import { WAIT, world } from "./inbox-world.ts";
import { until } from "./until.ts";

describe("edge cases: when a request leaves, or never arrives", () => {
  it("never shows a request answered in the chat just before the wait passes", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    const { answer } = await c.askApproval();
    w.clock.advance(WAIT - 1);
    w.manager.approve(c.id, "t1", { choice: "allow" });
    await answer;
    w.clock.advance(WAIT);
    expect(inbox.pushes).toEqual([]);
    expect(w.clock.timersSet()).toBe(0);
  });

  it("clears a request answered in the chat just after the wait passes", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    const { answer } = await c.askApproval();
    w.clock.advance(WAIT);
    expect(inbox.latest().items).toHaveLength(1);
    w.manager.approve(c.id, "t1", { choice: "allow" });
    await answer;
    expect(inbox.latest().items).toEqual([]);
    expect(inbox.pushes).toHaveLength(2);
  });

  it("clears a request when the user stops the turn while it is in the Inbox", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    await c.askApproval();
    w.clock.advance(WAIT);
    expect(inbox.latest().items).toHaveLength(1);
    await w.manager.stop(c.id);
    expect(inbox.latest().items).toEqual([]);
    expect(c.events.some((e) => e.type === "approval-cancelled")).toBe(true);
  });

  it("clears requests when their project is closed, and sends nothing later", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    await c.askApproval();
    w.clock.advance(WAIT);
    expect(inbox.latest().items).toHaveLength(1);
    w.manager.closeProjects(() => false);
    expect(inbox.latest().items).toEqual([]);
    expect(w.watch().first.items).toEqual([]);
  });

  it("stops sending to a watcher that has stopped", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    inbox.stop();
    await c.askApproval();
    await until(() => c.events.some((e) => e.type === "approval"));
    w.clock.advance(WAIT);
    expect(inbox.pushes).toEqual([]);
    expect(w.clock.timersSet()).toBe(0);
  });
});

describe("AC3: the page hears each request as it is asked, whatever the wait", () => {
  it("pushes each approval and question at once, for the project's chats only", async () => {
    const w = world();
    const c = await w.chatCalling({ card: "STORY-9" });
    const other = await w.chatCalling({ dir: "/home/me/other" });
    const asked: InboxItem[] = [];
    const elsewhere: InboxItem[] = [];
    w.manager.watchAsked(DIR, (i) => asked.push(i));
    w.manager.watchAsked("/home/me/other", (i) => elsewhere.push(i));
    await c.askApproval();
    await until(() => asked.length === 1);
    await c.askQuestion();
    await until(() => asked.length === 2);
    expect(asked.map((i) => i.request.type)).toEqual(["approval", "question"]);
    expect(asked[0]).toMatchObject({ chat: c.id, card: "STORY-9", since: w.clock.now().toISOString() });
    expect(elsewhere).toEqual([]);
    await other.askApproval();
    await until(() => elsewhere.length === 1);
    expect(asked).toHaveLength(2);
  });

  it("stops pushing once the listener has stopped", async () => {
    const w = world();
    const c = await w.chatCalling();
    const asked: InboxItem[] = [];
    w.manager.watchAsked(DIR, (i) => asked.push(i))();
    await c.askApproval();
    await until(() => c.events.some((e) => e.type === "approval"));
    expect(asked).toEqual([]);
  });
});
