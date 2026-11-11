import { describe, expect, it } from "vitest";
import {
  checkTransition,
  evidenceState,
  provenEvent,
  recordAcceptance,
  recordEvidence,
  unprovenEvent,
  UNVERIFIED,
  VERIFIED,
} from "../src/index.ts";
import type { Card } from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const withAcs = (n: number): Card => ({
  ...story("STORY-1", "FEAT-1"),
  acs: Array.from({ length: n }, (_, i) => ({ text: `ac${i + 1}`, done: false, test: `t${i + 1}` })),
});

describe("evidenceState", () => {
  it("starts with nothing", () => {
    expect(evidenceState(withAcs(2))).toEqual({
      reported: false,
      verified: false,
      provenAcs: [],
      proven: false,
      accepted: false,
    });
  });

  it("an agent's stage move is Reported; a user's is not", () => {
    expect(evidenceState(moves(withAcs(1), [1, "In Review", "session:abc"])).reported).toBe(true);
    expect(evidenceState(moves(withAcs(1), [1, "In Review", "session:abc"], [2, "Acceptance", "user"])).reported).toBe(
      false,
    );
  });

  it("a story an agent drafted is not Reported: its creation is not progress", () => {
    const drafted = {
      ...withAcs(1),
      history: [{ at: at(0), field: "status" as const, from: null, to: "New", by: "session:abc" }],
    };
    expect(evidenceState(drafted).reported).toBe(false);
  });

  it("an agent's progress report is Reported, until a user's move after it", () => {
    const report = { at: at(3), field: "report" as const, from: "{}", to: "tasks", by: "session:abc" };
    const reported = { ...withAcs(1), history: [...withAcs(1).history, report] };
    expect(evidenceState(reported).reported).toBe(true);
    expect(evidenceState(moves(reported, [4, "In Review", "user"])).reported).toBe(false);
  });

  it("tracks CI verification, per-AC proof and acceptance, latest event winning", () => {
    let c = withAcs(2);
    c = recordEvidence(c, VERIFIED, "system", at(1));
    c = recordEvidence(c, provenEvent(1), "system", at(1));
    expect(evidenceState(c)).toMatchObject({ verified: true, provenAcs: [1], proven: false });

    c = recordEvidence(c, provenEvent(2), "system", at(2));
    expect(evidenceState(c)).toMatchObject({ provenAcs: [1, 2], proven: true });

    c = recordEvidence(c, UNVERIFIED, "system", at(3));
    c = recordEvidence(c, unprovenEvent(1), "system", at(3));
    expect(evidenceState(c)).toMatchObject({ verified: false, provenAcs: [2], proven: false });

    c = recordAcceptance(c, true, "user", at(4));
    expect(evidenceState(c).accepted).toBe(true);
    c = recordAcceptance(c, false, "user", at(5));
    expect(evidenceState(c).accepted).toBe(false);
  });

  it("a card without ACs is never Proven, and proof for removed ACs is ignored", () => {
    expect(evidenceState(recordEvidence(withAcs(0), provenEvent(1), "system", at(1)))).toMatchObject({
      provenAcs: [],
      proven: false,
    });
  });
});

describe("checkTransition", () => {
  const verified = recordEvidence(withAcs(1), VERIFIED, "system", at(1));

  it("Done needs Verified", () => {
    expect(checkTransition(withAcs(1), "Done", { ...config, requireAccept: false })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Verified/),
    });
    expect(checkTransition(verified, "Done", { ...config, requireAccept: false })).toEqual({ ok: true });
  });

  it("Done also needs Accepted when the project requires it", () => {
    expect(checkTransition(verified, "Done", config)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Accept/),
    });
    expect(checkTransition(recordAcceptance(verified, true, "user", at(2)), "Done", config)).toEqual({ ok: true });
  });

  it("a researcher story (no code, no CI) reaches Done on Accepted alone, even when the project doesn't require Accept", () => {
    const research: Card = { ...withAcs(1), role: "researcher" };
    for (const cfg of [config, { ...config, requireAccept: false }]) {
      expect(checkTransition(research, "Done", cfg)).toMatchObject({
        ok: false,
        reason: expect.stringMatching(/Accept/),
      });
      expect(checkTransition(recordAcceptance(research, true, "user", at(2)), "Done", cfg)).toEqual({ ok: true });
    }
  });

  it("other stages and Cancelled need no evidence; unknown stages are refused", () => {
    expect(checkTransition(withAcs(1), "In Review", config)).toEqual({ ok: true });
    expect(checkTransition(withAcs(1), "Cancelled", config)).toEqual({ ok: true });
    expect(checkTransition(withAcs(1), "Shipped", config).ok).toBe(false);
  });

  it("a feature is done only when its items are done and it is Accepted", () => {
    const f = feature("FEAT-1");
    const open = [
      moves(story("STORY-1", "FEAT-1"), [1, "Done"]),
      story("STORY-2", "FEAT-1"),
      moves(story("STORY-3", "FEAT-1"), [1, "Cancelled"]),
    ];
    expect(checkTransition(f, "done", config, open)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/STORY-2/),
    });
    const allDone = open.map((c) => (c.id === "STORY-2" ? moves(c, [2, "Done"]) : c));
    expect(checkTransition(f, "done", config, allDone)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Accept/),
    });
    expect(checkTransition(recordAcceptance(f, true, "user", at(3)), "done", config, allDone)).toEqual({ ok: true });
    expect(checkTransition(f, "In Progress", config).ok).toBe(false);
  });
});
