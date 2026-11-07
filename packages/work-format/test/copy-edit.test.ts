import { describe, expect, it } from "vitest";
import { applyCopyEdit, setStatus } from "../src/index.ts";
import { at, moves, story } from "./fixtures.ts";

const base = story("STORY-1", "FEAT-1");

describe("applyCopyEdit", () => {
  it("copies changed plain fields to the owner and keeps the owner's own changes", () => {
    const owner = { ...base, notes: "owner notes" };
    const edited = { ...base, title: "Better title" };
    const r = applyCopyEdit(base, edited, owner, "user", at(9));
    expect(r).toEqual({ ok: true, card: { ...owner, title: "Better title" } });
  });

  it("records a status change at the owner through setStatus, as the applier", () => {
    const edited = moves(base, [5, "In Progress", "developer"]);
    const r = applyCopyEdit(base, edited, base, "user", at(9));
    expect(r).toEqual({ ok: true, card: setStatus(base, "In Progress", "user", at(9)) });
  });

  it("records a parent change with a history event", () => {
    const edited = { ...base, parent: "FEAT-2" };
    const r = applyCopyEdit(base, edited, base, "user", at(9));
    expect(r.ok && r.card.parent).toBe("FEAT-2");
    expect(r.ok && r.card.history.at(-1)).toMatchObject({ field: "parent", from: "FEAT-1", to: "FEAT-2", by: "user" });
  });

  it("refuses when the owner changed the same field differently", () => {
    const owner = { ...base, title: "Owner title" };
    const edited = { ...base, title: "Copy title" };
    expect(applyCopyEdit(base, edited, owner, "user", at(9))).toEqual({
      ok: false,
      error: "The owner changed title too. Edit the owner's copy instead.",
    });
  });

  it("accepts a field both changed to the same value", () => {
    const owner = { ...base, title: "Same" };
    const r = applyCopyEdit(base, { ...base, title: "Same" }, owner, "user", at(9));
    expect(r).toEqual({ ok: true, card: owner });
  });

  it("refuses an edit that rewrites earlier history", () => {
    const committed = moves(base, [5, "In Progress"]);
    const edited = { ...committed, history: committed.history.slice(0, 1) };
    expect(applyCopyEdit(committed, edited, committed, "user", at(9)).ok).toBe(false);
  });

  it("refuses a change of id or type", () => {
    expect(applyCopyEdit(base, { ...base, id: "STORY-9" }, base, "user", at(9)).ok).toBe(false);
    expect(applyCopyEdit(base, { ...base, type: "bug" }, base, "user", at(9)).ok).toBe(false);
  });

  it("with no owner copy, the edited card is the result", () => {
    expect(applyCopyEdit(null, base, null, "user", at(9))).toEqual({ ok: true, card: base });
  });

  it("with no base (never committed), changes are measured from the owner", () => {
    const owner = { ...base, notes: "n" };
    const r = applyCopyEdit(null, { ...owner, title: "T" }, owner, "user", at(9));
    expect(r).toEqual({ ok: true, card: { ...owner, title: "T" } });
  });
});
