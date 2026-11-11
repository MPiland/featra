/** STORY-9 AC4: where the sidebar puts a story session. */
import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, nestChats, newSummary, type ChatSummary } from "../src/index.ts";

const DEV = BUILT_IN_ROLES.find((r) => r.id === "developer")!;
const lead = (id: string): ChatSummary => newSummary(id, "claude", DEV, "2026-11-09T10:00:00.000Z");
const session = (id: string, story: string, parent: string | null, feature = "FEAT-2"): ChatSummary =>
  newSummary(id, "claude", DEV, "2026-11-09T10:00:00.000Z", story, {
    id: story,
    parent,
    feature,
    featureTitle: "Delegation",
  });

describe("nestChats", () => {
  it("nests a session under its Dev Lead's chat while that chat is listed, in the order given", () => {
    const nested = nestChats([
      lead("lead"),
      lead("other"),
      session("s1", "STORY-5", "lead"),
      session("s2", "STORY-6", "lead"),
    ]);
    expect(nested.branches.map((b) => [b.chat.id, b.children.map((c) => c.id)])).toEqual([
      ["lead", ["s1", "s2"]],
      ["other", []],
    ]);
    expect(nested.groups).toEqual([]);
  });

  it("puts sessions whose chat is gone, or that had none, in one group named after their feature", () => {
    const nested = nestChats([
      lead("a"),
      session("s1", "STORY-5", "gone"),
      session("s2", "STORY-6", null),
      session("s3", "STORY-9", "a", "FEAT-3"),
    ]);
    expect(nested.groups).toEqual([
      {
        feature: "FEAT-2",
        title: "Delegation",
        sessions: [expect.objectContaining({ id: "s1" }), expect.objectContaining({ id: "s2" })],
      },
    ]);
    expect(nested.branches.map((b) => [b.chat.id, b.children.map((c) => c.id)])).toEqual([["a", ["s3"]]]);
  });

  it("keeps a plain chat's place and never nests a session under itself", () => {
    const nested = nestChats([session("s1", "STORY-5", "s1")]);
    expect(nested.branches).toEqual([]);
    expect(nested.groups.map((g) => g.sessions.map((c) => c.id))).toEqual([["s1"]]);
  });
});
