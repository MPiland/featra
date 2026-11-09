/**
 * STORY-7 review fixes: the Inbox hub itself (`createInbox`), with the chats it asks about and the clock faked. A request
 * the chat repeats, every open project in one watch, and timers that belong to one Inbox.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Inbox, InboxItem, InboxRequest } from "@featra/work-format";
import { createInbox, systemTimers, type ChatFacts } from "../src/inbox.ts";
import { manualClock, MINUTE } from "./manual-clock.ts";

const WAIT = 10 * MINUTE;
const approval = (id: string): InboxRequest => ({ type: "approval", id, name: "Bash", input: {}, forChat: true });

function hub(chats: Record<string, ChatFacts>) {
  const clock = manualClock();
  const inbox = createInbox({
    now: () => clock.now().getTime(),
    timers: clock.timers,
    chat: (id) => chats[id] ?? null,
    same: (a, b) => a === b,
    log: () => {},
  });
  return { clock, inbox };
}

const A: ChatFacts = { dir: "/a", chatName: "in a" };
const B: ChatFacts = { dir: "/b", chatName: "in b" };

describe("a request the chat opens again", () => {
  it("keeps the moment it was first asked, so it is due when the first ask was", () => {
    const { clock, inbox } = hub({ c: A });
    const pushes: Inbox[] = [];
    inbox.watch("/a", WAIT, (i) => pushes.push(i));
    inbox.opened("c", approval("t1"));
    clock.advance(6 * MINUTE);
    inbox.opened("c", approval("t1"));
    clock.advance(4 * MINUTE);
    expect(pushes.at(-1)?.items.map((i) => i.request.id)).toEqual(["t1"]);
  });

  it("does not tell the asked listeners again", () => {
    const { inbox } = hub({ c: A });
    const asked: InboxItem[] = [];
    inbox.watchAsked("/a", (i) => asked.push(i));
    inbox.opened("c", approval("t1"));
    inbox.opened("c", approval("t1"));
    inbox.opened("c", approval("t2"));
    expect(asked.map((i) => i.request.id)).toEqual(["t1", "t2"]);
  });
});

describe("every open project in one watch", () => {
  it("lists requests of all projects, each with its project, when no folder is given", () => {
    const { clock, inbox } = hub({ a: A, b: B });
    const watch = inbox.watch(null, WAIT, () => {});
    expect(watch.inbox.items).toEqual([]);
    inbox.opened("a", approval("t1"));
    clock.advance(MINUTE);
    inbox.opened("b", approval("t2"));
    clock.advance(WAIT);
    const now = inbox.watch(null, WAIT, () => {}).inbox;
    expect(now.items.map((i) => [i.chat, i.project])).toEqual([
      ["a", "/a"],
      ["b", "/b"],
    ]);
    expect(inbox.watch("/b", WAIT, () => {}).inbox.items.map((i) => i.chat)).toEqual(["b"]);
  });

  it("pushes to an all-projects watcher as requests come due and clear in either project", () => {
    const { clock, inbox } = hub({ a: A, b: B });
    const pushes: Inbox[] = [];
    inbox.watch(null, WAIT, (i) => pushes.push(i));
    inbox.opened("a", approval("t1"));
    inbox.opened("b", approval("t2"));
    clock.advance(WAIT);
    expect(pushes.at(-1)?.items).toHaveLength(2);
    inbox.keep("b", []);
    expect(pushes.at(-1)?.items.map((i) => i.chat)).toEqual(["a"]);
  });

  it("tells an all-projects asked listener of each project, with the project", () => {
    const { inbox } = hub({ a: A, b: B });
    const asked: InboxItem[] = [];
    inbox.watchAsked(null, (i) => asked.push(i));
    inbox.opened("a", approval("t1"));
    inbox.opened("b", approval("t2"));
    expect(asked.map((i) => [i.chat, i.project])).toEqual([
      ["a", "/a"],
      ["b", "/b"],
    ]);
  });
});

describe("timers", () => {
  afterEach(() => vi.useRealTimers());

  it("close clears every timer the Inbox set, including a stopped watcher's neighbours'", () => {
    const { clock, inbox } = hub({ a: A, b: B });
    inbox.opened("a", approval("t1"));
    inbox.watch("/a", WAIT, () => {});
    inbox.watch(null, 2 * WAIT, () => {});
    inbox.watch("/b", WAIT, () => {});
    expect(clock.timersSet()).toBe(2);
    inbox.close();
    expect(clock.timersSet()).toBe(0);
  });

  it("system timers belong to the instance: another instance's clear can't cancel them", () => {
    vi.useFakeTimers();
    const one = systemTimers();
    const two = systemTimers();
    const ran: string[] = [];
    one.set(() => ran.push("one"), 10);
    two.clear(1);
    vi.advanceTimersByTime(20);
    expect(ran).toEqual(["one"]);
  });
});
