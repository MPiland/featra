/** STORY-21: a chat's row folded from its log, the waiting rule, and the list grouped by provider. */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ROLES,
  CHAT_TITLE_MAX,
  chatName,
  chatTitle,
  groupChats,
  newSummary,
  nextWait,
  normalizeChatList,
  parsePush,
  reduceSummary,
  SERVER_METHODS,
  type ChatEvent,
  type ChatSummary,
  type ProviderInfo,
} from "../src/index.ts";

const DEVELOPER = BUILT_IN_ROLES.find((r) => r.id === "developer")!;
const CLAUDE: ProviderInfo = { id: "claude", name: "Claude Code", installed: true };
const row = (id: string, startedAt: string): ChatSummary => newSummary(id, "claude", DEVELOPER, startedAt);
const fold = (events: ChatEvent[], start = row("c1", "2026-11-09T10:00:00.000Z")) =>
  events.reduce(reduceSummary, start);
const done: ChatEvent = { type: "turn-end", outcome: "done" };

describe("AC1: New chat starts a plain chat", () => {
  it("is a row of its own, named by its role until the first message, with no card or feature", () => {
    const summary = row("c1", "2026-11-09T10:00:00.000Z");
    expect(summary).toEqual({
      id: "c1",
      provider: "claude",
      role: { id: "developer", name: "Developer", model: DEVELOPER.model, effort: DEVELOPER.effort },
      title: null,
      startedAt: "2026-11-09T10:00:00.000Z",
      running: false,
      waiting: null,
    });
    expect(chatName(summary)).toBe("Developer");
  });

  it("takes its title from the first line of the first message; later messages don't rename it", () => {
    const summary = fold([
      { type: "user", text: "\n  Fix the login bug  \nIt fails on Windows." },
      done,
      { type: "user", text: "Now the tests" },
    ]);
    expect(summary.title).toBe("Fix the login bug");
    expect(chatName(summary)).toBe("Fix the login bug");
  });

  it("cuts a long title to the limit with an ellipsis", () => {
    const long = "word ".repeat(30);
    const title = chatTitle(long)!;
    expect(title.length).toBeLessThanOrEqual(CHAT_TITLE_MAX);
    expect(title.endsWith("…")).toBe(true);
    expect(chatTitle("short")).toBe("short");
    expect(chatTitle(" \n ")).toBeNull();
  });
});

describe("AC3: a chat waiting on the user", () => {
  it("waits for a reply once the agent's turn ends, and not while the turn runs", () => {
    const running = fold([
      { type: "user", text: "hello" },
      { type: "text", block: "m:0", delta: "Hi" },
    ]);
    expect(running).toMatchObject({ running: true, waiting: null });
    expect(reduceSummary(running, done)).toMatchObject({ running: false, waiting: "reply" });
  });

  it("waits after a failed turn too: the user has to act", () => {
    expect(
      fold([
        { type: "user", text: "hello" },
        { type: "turn-end", outcome: "failed" },
      ]).waiting,
    ).toBe("reply");
  });

  it("doesn't wait after the user stopped the turn: the user is the one who acted", () => {
    expect(
      fold([
        { type: "user", text: "hello" },
        { type: "turn-end", outcome: "stopped" },
      ]).waiting,
    ).toBeNull();
  });

  it("stops waiting when the user sends the next message", () => {
    expect(fold([{ type: "user", text: "a" }, done, { type: "user", text: "b" }]).waiting).toBeNull();
  });

  it("is a new chat's state only after a turn: a chat nobody has written in isn't waiting", () => {
    expect(row("c1", "2026-11-09T10:00:00.000Z").waiting).toBeNull();
    expect(nextWait(null, { type: "started", model: "sonnet" })).toBeNull();
    expect(nextWait("reply", { type: "tool", id: "t", name: "Read", input: {} })).toBe("reply");
  });

  it("leaves the row as it was for an event that changes nothing in it, so a streamed reply pushes no list", () => {
    const running = fold([{ type: "user", text: "hello" }]);
    expect(reduceSummary(running, { type: "text", block: "m:0", delta: "Hi" })).toBe(running);
    expect(reduceSummary(running, { type: "started", model: "sonnet" })).toBe(running);
  });
});

describe("AC2: chats grouped by provider, built from the providers the user has installed", () => {
  it("has one group per installed provider, even before it has chats, newest chat first", () => {
    const groups = groupChats({
      providers: [CLAUDE],
      chats: [row("a", "2026-11-09T10:00:00.000Z"), row("b", "2026-11-09T11:00:00.000Z")],
    });
    expect(groups.map((g) => [g.provider.name, g.chats.map((c) => c.id)])).toEqual([["Claude Code", ["b", "a"]]]);
    expect(groupChats({ providers: [CLAUDE], chats: [] })).toEqual([{ provider: CLAUDE, chats: [] }]);
  });

  it("leaves out a provider that isn't installed, unless it still has chats", () => {
    const missing = { ...CLAUDE, installed: false };
    expect(groupChats({ providers: [missing], chats: [] })).toEqual([]);
    const chats = [row("a", "2026-11-09T10:00:00.000Z")];
    expect(groupChats({ providers: [missing], chats })).toEqual([{ provider: missing, chats }]);
  });

  it("puts each chat in its own provider's group, in the order the server lists providers", () => {
    const other = { ...CLAUDE, name: "Second" };
    const groups = groupChats({ providers: [CLAUDE, other], chats: [row("a", "2026-11-09T10:00:00.000Z")] });
    expect(groups.map((g) => g.provider.name)).toEqual(["Claude Code", "Second"]);
    expect(groups[0]!.chats.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("chat.list on the wire", () => {
  it("is a method and a push", () => {
    expect(SERVER_METHODS).toContain("chat.list");
    expect(parsePush(JSON.stringify({ event: "chat.list", watch: 3, data: {} }))).toEqual({
      event: "chat.list",
      watch: 3,
      data: {},
    });
  });

  it("reads a list and drops what is malformed in it", () => {
    const good = fold([{ type: "user", text: "hello" }, done]);
    const list = normalizeChatList({
      providers: [CLAUDE, { id: "codex", name: "Codex", installed: true }, { id: "claude" }],
      chats: [good, { ...good, id: "" }, { ...good, waiting: "maybe" }, { ...good, role: null }, "nonsense"],
    });
    expect(list.providers).toEqual([CLAUDE]);
    expect(list.chats).toEqual([good, { ...good, waiting: null }]);
    expect(normalizeChatList(null)).toEqual({ providers: [], chats: [] });
    expect(normalizeChatList({ providers: [{ ...CLAUDE, installed: "yes" }] }).providers).toEqual([
      { ...CLAUDE, installed: false },
    ]);
  });
});
