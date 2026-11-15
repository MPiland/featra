/** STORY-17: Work's layout, remembered per project in the app's UI state. */
import { describe, expect, it } from "vitest";
import { DEFAULT_UI_STATE, normalizeUiState } from "../src/bridge.ts";
import { normalizeBoardProjects, sameBoardProjects, withWorkLayout, workLayoutOf } from "../src/work-layout.ts";

const A = "/home/me/manager";
const B = "/home/me/website";

describe("AC1: the List and Board choice is remembered per project", () => {
  it("is the list until the user picks the board in that project", () => {
    expect(workLayoutOf(DEFAULT_UI_STATE, A)).toBe("list");
    const onBoard = withWorkLayout(DEFAULT_UI_STATE, A, "board");
    expect(workLayoutOf(onBoard, A)).toBe("board");
    expect(workLayoutOf(onBoard, B)).toBe("list");
  });

  it("keeps each project's choice, and the list everywhere stores nothing", () => {
    const both = withWorkLayout(withWorkLayout(DEFAULT_UI_STATE, A, "board"), B, "board");
    expect(both.boardProjects).toEqual([A, B]);
    expect(withWorkLayout(both, A, "board").boardProjects).toEqual([A, B]);
    const back = withWorkLayout(withWorkLayout(both, A, "list"), B, "list");
    expect(back.boardProjects).toBeUndefined();
    expect(JSON.parse(JSON.stringify(back))).toEqual(DEFAULT_UI_STATE);
  });

  it("returns the same state when the project already shows that layout", () => {
    const onBoard = withWorkLayout(DEFAULT_UI_STATE, A, "board");
    expect(withWorkLayout(onBoard, A, "board")).toBe(onBoard);
    expect(withWorkLayout(DEFAULT_UI_STATE, A, "list")).toBe(DEFAULT_UI_STATE);
    expect(withWorkLayout(onBoard, B, "list")).toBe(onBoard);
  });

  it("leaves the rest of the UI state alone", () => {
    const state = { ...DEFAULT_UI_STATE, sidebarCollapsed: true, cardPaneWidth: 400 };
    expect(withWorkLayout(state, A, "board")).toEqual({ ...state, boardProjects: [A] });
  });

  it("tells a changed choice from an unchanged one, so only a change is saved", () => {
    const one = withWorkLayout(DEFAULT_UI_STATE, A, "board");
    expect(sameBoardProjects(one, withWorkLayout(DEFAULT_UI_STATE, A, "board"))).toBe(true);
    expect(sameBoardProjects(one, DEFAULT_UI_STATE)).toBe(false);
    expect(sameBoardProjects(DEFAULT_UI_STATE, withWorkLayout(one, A, "list"))).toBe(true);
  });

  it("reads the stored choice defensively", () => {
    expect(normalizeBoardProjects([A, A, "", 7, null, B])).toEqual([A, B]);
    expect(normalizeBoardProjects("nope")).toEqual([]);
    expect(normalizeUiState({ boardProjects: [A] })).toEqual({ ...DEFAULT_UI_STATE, boardProjects: [A] });
    expect(normalizeUiState({ boardProjects: [] })).toEqual(DEFAULT_UI_STATE);
    expect(normalizeUiState({ boardProjects: [1] })).toEqual(DEFAULT_UI_STATE);
  });
});
