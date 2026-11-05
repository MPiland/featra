import { describe, expect, it } from "vitest";
import { parentAt, recordAcceptance, recordEvidence, setParent, setStatus, statusAt, toIso } from "../src/index.ts";
import { at, moves, story } from "./fixtures.ts";

const t = (m: number) => Date.parse(at(m));

describe("history", () => {
  it("setStatus appends an event and never rewrites earlier ones", () => {
    const c0 = story("STORY-1", "FEAT-1");
    const c1 = setStatus(c0, "In Progress", "session:a", at(5));
    expect(c1.status).toBe("In Progress");
    expect(c1.history.slice(0, c0.history.length)).toEqual(c0.history);
    expect(c1.history.at(-1)).toEqual({ at: at(5), field: "status", from: "New", to: "In Progress", by: "session:a" });
    expect(c0.status).toBe("New"); // input untouched
  });

  it("setStatus and setParent are no-ops when nothing changes", () => {
    const c = story("STORY-1", "FEAT-1");
    expect(setStatus(c, "New", "user", at(1))).toBe(c);
    expect(setParent(c, "FEAT-1", "user", at(1))).toBe(c);
  });

  it("replays status and parent at a point in time", () => {
    let c = moves(story("STORY-1", "FEAT-1", { created: 1 }), [10, "In Progress"], [20, "Done"]);
    c = setParent(c, "FEAT-2", "user", at(15));
    expect(statusAt(c, t(0))).toBeNull(); // before creation
    expect(statusAt(c, t(5))).toBe("New");
    expect(statusAt(c, t(10))).toBe("In Progress");
    expect(statusAt(c, t(25))).toBe("Done");
    expect(parentAt(c, t(14))).toBe("FEAT-1");
    expect(parentAt(c, t(15))).toBe("FEAT-2");
  });

  it("records evidence and acceptance as events", () => {
    let c = recordEvidence(story("STORY-1", "FEAT-1"), "verified", "system", at(3));
    c = recordAcceptance(c, true, "user", at(4));
    expect(c.history.slice(-2).map((e) => [e.field, e.to])).toEqual([
      ["evidence", "verified"],
      ["accepted", "accepted"],
    ]);
  });

  it("formats timestamps to the second", () => {
    expect(toIso(new Date("2026-11-04T23:00:00.123Z"))).toBe("2026-11-04T23:00:00Z");
  });
});
