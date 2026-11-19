/** STORY-66: what counts as a waiting agent and a review, and what the switcher's dot says, over the real rules. */
import { describe, expect, it } from "vitest";
import {
  buildWorkList,
  DRAFTED_BY,
  EMPTY_NEEDS,
  hasReview,
  MAIN,
  needsOf,
  needsYou,
  normalizeNeeds,
  othersNeedingYou,
  recordAcceptance,
  waitingAgents,
  type Card,
  type InboxItem,
  type InboxRequest,
  type NeedsList,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const approval = (id: string): InboxRequest => ({ type: "approval", id, name: "Bash", input: {}, forChat: true });
const question = (id: string): InboxRequest => ({ type: "question", id, name: "AskUserQuestion", questions: [] });
const item = (chat: string, request: InboxRequest): InboxItem => ({ chat, chatName: chat, request, since: at(0) });

const listOf = (...cards: Card[]) =>
  buildWorkList(
    {
      cards: cards.map((card) => ({ card, owner: MAIN, shownFrom: MAIN, path: `.featra/cards/${card.id}.md` })),
      stale: [],
      problems: [],
    },
    config,
  );
const drafted = (c: Card): Card => ({ ...c, extra: { ...c.extra, [DRAFTED_BY]: "chat-1" } });
const atAcceptance = () => moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, "In Review"], [3, "Acceptance"]);

describe("AC1: waitingAgents counts the agents waiting on the user, not their requests", () => {
  it("counts an agent waiting on a tool approval", () => {
    expect(waitingAgents([item("a", approval("t1"))])).toBe(1);
  });

  it("counts an agent waiting on an answer to its question", () => {
    expect(waitingAgents([item("a", question("q1"))])).toBe(1);
  });

  it("counts an agent with several requests open once", () => {
    expect(waitingAgents([item("a", approval("t1")), item("a", approval("t2")), item("a", question("q1"))])).toBe(1);
  });

  it("counts each agent with a request open", () => {
    expect(waitingAgents([item("a", approval("t1")), item("b", question("q1")), item("a", approval("t2"))])).toBe(2);
  });

  it("counts nothing when no request is open, as after a finished turn", () => {
    expect(waitingAgents([])).toBe(0);
  });
});

describe("AC2: hasReview marks a draft feature to review or a story at Acceptance", () => {
  it("marks a draft feature an agent drafted for the user", () => {
    expect(hasReview(listOf(drafted(feature("FEAT-1", "draft", null))))).toBe(true);
  });

  it("doesn't mark a draft the user wrote, nor one already approved", () => {
    expect(hasReview(listOf(feature("FEAT-1", "draft", null)))).toBe(false);
    expect(hasReview(listOf(drafted(feature("FEAT-1", "approved", null))))).toBe(false);
  });

  it("marks a story waiting at Acceptance", () => {
    expect(hasReview(listOf(feature("FEAT-1", "active", null), atAcceptance()))).toBe(true);
  });

  it("doesn't mark a story the user has accepted, nor one still in review", () => {
    const accepted = recordAcceptance(atAcceptance(), true, "user", at(4));
    expect(hasReview(listOf(feature("FEAT-1", "active", null), accepted))).toBe(false);
    const inReview = moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, "In Review"]);
    expect(hasReview(listOf(feature("FEAT-1", "active", null), inReview))).toBe(false);
  });

  it("marks a story at Acceptance under an epic, and stays quiet for an empty project", () => {
    const epicFeature = feature("FEAT-1", "active", "EPIC-1");
    const epic = { ...feature("EPIC-1", "active", null), type: "epic" as const };
    expect(hasReview(listOf(epic, epicFeature, atAcceptance()))).toBe(true);
    expect(hasReview(listOf())).toBe(false);
  });
});

describe("AC3: othersNeedingYou counts the other projects the closed switcher's dot is for", () => {
  const needs: NeedsList = {
    projects: [
      { dir: "/a", waiting: 1, review: false },
      { dir: "/b", waiting: 0, review: true },
      { dir: "/c", waiting: 0, review: false },
    ],
  };

  it("shows for another project's waiting agents or reviews", () => {
    expect(othersNeedingYou(needs, "/c")).toBe(2);
    expect(othersNeedingYou({ projects: [needs.projects[1]!, needs.projects[2]!] }, "/c")).toBe(1);
  });

  it("doesn't show for the current project's own", () => {
    expect(othersNeedingYou({ projects: [needs.projects[0]!, needs.projects[2]!] }, "/a")).toBe(0);
    expect(othersNeedingYou({ projects: [needs.projects[1]!] }, "/b")).toBe(0);
    expect(othersNeedingYou(EMPTY_NEEDS, undefined)).toBe(0);
  });

  it("finds a project's needs by its folder, and whether it needs the user at all", () => {
    expect(needsOf(needs, "/b")).toEqual({ dir: "/b", waiting: 0, review: true });
    expect(needsOf(needs, "/z")).toBeUndefined();
    expect(needsOf(needs, undefined)).toBeUndefined();
    expect(needs.projects.map(needsYou)).toEqual([true, true, false]);
  });
});

describe("normalizeNeeds", () => {
  it("keeps well-formed projects and drops or repairs the rest", () => {
    expect(
      normalizeNeeds({
        projects: [
          { dir: "/a", waiting: 2, review: true },
          { dir: "/b", waiting: -1, review: "yes" },
          { dir: "/c", waiting: 1.5 },
          { dir: "", waiting: 1 },
          "junk",
        ],
      }),
    ).toEqual({
      projects: [
        { dir: "/a", waiting: 2, review: true },
        { dir: "/b", waiting: 0, review: false },
        { dir: "/c", waiting: 0, review: false },
      ],
    });
    expect(normalizeNeeds(null)).toEqual(EMPTY_NEEDS);
  });
});
