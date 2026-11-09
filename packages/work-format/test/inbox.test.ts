/** STORY-7: which requests are due for the Inbox, the wait, and the protocol's reading of an Inbox. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INBOX_WAIT_MINUTES,
  dueItems,
  inboxParams,
  MAX_INBOX_WAIT_MINUTES,
  MIN_INBOX_WAIT_MINUTES,
  nextDueIn,
  normalizeInbox,
  normalizeInboxItem,
  normalizeWaitMinutes,
  waitMs,
  type InboxRequest,
  type PendingAsk,
} from "../src/index.ts";

const bash = (id: string): InboxRequest => ({
  type: "approval",
  id,
  name: "Bash",
  input: { command: "npm test" },
  forChat: true,
});
const ask = (chat: string, at: number, extra: Partial<PendingAsk> = {}): PendingAsk => ({
  chat,
  chatName: `chat ${chat}`,
  request: bash("t1"),
  at,
  ...extra,
});
const MINUTE = 60_000;

describe("the wait", () => {
  it("is 10 minutes unless Settings says another within a second and a day", () => {
    expect(DEFAULT_INBOX_WAIT_MINUTES).toBe(10);
    expect(normalizeWaitMinutes(undefined)).toBe(10);
    expect(normalizeWaitMinutes("5")).toBe(10);
    expect(normalizeWaitMinutes(Number.NaN)).toBe(10);
    expect(normalizeWaitMinutes(MIN_INBOX_WAIT_MINUTES / 2)).toBe(10);
    expect(normalizeWaitMinutes(MAX_INBOX_WAIT_MINUTES + 1)).toBe(10);
    expect(normalizeWaitMinutes(5)).toBe(5);
    expect(normalizeWaitMinutes(0.05)).toBe(0.05);
    expect(normalizeWaitMinutes(MIN_INBOX_WAIT_MINUTES)).toBe(MIN_INBOX_WAIT_MINUTES);
    expect(normalizeWaitMinutes(MAX_INBOX_WAIT_MINUTES)).toBe(MAX_INBOX_WAIT_MINUTES);
  });

  it("is sent in milliseconds", () => {
    expect(waitMs(10)).toBe(600_000);
    expect(waitMs(0.05)).toBe(3000);
  });
});

describe("dueItems", () => {
  it("lists a request once it has waited the whole wait, and not a moment before", () => {
    const pending = [ask("a", 1000)];
    expect(dueItems(pending, 10 * MINUTE, 1000 + 10 * MINUTE - 1)).toEqual([]);
    expect(dueItems(pending, 10 * MINUTE, 1000 + 10 * MINUTE)).toHaveLength(1);
  });

  it("gives the chat, its name and card, the request and when it was asked, and nothing more", () => {
    const [item] = dueItems([{ ...ask("a", 0, { card: "STORY-9" }), dir: "/secret" } as PendingAsk], 0, 0);
    expect(item).toEqual({
      chat: "a",
      chatName: "chat a",
      card: "STORY-9",
      request: bash("t1"),
      since: "1970-01-01T00:00:00.000Z",
    });
    expect(dueItems([ask("b", 0)], 0, 0)[0]).not.toHaveProperty("card");
  });

  it("puts the oldest first, and breaks a tie by chat", () => {
    const items = dueItems([ask("b", 5), ask("a", 5), ask("c", 1)], 0, 10);
    expect(items.map((i) => i.chat)).toEqual(["c", "a", "b"]);
  });
});

describe("nextDueIn", () => {
  it("is how long until the soonest request not yet due comes due", () => {
    const pending = [ask("a", 0), ask("b", 4 * MINUTE)];
    expect(nextDueIn(pending, 10 * MINUTE, 3 * MINUTE)).toBe(7 * MINUTE);
    expect(nextDueIn(pending, 10 * MINUTE, 10 * MINUTE)).toBe(4 * MINUTE);
  });

  it("is null when nothing is waiting to come due", () => {
    expect(nextDueIn([], MINUTE, 0)).toBeNull();
    expect(nextDueIn([ask("a", 0)], MINUTE, MINUTE)).toBeNull();
  });
});

describe("the protocol's reading", () => {
  it("takes { dir, waitMs } and nothing else", () => {
    expect(inboxParams({ dir: "/p", waitMs: 0 })).toEqual({ dir: "/p", waitMs: 0 });
    expect(inboxParams({ dir: "/p", waitMs: 3000, extra: 1 })).toEqual({ dir: "/p", waitMs: 3000 });
    for (const bad of [null, {}, { dir: "/p" }, { dir: "", waitMs: 1 }, { dir: "/p", waitMs: -1 }]) {
      expect(inboxParams(bad)).toBeNull();
    }
    expect(inboxParams({ dir: "/p", waitMs: Number.POSITIVE_INFINITY })).toBeNull();
    expect(inboxParams({ dir: "/p", waitMs: waitMs(MAX_INBOX_WAIT_MINUTES) + 1 })).toBeNull();
  });

  it("reads an item the server sends, and drops what isn't one", () => {
    const item = { chat: "a", chatName: "n", card: "STORY-9", request: bash("t1"), since: "2026-11-09T10:00:00Z" };
    expect(normalizeInboxItem(item)).toEqual(item);
    expect(normalizeInboxItem({ ...item, card: undefined })).not.toHaveProperty("card");
    expect(normalizeInboxItem({ ...item, request: { type: "text", block: "b", delta: "x" } })).toBeNull();
    expect(normalizeInboxItem({ ...item, chat: "" })).toBeNull();
    expect(normalizeInboxItem(null)).toBeNull();
    expect(normalizeInbox({ items: [item, { nope: 1 }] })).toEqual({ items: [item] });
    expect(normalizeInbox(undefined)).toEqual({ items: [] });
  });
});
