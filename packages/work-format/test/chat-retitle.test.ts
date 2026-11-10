/** STORY-49 AC2: a draft renames its chat to the feature's title, never over a name the user set. */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ROLES,
  CHAT_TITLE_MAX,
  chatName,
  newSummary,
  normalizeSummary,
  reduceSummary,
  retitle,
  type ChatSummary,
} from "../src/index.ts";

const role = BUILT_IN_ROLES.find((r) => r.id === "dev-lead")!;
const fresh = (): ChatSummary => newSummary("c1", "claude", role, "2026-11-10T09:00:00.000Z");
const first = reduceSummary(fresh(), { type: "user", text: "let's shape a feature" });

describe("retitle", () => {
  it("renames a chat that the first message named, to the feature's title", () => {
    expect(chatName(first)).toBe("let's shape a feature");
    const named = retitle(first, "Shaping", "draft");
    expect(chatName(named)).toBe("Shaping");
    expect(named.titleBy).toBe("draft");
  });

  it("renames a chat that has no message yet", () => {
    expect(chatName(retitle(fresh(), "Shaping", "draft"))).toBe("Shaping");
  });

  it("follows a revised draft's new title, and keeps the row when nothing changes", () => {
    const named = retitle(first, "Shaping", "draft");
    expect(chatName(retitle(named, "Shaping, v2", "draft"))).toBe("Shaping, v2");
    expect(retitle(named, "Shaping", "draft")).toBe(named);
  });

  it("is not renamed again by later messages", () => {
    const named = retitle(first, "Shaping", "draft");
    expect(chatName(reduceSummary(named, { type: "user", text: "another message" }))).toBe("Shaping");
  });

  it("never replaces a name the user set, whatever the draft says", () => {
    const mine = retitle(first, "My name", "user");
    expect(mine.titleBy).toBe("user");
    expect(retitle(mine, "Shaping", "draft")).toBe(mine);
    expect(chatName(retitle(retitle(first, "Shaping", "draft"), "My name", "user"))).toBe("My name");
  });

  it("cuts a long title as the chat list does, and ignores a blank one", () => {
    expect(chatName(retitle(first, "x".repeat(200), "draft")).length).toBe(CHAT_TITLE_MAX);
    expect(retitle(first, "   ", "draft")).toBe(first);
  });

  it("survives a save: the row reads back with who named it", () => {
    const named = retitle(first, "Shaping", "draft");
    expect(normalizeSummary(JSON.parse(JSON.stringify(named)))).toEqual(named);
    expect(normalizeSummary(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });
});
