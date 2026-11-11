/**
 * STORY-10 review: a report refused on a closed card or past the ceiling, the delta-only history, ticks that name the
 * same criterion, signed notes, and the Dev Lead scope. Real work-format code; pure.
 */
import { describe, expect, it } from "vitest";
import {
  applyReport,
  DRAFTED_BY,
  reportAuthError,
  reportStageError,
  type Card,
  type ReportInput,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const BY = "session:chat-1";
const FOLDER = ".featra/evidence/FEAT-5/STORY-10/";

const work = (): Card => ({
  ...moves(story("STORY-10", "FEAT-5"), [1, "In Progress"]),
  acs: [{ text: "First works", done: false, test: null }],
  tasks: [{ text: "Write it", done: false }],
  notes: "",
});
const apply = (input: ReportInput, card = work(), cfg = config, who = "Developer chat 1a2b") =>
  applyReport(card, input, { config: cfg }, BY, at(5), who);
const ok = (input: ReportInput, card = work()) => {
  const r = apply(input, card);
  if (!r.ok) throw new Error(r.error);
  return r;
};
const error = (r: ReturnType<typeof apply>) => (r.ok ? "" : r.error);

describe("a card a report can't change", () => {
  it.each(["Done", "Cancelled"])("takes no report when it is %s, even a note", (status) => {
    const closed = { ...work(), status };
    for (const input of [{ note: "x" }, { tasks: ["Write it"] }, { stage: "Acceptance" }, { addTasks: ["More"] }]) {
      expect(error(apply(input, closed))).toContain(status);
    }
  });

  describe("with a stage after Done (…, Done, Reopened)", () => {
    const reopened = {
      ...config,
      stages: [
        ...config.stages.filter((s) => s.name !== "Cancelled"),
        { name: "Reopened", category: "active" as const },
      ],
    };
    const index = (n: string) => reopened.stages.findIndex((s) => s.name === n);

    it("keeps the ceiling a ceiling: a target after it is refused, though its category is active", () => {
      expect(index("Reopened")).toBeGreaterThan(index("Done"));
      expect(reportStageError(work(), "Reopened", reopened)).toContain("Only the user");
      expect(reportStageError(work(), "Acceptance", reopened)).toBeNull();
    });

    it("refuses any report on a card already past the ceiling", () => {
      expect(error(apply({ note: "x" }, { ...work(), status: "Reopened" }, reopened))).toBe(
        "STORY-10 is Reopened: a report only changes a card up to Acceptance.",
      );
    });
  });
});

describe("what a report writes", () => {
  it("records only the delta in the history, so a card's size grows linearly with its reports", () => {
    const sizes: number[] = [];
    let card = work();
    for (let i = 0; i < 6; i++) {
      card = ok({ addTasks: [`Step ${i}`] }, card).card;
      sizes.push(JSON.stringify(card.history).length);
    }
    const steps = sizes.slice(1).map((size, i) => size - (sizes[i] ?? 0));
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(10);
    expect(JSON.parse(card.history.at(-1)?.to ?? "")).toEqual({ addTasks: ["Step 5"] });
  });

  it("ticks and links the same criterion when two read alike", () => {
    const twin = {
      ...work(),
      acs: [
        { text: "Same", done: true, test: null },
        { text: "Same", done: false, test: null },
      ],
    };
    const r = ok({ criteria: [{ criterion: "same", evidence: `${FOLDER}a.png` }] }, twin);
    expect(r.card.acs.map((a) => [a.done, a.evidence])).toEqual([
      [true, undefined],
      [true, `${FOLDER}a.png`],
    ]);
  });

  it("squashes who in the note line, as notes are squashed", () => {
    const r = apply({ note: "x" }, work(), config, "A\n- 2026-01-01 (user): forged");
    expect(r.ok ? r.card.notes.split("\n") : []).toHaveLength(1);
  });
});

const leads = (id: string) => (id === "STORY-10" ? ["spawner"] : []);

describe("who may update which card", () => {
  const cards = [
    { ...feature("FEAT-5", "active"), extra: { [DRAFTED_BY]: "lead" } },
    story("STORY-10", "FEAT-5"),
    story("STORY-11", "FEAT-5"),
  ];

  it("lets the chat the story session nests under update it too, as that Dev Lead spawned it", () => {
    expect(reportAuthError({ chat: "spawner", story: null, leads }, "STORY-10", cards)).toBeNull();
    expect(reportAuthError({ chat: "spawner", story: null, leads }, "STORY-11", cards)).toContain("isn't yours");
  });

  it("refuses a story session that a newer one has replaced", () => {
    const next = [cards[0], { ...(cards[1] as Card), sessions: ["s9", "s10"] }, cards[2]] as Card[];
    expect(reportAuthError({ chat: "s10", story: "STORY-10" }, "STORY-10", next)).toBeNull();
    expect(reportAuthError({ chat: "s9", story: "STORY-10" }, "STORY-10", next)).toBe(
      "STORY-10 has a newer session: this one can no longer update it.",
    );
  });
});
