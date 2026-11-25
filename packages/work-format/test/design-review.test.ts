/**
 * STORY-73: the design review of a story's screenshots, on real work-format code. Pure: no files, no server. What
 * counts as screenshots, when the check is on, the gate on the move to Acceptance, who records findings, fixes and
 * clears, and a story sent back being reviewed again.
 */
import { describe, expect, it } from "vitest";
import {
  applyReport,
  configOverrides,
  DESIGN_REVIEW_COPY,
  DESIGN_REVIEW_ERRORS,
  designReviewOn,
  designReviewState,
  parseConfig,
  parseReportInput,
  proofShots,
  sendBackRefusal,
  sentBackStory,
  type Card,
  type ProjectConfig,
  type ReportInput,
} from "../src/index.ts";
import { at, config, moves, story } from "./fixtures.ts";

const FOLDER = ".featra/evidence/FEAT-5/STORY-10/";
/** The project's proof captures screenshots, so the design review is on by default. */
const shots: ProjectConfig = { ...config, proof: "screenshots" };
const LEAD = "session:lead-1";
const SESSION = "session:story-1";

/** STORY-10 in `status`, its first criterion with `evidence`. */
function card(status: string, evidence: string | null = `${FOLDER}ac1-page.png`): Card {
  const base = moves(story("STORY-10", "FEAT-5"), [1, "In Progress"]);
  const placed = status === "In Progress" ? base : moves(base, [2, status]);
  return {
    ...placed,
    acs: [
      { text: "It shows", done: true, test: null, ...(evidence ? { evidence } : {}) },
      { text: "It saves", done: true, test: null },
    ],
  };
}

const report = (c: Card, input: ReportInput, lead: boolean, cfg = shots) =>
  applyReport(c, input, { config: cfg, lead }, lead ? LEAD : SESSION, at(10), lead ? "Dev Lead" : "Developer");
function ok(c: Card, input: ReportInput, lead: boolean, cfg = shots): Card {
  const r = report(c, input, lead, cfg);
  if (!r.ok) throw new Error(r.error);
  return r.card;
}
function refused(c: Card, input: ReportInput, lead: boolean, cfg = shots): string {
  const r = report(c, input, lead, cfg);
  if (r.ok) throw new Error("Expected a refusal.");
  return r.error;
}

describe("what counts as a story's screenshots", () => {
  it("is a page Featra captured or a test screenshot it matched, never the agent's own image", () => {
    expect(proofShots(card("In Review"))).toEqual([`${FOLDER}ac1-page.png`]);
    expect(proofShots(card("In Review", `${FOLDER}ac1-test.webp`))).toEqual([`${FOLDER}ac1-test.webp`]);
    expect(proofShots(card("In Review", `${FOLDER}my-shot.png`))).toEqual([]);
    expect(proofShots(card("In Review", null))).toEqual([]);
  });
});

describe("AC4: the project's setting", () => {
  it("is on by default when the proof captures screenshots, and off otherwise", () => {
    expect(designReviewOn(shots)).toBe(true);
    expect(designReviewOn({ ...config, proof: "both" })).toBe(true);
    expect(designReviewOn({ ...config, proof: "preview" })).toBe(false);
    expect(designReviewOn(config)).toBe(false);
  });

  it("is the project's own choice when it sets one", () => {
    expect(designReviewOn({ ...shots, designReview: false })).toBe(false);
    expect(designReviewOn({ ...config, proof: "none", designReview: true })).toBe(true);
    expect(parseConfig("designReview: false\n").designReview).toBe(false);
    expect(parseConfig("").designReview).toBeNull();
    expect(() => configOverrides("designReview: maybe\n")).toThrow("designReview must be true or false");
  });

  it("turned off, lets a story with screenshots move on to Acceptance", () => {
    const off = { ...shots, designReview: false };
    expect(designReviewState(card("In Review"), off)).toBeNull();
    expect(ok(card("In Review"), { stage: "Acceptance" }, false, off).status).toBe("Acceptance");
    expect(ok(card("In Progress"), { stage: "Acceptance" }, false, off).status).toBe("Acceptance");
  });
});

describe("AC1: before a story moves to Acceptance, its screenshots wait for the design review", () => {
  it("waits once a story with screenshots is in review", () => {
    expect(designReviewState(card("In Review"), shots)).toEqual({
      status: "waiting",
      shots: [`${FOLDER}ac1-page.png`],
    });
    expect(designReviewState(card("In Progress"), shots)).toBeNull();
  });

  it("refuses the move to Acceptance while it waits, by the story's session or the Dev Lead", () => {
    expect(refused(card("In Review"), { stage: "Acceptance" }, false)).toBe(DESIGN_REVIEW_ERRORS.waits("STORY-10"));
    expect(refused(card("In Review"), { stage: "Acceptance" }, true)).toBe(
      "STORY-10 waits for its design review: the Dev Lead clears it with update_card's designReview first.",
    );
  });

  it("can't be skipped: a story goes to review before Acceptance while the check is on", () => {
    expect(refused(card("In Progress"), { stage: "Acceptance" }, false)).toBe(
      "Move STORY-10 to In Review first: the Dev Lead reviews its screenshots there before it moves on.",
    );
  });

  it("lets the Dev Lead clear it and move the story on in one call, recorded in its history", () => {
    const next = ok(card("In Review"), { designReview: { clear: true }, stage: "Acceptance" }, true);
    expect(next.status).toBe("Acceptance");
    expect(next.history.slice(-2)).toMatchObject([
      { field: "design-review", from: null, to: "cleared", by: LEAD, at: at(10) },
      { field: "status", from: "In Review", to: "Acceptance", by: LEAD },
    ]);
    expect(designReviewState(next, shots)).toEqual({ status: "cleared", shots: [`${FOLDER}ac1-page.png`] });
  });

  it("once cleared, lets the story's session move it on, and a second clear records nothing", () => {
    const cleared = ok(card("In Review"), { designReview: { clear: true } }, true);
    expect(ok(cleared, { stage: "Acceptance" }, false).status).toBe("Acceptance");
    const again = report(cleared, { designReview: { clear: true } }, true);
    expect(again).toMatchObject({ ok: true, changes: [] });
  });
});

describe("AC2: findings keep the story in review until they're fixed or cleared", () => {
  const findings = "The Save button overlaps the footer at 1280 px.";

  it("records the Dev Lead's findings, which keep the story in review", () => {
    const r = report(card("In Review"), { designReview: { findings } }, true);
    expect(r).toMatchObject({ ok: true, changes: [DESIGN_REVIEW_COPY.sent("STORY-10")] });
    const next = ok(card("In Review"), { designReview: { findings } }, true);
    expect(next.history.at(-1)).toMatchObject({ field: "design-review", to: `findings: ${findings}`, by: LEAD });
    expect(designReviewState(next, shots)).toMatchObject({ status: "findings", findings });
    expect(refused(next, { stage: "Acceptance" }, false)).toBe(DESIGN_REVIEW_ERRORS.waits("STORY-10"));
  });

  it("waits again when the story's session reports them fixed", () => {
    const sent = ok(card("In Review"), { designReview: { findings } }, true);
    const fixed = ok(sent, { designReview: { fixed: true } }, false);
    expect(fixed.history.at(-1)).toMatchObject({ field: "design-review", to: "fixed", by: SESSION });
    expect(designReviewState(fixed, shots)).toEqual({
      status: "waiting",
      shots: [`${FOLDER}ac1-page.png`],
      fixed: true,
    });
    expect(refused(fixed, { stage: "Acceptance" }, false)).toBe(DESIGN_REVIEW_ERRORS.waits("STORY-10"));
  });

  it("lets the Dev Lead clear it after findings", () => {
    const sent = ok(card("In Review"), { designReview: { findings } }, true);
    const cleared = ok(sent, { designReview: { clear: true }, stage: "Acceptance" }, true);
    expect(cleared.status).toBe("Acceptance");
    expect(cleared.history.filter((e) => e.field === "design-review").map((e) => e.to)).toEqual([
      `findings: ${findings}`,
      "cleared",
    ]);
  });

  it("keeps findings and clears to the Dev Lead, and fixes to the story's session", () => {
    expect(refused(card("In Review"), { designReview: { findings } }, false)).toBe(
      DESIGN_REVIEW_ERRORS.leadOnly("STORY-10"),
    );
    expect(refused(card("In Review"), { designReview: { clear: true } }, false)).toBe(
      "Only the Dev Lead reviews STORY-10's screenshots.",
    );
    const sent = ok(card("In Review"), { designReview: { findings } }, true);
    expect(refused(sent, { designReview: { fixed: true } }, true)).toBe(DESIGN_REVIEW_ERRORS.sessionOnly("STORY-10"));
    expect(refused(card("In Review"), { designReview: { fixed: true } }, false)).toBe(
      DESIGN_REVIEW_ERRORS.noFindings("STORY-10"),
    );
  });
});

describe("AC3: a story with no screenshots moves on without the check", () => {
  it("has no design review, and moves to Acceptance", () => {
    const none = card("In Review", null);
    expect(designReviewState(none, shots)).toBeNull();
    expect(ok(none, { stage: "Acceptance" }, false).status).toBe("Acceptance");
    expect(refused(none, { designReview: { clear: true } }, true)).toBe(DESIGN_REVIEW_ERRORS.none("STORY-10"));
  });

  it("treats the agent's own image as evidence, not a screenshot to review", () => {
    const own = card("In Review", `${FOLDER}before-after.png`);
    expect(ok(own, { stage: "Acceptance" }, false).status).toBe("Acceptance");
  });
});

describe("a story sent back", () => {
  it("is reviewed again when it comes back to review", () => {
    const cleared = ok(card("In Review"), { designReview: { clear: true }, stage: "Acceptance" }, true);
    const back = sentBackStory(cleared, shots, "The header is cut off.", false, "user", at(20));
    expect(back.status).toBe("In Progress");
    expect(designReviewState(back, shots)).toBeNull();
    const again = ok(back, { stage: "In Review" }, false);
    expect(designReviewState(again, shots)).toEqual({ status: "waiting", shots: [`${FOLDER}ac1-page.png`] });
    expect(refused(again, { stage: "Acceptance" }, false)).toBe(DESIGN_REVIEW_ERRORS.waits("STORY-10"));
  });

  it("can be sent back by the user while it waits for its design review, as from Acceptance", () => {
    expect(sendBackRefusal(card("In Review"), "STORY-10", shots)).toBeNull();
    expect(sendBackRefusal(card("In Review", null), "STORY-10", shots)).toBe(
      "STORY-10 is In Review, not waiting for acceptance.",
    );
    expect(sendBackRefusal(card("Acceptance"), "STORY-10", shots)).toBeNull();
  });
});

describe("any move into review starts a new round", () => {
  it("waits again when the user moves a cleared story back from Acceptance to review", () => {
    const cleared = ok(card("In Review"), { designReview: { clear: true }, stage: "Acceptance" }, true);
    const back = moves(cleared, [20, "In Review"]);
    expect(designReviewState(back, shots)).toEqual({ status: "waiting", shots: [`${FOLDER}ac1-page.png`] });
    expect(refused(back, { stage: "Acceptance" }, false)).toBe(DESIGN_REVIEW_ERRORS.waits("STORY-10"));
  });
});

describe("the update_card input", () => {
  it("takes exactly one of findings, clear or fixed", () => {
    expect(parseReportInput({ designReview: { findings: "  Too tight.  " } })).toEqual({
      ok: true,
      value: { designReview: { findings: "Too tight." } },
    });
    expect(parseReportInput({ designReview: { clear: true } })).toMatchObject({ ok: true });
    expect(parseReportInput({ designReview: { fixed: true } })).toMatchObject({ ok: true });
    for (const bad of [
      {},
      { clear: false },
      { findings: "" },
      { findings: "x".repeat(2001) },
      { clear: true, fixed: true },
      "clear",
    ]) {
      expect(parseReportInput({ designReview: bad })).toEqual({ ok: false, error: DESIGN_REVIEW_ERRORS.bad });
    }
  });
});
