/**
 * STORY-10: the rules of what an agent may write to a card, on real work-format code. Pure: no files, no server.
 */
import { describe, expect, it } from "vitest";
import {
  applyReport,
  DRAFTED_BY,
  evidenceFolder,
  evidenceLinkError,
  evidenceState,
  parseCard,
  parseReportInput,
  reportAuthError,
  reportStageError,
  serializeCard,
  stageCeiling,
  type Card,
  type ReportInput,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const BY = "session:chat-1";
const FOLDER = ".featra/evidence/FEAT-5/STORY-10/";

const work = (): Card => ({
  ...moves(story("STORY-10", "FEAT-5"), [1, "In Progress"]),
  acs: [
    { text: "First works", done: false, test: null },
    { text: "Second works", done: false, test: "t.test.ts" },
  ],
  tasks: [
    { text: "Write it", done: false },
    { text: "Test it", done: false },
  ],
  notes: "- 2026-11-10 (dev-lead): Shaped.",
});

const apply = (input: ReportInput, card = work()) =>
  applyReport(card, input, { config }, BY, at(5), "Developer chat 1a2b");
const ok = (input: ReportInput, card = work()) => {
  const r = apply(input, card);
  if (!r.ok) throw new Error(r.error);
  return r;
};
const refused = (input: ReportInput, card = work()) => {
  const r = apply(input, card);
  if (r.ok) throw new Error("Expected a refusal.");
  return r.error;
};

describe("the stage a report may move to", () => {
  it("is forward only, up to the last stage before Done", () => {
    expect(stageCeiling(config)).toBe("Acceptance");
    expect(ok({ stage: "In Review" }).card.status).toBe("In Review");
    expect(ok({ stage: "acceptance" }).card.status).toBe("Acceptance");
    expect(ok({ stage: "Acceptance" }).card.history.at(-1)).toMatchObject({
      field: "status",
      from: "In Progress",
      to: "Acceptance",
      by: BY,
    });
  });

  it.each(["Done", "done", "Cancelled", "Blocked", "New"])("refuses %s, and writes nothing", (stage) => {
    expect(apply({ stage }).ok).toBe(false);
  });

  it("says why Done is refused, and that it is the user's", () => {
    expect(reportStageError(work(), "Done", config)).toBe(
      "Only the user moves STORY-10 to Done, once it is verified and accepted; move it to Acceptance.",
    );
  });

  it("refuses a move back, and a card that is Cancelled", () => {
    expect(refused({ stage: "Ready" })).toBe("STORY-10 is In Progress: a report only moves a story forward.");
    expect(refused({ stage: "In Review" }, { ...work(), status: "Cancelled" })).toBe(
      "STORY-10 is Cancelled, which a report can't move.",
    );
  });

  it("follows the project's stages: the ceiling is the stage before the first done one", () => {
    const custom = {
      ...config,
      stages: [
        ...config.stages.slice(0, 3),
        { name: "QA", category: "active" as const },
        { name: "Shipped", category: "done" as const },
      ],
    };
    expect(stageCeiling(custom)).toBe("QA");
    expect(reportStageError(work(), "Shipped", custom)).toContain("Only the user");
    expect(reportStageError(work(), "QA", custom)).toBeNull();
  });
});

describe("ticks, new tasks and notes", () => {
  it("ticks tasks and criteria by their text, adds tasks, and appends a signed note", () => {
    const r = ok({
      tasks: ["write it"],
      addTasks: ["Check the paths", "test it"],
      criteria: [{ criterion: "First works" }],
      note: "Paths are checked.",
    });
    expect(r.card.tasks).toEqual([
      { text: "Write it", done: true },
      { text: "Test it", done: false },
      { text: "Check the paths", done: false },
    ]);
    expect(r.card.acs.map((a) => a.done)).toEqual([true, false]);
    expect(r.card.notes).toBe(
      "- 2026-11-10 (dev-lead): Shaped.\n- 2026-11-01 (Developer chat 1a2b): Paths are checked.",
    );
    expect(r.changes).toEqual(["ticked 1 task", "added 1 task", "ticked 1 criterion", "added a note"]);
  });

  it("records one report event by the session, naming what changed", () => {
    const r = ok({ tasks: ["Write it"], note: "Done." });
    // Review item 3: the event records the delta only, never a before-snapshot of the card.
    const event = r.card.history.at(-1);
    expect(event).toMatchObject({ field: "report", from: null, by: BY, at: at(5) });
    expect(JSON.parse(event?.to ?? "")).toEqual({ tasks: ["Write it"], note: "Done." });
  });

  it("changes nothing, and records nothing, when everything is already so", () => {
    const done = ok({ tasks: ["Write it"] }).card;
    const again = ok({ tasks: ["Write it"], addTasks: ["Write it"], stage: "In Progress" }, done);
    expect(again.changes).toEqual([]);
    expect(again.card).toEqual(done);
  });

  it("refuses a task or criterion the card doesn't have, naming the ones it has", () => {
    // Review nit: the error says how text is matched and the length limit.
    expect(refused({ tasks: ["Fly"] })).toBe(
      'No task reads "Fly" (case and spacing don\'t matter; at most 300 characters). It has: "Write it"; "Test it".',
    );
    expect(refused({ criteria: [{ criterion: "Third" }] })).toContain('No criterion reads "Third"');
  });

  it("writes nothing when any part is refused (the stage is Done, the task is real)", () => {
    expect(apply({ stage: "Done", tasks: ["Write it"] }).ok).toBe(false);
  });

  it("never unticks, and cannot touch the title, the description, the PR or any other field", () => {
    const done = ok({ tasks: ["Write it"], criteria: [{ criterion: "First works" }] }).card;
    const r = ok({ addTasks: ["More"] }, done);
    expect(r.card).toMatchObject({
      title: done.title,
      description: done.description,
      pr: done.pr,
      parent: done.parent,
    });
    expect(r.card.tasks[0]?.done).toBe(true);
    expect(r.card.acs[0]?.done).toBe(true);
  });

  it("only updates a story or a bug", () => {
    expect(refused({ note: "x" }, feature("FEAT-5"))).toBe("FEAT-5 isn't a story or a bug.");
  });

  it("survives the card file as written", () => {
    const r = ok({
      tasks: ["Write it"],
      addTasks: ["Check"],
      criteria: [{ criterion: "First works", evidence: `${FOLDER}a.png` }],
      note: "Hi.",
    });
    expect(parseCard(serializeCard(r.card))).toEqual(r.card);
  });
});

describe("Reported", () => {
  it("is what an agent's report makes the card, until someone else moves it", () => {
    expect(evidenceState(work()).reported).toBe(false);
    const r = ok({ tasks: ["Write it"] }).card;
    expect(evidenceState(r)).toMatchObject({ reported: true, verified: false, proven: false, accepted: false });
    const user = {
      ...r,
      history: [
        ...r.history,
        { at: at(9), field: "status" as const, from: "In Progress", to: "In Review", by: "user" },
      ],
    };
    expect(evidenceState(user).reported).toBe(false);
  });

  it("is never Proven, Verified or Accepted, whatever the agent writes", () => {
    const r = ok({
      stage: "Acceptance",
      tasks: ["Write it", "Test it"],
      criteria: [{ criterion: "First works" }, { criterion: "Second works" }],
    }).card;
    expect(evidenceState(r)).toMatchObject({
      reported: true,
      verified: false,
      provenAcs: [],
      proven: false,
      accepted: false,
    });
  });
});

const link = (path: string) => evidenceLinkError({ id: "STORY-10", parent: "FEAT-5" }, path);

describe("evidence", () => {
  it("lives in .featra/evidence/FEAT-N/STORY-M/", () => {
    expect(evidenceFolder({ id: "STORY-10", parent: "FEAT-5" })).toBe(FOLDER);
    expect(evidenceFolder({ id: "STORY-10", parent: null })).toBeNull();
  });

  it("links a file inside the folder, on its AC, and the card links the folder", () => {
    const r = ok({ criteria: [{ criterion: "second works", evidence: `${FOLDER}second.png` }] });
    expect(r.card.acs[1]).toEqual({
      text: "Second works",
      done: true,
      test: "t.test.ts",
      evidence: `${FOLDER}second.png`,
    });
    expect(r.card.extra.evidence).toBe(FOLDER);
    expect(r.links).toEqual([`${FOLDER}second.png`]);
    expect(r.changes).toEqual(["ticked 1 criterion", "linked 1 evidence file"]);
    expect(serializeCard(r.card)).toContain(`- [x] Second works (test: t.test.ts) (evidence: ${FOLDER}second.png)`);
  });

  it("replaces an AC's link, so a criterion holds one", () => {
    const first = ok({ criteria: [{ criterion: "First works", evidence: `${FOLDER}a.png` }] }).card;
    const second = ok({ criteria: [{ criterion: "First works", evidence: `${FOLDER}b.png` }] }, first);
    expect(second.card.acs[0]?.evidence).toBe(`${FOLDER}b.png`);
  });

  it.each([
    ["outside the folder", ".featra/evidence/FEAT-5/STORY-11/a.png"],
    ["another feature", ".featra/evidence/FEAT-6/STORY-10/a.png"],
    ["elsewhere in the repository", "docs/a.png"],
    ["a traversal out of it", `${FOLDER}../STORY-11/a.png`],
    ["a traversal that returns", `${FOLDER}../STORY-10/a.png`],
    ["a dot part", `${FOLDER}./a.png`],
    ["a hidden file", `${FOLDER}.secret`],
    ["an empty part", `${FOLDER}x//a.png`],
    ["the folder itself", FOLDER],
    ["an absolute path", `/${FOLDER}a.png`],
    ["a Windows path", `.featra\\evidence\\FEAT-5\\STORY-10\\a.png`],
    ["a drive path", `C:/${FOLDER}a.png`],
    ["the folder as a prefix of another name", ".featra/evidence/FEAT-5/STORY-100/a.png"],
    ["a space or bracket", `${FOLDER}a b(1).png`],
  ])("refuses a link %s", (_name, path) => {
    expect(link(path)).not.toBeNull();
    expect(apply({ criteria: [{ criterion: "First works", evidence: path }] }).ok).toBe(false);
  });

  it("refuses evidence for a card with no feature", () => {
    expect(evidenceLinkError({ id: "STORY-10", parent: null }, `${FOLDER}a.png`)).toBe(
      "STORY-10 has no feature, so it has no evidence folder.",
    );
  });
});

describe("who may update which card", () => {
  const cards = [
    { ...feature("FEAT-5", "active"), extra: { [DRAFTED_BY]: "lead" } },
    feature("FEAT-6", "active"),
    story("STORY-10", "FEAT-5"),
    story("STORY-11", "FEAT-5"),
    story("STORY-12", "FEAT-6"),
  ];

  it("lets a story session update its own card", () => {
    expect(reportAuthError({ chat: "s10", story: "STORY-10" }, "STORY-10", cards)).toBeNull();
  });

  it("refuses a story session any other card, even a sibling, in one sentence", () => {
    expect(reportAuthError({ chat: "s10", story: "STORY-10" }, "STORY-11", cards)).toBe(
      "A story session can update only its own card, STORY-10.",
    );
    expect(reportAuthError({ chat: "s10", story: "STORY-10" }, "FEAT-5", cards)).not.toBeNull();
  });

  it("lets the Dev Lead of the feature update the stories in it", () => {
    for (const id of ["STORY-10", "STORY-11"])
      expect(reportAuthError({ chat: "lead", story: null }, id, cards)).toBeNull();
  });

  it("refuses the Dev Lead a card of another feature, and the feature's own card", () => {
    expect(reportAuthError({ chat: "lead", story: null }, "STORY-12", cards)).toBe(
      "STORY-12 isn't yours to update: only its own story session and its feature's Dev Lead can.",
    );
    expect(reportAuthError({ chat: "lead", story: null }, "FEAT-5", cards)).not.toBeNull();
  });

  it("refuses any other chat", () => {
    expect(reportAuthError({ chat: "other", story: null }, "STORY-10", cards)).toContain("isn't yours to update");
  });

  it("refuses a card that isn't there", () => {
    expect(reportAuthError({ chat: "lead", story: null }, "STORY-99", cards)).toBe("That card is gone.");
  });

  it("refuses the Dev Lead while its feature is a draft awaiting review", () => {
    const draft = [{ ...feature("FEAT-5", "draft"), extra: { [DRAFTED_BY]: "lead" } }, story("STORY-10", "FEAT-5")];
    expect(reportAuthError({ chat: "lead", story: null }, "STORY-10", draft)).toBe(
      "FEAT-5 is still a draft: revise it with draft_cards.",
    );
  });
});

describe("the call's input", () => {
  it("is trimmed, and the card id is upper-cased", () => {
    expect(parseReportInput({ card: " story-10 ", stage: " In Review ", tasks: [" a  b "], note: "x\ny" })).toEqual({
      ok: true,
      value: { card: "STORY-10", stage: "In Review", tasks: ["a b"], note: "x y" },
    });
  });

  it("asks for something to update", () => {
    expect(parseReportInput({})).toEqual({
      ok: false,
      error: "Say what to update: stage, tasks, addTasks, criteria or note.",
    });
    expect(parseReportInput({ card: "STORY-10" }).ok).toBe(false);
  });

  it.each([
    ["a task that isn't text", { tasks: [1] }],
    ["tasks that aren't a list", { tasks: "a" }],
    ["too long a text", { addTasks: ["x".repeat(301)] }],
    ["too many new tasks", { addTasks: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ["a criterion without text", { criteria: [{ evidence: "a" }] }],
    ["a criterion that isn't an object", { criteria: ["a"] }],
    ["a note over the limit", { note: "x".repeat(1001) }],
    ["a card that isn't an id", { card: "soon", note: "x" }],
  ])("refuses %s", (_name, input) => {
    expect(parseReportInput(input).ok).toBe(false);
  });
});
