/** STORY-44 AC1: the chats Featra keeps in its app data, read back defensively. */
import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, newSummary, normalizeSavedChats, savedChat, type ChatSummary } from "../src/index.ts";

const QA = BUILT_IN_ROLES.find((r) => r.id === "qa")!;
const row = (id: string): ChatSummary => newSummary(id, "claude", QA, "2026-11-09T10:00:00.000Z");

describe("savedChat", () => {
  it("keeps the project, the session id and the row, and never saves a turn as running", () => {
    const running = { ...row("c1"), title: "hello", running: true };
    expect(savedChat("/p", "s-1", running)).toEqual({
      dir: "/p",
      session: "s-1",
      summary: { ...running, running: false },
    });
  });
});

describe("normalizeSavedChats", () => {
  it("reads a missing or malformed file as no chats", () => {
    for (const raw of [undefined, null, "x", { chats: "x" }, []])
      expect(normalizeSavedChats(raw)).toEqual({ version: 1, chats: [] });
  });

  it("drops an entry with no project or a malformed row, and reads a missing session as none", () => {
    const good = savedChat("/p", null, row("c1"));
    expect(
      normalizeSavedChats({
        chats: [
          good,
          { session: "s", summary: row("c2") },
          { dir: "/p", session: "s", summary: { ...row("c3"), provider: "nobody" } },
          { dir: "/p", session: "", summary: row("c4") },
        ],
      }),
    ).toEqual({ version: 1, chats: [good, savedChat("/p", null, row("c4"))] });
  });

  it("keeps the first of two chats with one id", () => {
    const first = savedChat("/p", "s-1", row("c1"));
    expect(normalizeSavedChats({ chats: [first, savedChat("/q", "s-2", row("c1"))] }).chats).toEqual([first]);
  });
});
