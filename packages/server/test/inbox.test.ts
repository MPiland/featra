/** STORY-7: the Inbox through the real chat manager and approval desk. Only the SDK, the `claude` lookup, the clock and timers are fake. */
import { describe, expect, it } from "vitest";
import { CHAT_MESSAGES, type InboxItem } from "@featra/work-format";
import { DIR } from "./chat-fixture.ts";
import { BASH, COLOUR, ids, WAIT, world } from "./inbox-world.ts";
import { MINUTE } from "./manual-clock.ts";
import { until } from "./until.ts";

describe("AC1: a request unanswered for the wait also appears in the Inbox with its chat and card", () => {
  it("is not in the Inbox until it has waited as long as the wait, then is, with its chat and card", async () => {
    const w = world();
    const c = await w.chatCalling({ card: "STORY-9", message: "fix the build" });
    const inbox = w.watch();
    await c.askApproval();
    await until(() => c.events.some((e) => e.type === "approval"));
    expect(inbox.first.items).toEqual([]);
    w.clock.advance(WAIT - 1);
    expect(inbox.pushes).toEqual([]);
    w.clock.advance(1);
    expect(inbox.pushes).toHaveLength(1);
    const [item] = inbox.latest().items as [InboxItem];
    expect(item).toEqual({
      chat: c.id,
      chatName: "fix the build",
      card: "STORY-9",
      project: DIR,
      request: {
        type: "approval",
        id: "t1",
        name: "Bash",
        input: BASH,
        forChat: true,
        covers: "This command: npm test",
      },
      since: new Date(w.clock.now().getTime() - WAIT).toISOString(),
    });
  });

  it("brings a question too, and omits the card for a chat that has none", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    await c.askQuestion();
    await until(() => c.events.some((e) => e.type === "question"));
    w.clock.advance(WAIT);
    const [item] = inbox.latest().items as [InboxItem];
    expect(item.request).toMatchObject({ type: "question", id: "q1", questions: [COLOUR] });
    expect("card" in item).toBe(false);
  });

  it("lists a request that is already past the wait to a watcher that comes later", async () => {
    const w = world();
    const c = await w.chatCalling();
    await c.askApproval();
    await until(() => c.events.some((e) => e.type === "approval"));
    w.clock.advance(WAIT + 5 * MINUTE);
    expect(ids(w.watch().first)).toEqual([`${c.id}:t1`]);
  });

  it("uses each watcher's own wait, the setting the page sends", async () => {
    const w = world();
    const c = await w.chatCalling();
    const short = w.watch(MINUTE);
    const long = w.watch(30 * MINUTE);
    await c.askApproval();
    await until(() => c.events.some((e) => e.type === "approval"));
    w.clock.advance(MINUTE);
    expect(ids(short.latest())).toEqual([`${c.id}:t1`]);
    expect(long.pushes).toEqual([]);
    w.clock.advance(29 * MINUTE);
    expect(ids(long.latest())).toEqual([`${c.id}:t1`]);
  });

  it("follows a wait changed while requests are pending: the page watches again with the new one", async () => {
    const w = world();
    const c = await w.chatCalling();
    await c.askApproval();
    await until(() => c.events.some((e) => e.type === "approval"));
    const before = w.watch(30 * MINUTE);
    w.clock.advance(10 * MINUTE);
    expect(before.latest().items).toEqual([]);
    // Settings now says 5 minutes: the request has already waited longer, so it is in the Inbox at once.
    before.stop();
    const after = w.watch(5 * MINUTE);
    expect(ids(after.first)).toEqual([`${c.id}:t1`]);
    // And a longer wait takes it out again.
    after.stop();
    expect(w.watch(60 * MINUTE).first.items).toEqual([]);
  });

  it("keeps several chats' requests oldest first, and only the project's own", async () => {
    const w = world();
    const a = await w.chatCalling({ message: "first" });
    const b = await w.chatCalling({ message: "second" });
    const other = await w.chatCalling({ dir: "/home/me/other", message: "elsewhere" });
    await b.askApproval();
    await until(() => b.events.some((e) => e.type === "approval"));
    w.clock.advance(MINUTE);
    await a.askQuestion();
    await until(() => a.events.some((e) => e.type === "question"));
    w.clock.advance(MINUTE);
    await other.askApproval();
    await until(() => other.events.some((e) => e.type === "approval"));
    w.clock.advance(WAIT);
    const inbox = w.watch();
    expect(ids(inbox.first)).toEqual([`${b.id}:t1`, `${a.id}:q1`]);
    expect(ids(w.watch(WAIT, "/home/me/other").first)).toEqual([`${other.id}:t1`]);
  });

  it("shows the chat's name as it is now: a title the first message gave it after the request was asked is kept", async () => {
    const w = world();
    const c = await w.chatCalling({ message: "tidy the logs" });
    await c.askApproval();
    await until(() => c.events.some((e) => e.type === "approval"));
    w.clock.advance(WAIT);
    expect(w.watch().first.items[0]?.chatName).toBe("tidy the logs");
  });
});

describe("AC2: answering it in the Inbox or the chat answers it once and clears it from both", () => {
  it("clears the item when the chat's own approve answers it, and the agent is told once", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    const { answer } = await c.askApproval();
    w.clock.advance(WAIT);
    expect(ids(inbox.latest())).toEqual([`${c.id}:t1`]);
    // The Inbox answers through the same `approve` the chat does: there is no other way to decide.
    w.manager.approve(c.id, "t1", { choice: "allow" });
    expect(await answer).toEqual({ behavior: "allow", updatedInput: BASH });
    expect(inbox.latest().items).toEqual([]);
    expect(c.events.filter((e) => e.type === "tool-allowed")).toHaveLength(1);
    expect(() => w.manager.approve(c.id, "t1", { choice: "deny" })).toThrow(CHAT_MESSAGES.noRequest);
    expect(c.events.filter((e) => e.type === "tool-allowed" || e.type === "tool-denied")).toHaveLength(1);
  });

  it("clears a question when it is answered, and the chat shows it answered", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    const { answer } = await c.askQuestion();
    w.clock.advance(WAIT);
    expect(ids(inbox.latest())).toEqual([`${c.id}:q1`]);
    w.manager.answer(c.id, "q1", { [COLOUR.question]: ["Red"] });
    expect(await answer).toMatchObject({ behavior: "allow" });
    expect(inbox.latest().items).toEqual([]);
    expect(c.events.filter((e) => e.type === "question-answered")).toEqual([
      { type: "question-answered", id: "q1", answers: { [COLOUR.question]: ["Red"] } },
    ]);
    expect(() => w.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"] })).toThrow(CHAT_MESSAGES.noRequest);
  });

  it("clears only the answered request when a chat has two", async () => {
    const w = world();
    const c = await w.chatCalling();
    const inbox = w.watch();
    await c.askApproval("t1");
    await c.askApproval("t2");
    await until(() => c.events.filter((e) => e.type === "approval").length === 2);
    w.clock.advance(WAIT);
    expect(ids(inbox.latest())).toEqual([`${c.id}:t1`, `${c.id}:t2`]);
    w.manager.approve(c.id, "t1", { choice: "deny" });
    expect(ids(inbox.latest())).toEqual([`${c.id}:t2`]);
  });
});
