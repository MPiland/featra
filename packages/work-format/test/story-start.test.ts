/** STORY-9: the pure rules of starting a story's agent (naming, refusals, the card as started, the first message). */
import { describe, expect, it } from "vitest";
import {
  IN_PROGRESS,
  isStartable,
  itemIdOfBranch,
  notSpawnableReason,
  parseSpawnInput,
  spawner,
  startedStory,
  storyBranchName,
  storyFirstMessage,
  storyFolderName,
} from "../src/index.ts";
import { at, feature, story } from "./fixtures.ts";

const card = {
  ...story("STORY-9", "FEAT-5", { status: "Ready" }),
  title: "Spawn a story agent",
  description: "Do it.",
};
const active = feature("FEAT-5");

describe("names", () => {
  it("are the story's id and title in the folder, and a branch that maps back to the story", () => {
    expect(storyFolderName(card)).toBe("STORY-9-spawn-a-story-agent");
    expect(storyBranchName(card)).toBe("featra/story-9-spawn-a-story-agent");
    expect(itemIdOfBranch(storyBranchName(card))).toBe("STORY-9");
  });

  it("are built from the parsed number, never the raw id, so no id names a path outside the folder", () => {
    const evil = { ...card, id: "STORY-9/../../evil" };
    expect(storyFolderName(evil)).toBe("STORY-0-spawn-a-story-agent");
    expect(storyFolderName({ ...card, id: "..\\..\\x" })).not.toMatch(/[\\/.]/);
  });

  it("fall back to the id alone when the title has no letters or digits", () => {
    const bare = { ...card, title: "!!!" };
    expect(storyFolderName(bare)).toBe("STORY-9");
    expect(storyBranchName(bare)).toBe("featra/story-9");
  });
});

describe("notSpawnableReason", () => {
  it("is null for a New or Ready story of a started feature", () => {
    expect(notSpawnableReason(card, active, "feature/5-x", "STORY-9")).toBeNull();
    expect(notSpawnableReason({ ...card, status: "New" }, active, "feature/5-x", "STORY-9")).toBeNull();
  });

  it.each([
    ["a gone card", undefined, active, "feature/5-x", "That card is gone."],
    ["a card that isn't a story", feature("FEAT-6"), active, "feature/5-x", "STORY-9 isn't a story."],
    ["an id that isn't a STORY id", { ...card, id: "../evil" }, active, "feature/5-x", "STORY-9 isn't a story."],
    [
      "a story already started",
      { ...card, status: IN_PROGRESS },
      active,
      "feature/5-x",
      "STORY-9 is already In Progress.",
    ],
    ["a story with no feature", card, undefined, null, "STORY-9 has no feature to start it under."],
    [
      "a feature not started",
      card,
      { ...active, status: "approved" },
      null,
      "FEAT-5 isn't started yet. Start it first.",
    ],
    ["an active feature whose branch is gone", card, active, null, "FEAT-5 isn't started yet. Start it first."],
  ])("refuses %s in one sentence", (_name, subject, parent, branch, why) => {
    expect(notSpawnableReason(subject, parent, branch, "STORY-9")).toBe(why);
  });
});

describe("startedStory", () => {
  it("moves to In Progress with the starter and time, and records agent, model, reasoning, session and branch", () => {
    const started = startedStory(
      card,
      {
        agent: "claude",
        role: "developer",
        model: "opus",
        reasoning: "high",
        session: "c1",
        branch: "featra/story-9-x",
      },
      spawner("lead"),
      at(30),
    );
    expect(started).toMatchObject({
      status: IN_PROGRESS,
      agent: "claude",
      role: "developer",
      model: "opus",
      reasoning: "high",
      sessions: ["c1"],
      branch: "featra/story-9-x",
    });
    expect(started.history.at(-1)).toMatchObject({ from: "Ready", to: IN_PROGRESS, by: "session:lead", at: at(30) });
    expect(spawner(null)).toBe("user");
  });

  it("lists a session once however many times it starts", () => {
    const start = { agent: "a", role: "r0", model: "m", reasoning: "r", session: "c1", branch: "b" };
    const again = startedStory({ ...card, sessions: ["c1"] }, start, "user", at(1));
    expect(again.sessions).toEqual(["c1"]);
  });
});

describe("storyFirstMessage", () => {
  const input = { card, branch: "featra/story-9-x", worktree: "/w/STORY-9" };

  it("has the card, branch, worktree and the pointers, in that order; the role's prompt is the system prompt, not here", () => {
    const text = storyFirstMessage(input);
    const order = [
      'STORY-9, "Spawn a story agent"',
      "Do it.",
      "Branch: featra/story-9-x",
      "Worktree: /w/STORY-9",
      "CONTEXT.md",
      "decisions.md",
    ].map((s) => text.indexOf(s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
    expect(text).not.toContain("Brief from the Dev Lead");
  });

  it("ends with the Dev Lead's brief when there is one", () => {
    expect(
      storyFirstMessage({ ...input, brief: " Mind the paths. " }).endsWith("Brief from the Dev Lead:\nMind the paths."),
    ).toBe(true);
    expect(storyFirstMessage({ ...input, brief: "  " })).not.toContain("Brief from the Dev Lead");
  });
});

describe("parseSpawnInput", () => {
  it("takes a story id in any case, leaves the role to the caller's default, and keeps what was given", () => {
    expect(parseSpawnInput({ story: " story-9 " })).toEqual({ ok: true, value: { story: "STORY-9" } });
    expect(parseSpawnInput({ story: "STORY-9", role: "tester", model: "m", effort: "e", brief: "b" })).toEqual({
      ok: true,
      value: { story: "STORY-9", role: "tester", model: "m", effort: "e", brief: "b" },
    });
  });

  it.each([[null], [{}], [{ story: "FEAT-1" }], [{ story: 9 }]])("refuses %j in one sentence", (input) => {
    expect(parseSpawnInput(input)).toEqual({ ok: false, error: "Give the story's id, such as STORY-9, as `story`." });
  });
});

describe("isStartable", () => {
  it("is true for New and Ready only", () => {
    expect(["New", "Ready"].every(isStartable)).toBe(true);
    expect(["In Progress", "In Review", "Done", "Rejected"].some(isStartable)).toBe(false);
  });
});
