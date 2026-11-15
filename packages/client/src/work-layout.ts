/**
 * Work's layout (STORY-17): the list or the stage board, chosen in Work's header and remembered per project in the
 * app's UI state (`ui-state.json` in the user's config folder, beside the card pane's width). Not the project's
 * `.featra/config.yaml`: how one person looks at Work is theirs, not the team's.
 */
export type WorkLayout = "list" | "board";

/** The part of the UI state that holds the layout: the projects that show the board. */
interface BoardChoice {
  boardProjects?: string[];
}

/** The stored projects that show the board, without duplicates; anything malformed is left out. */
export function normalizeBoardProjects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((d): d is string => typeof d === "string" && d !== ""))];
}

/** The layout `dir` shows: the list until the user picks the board there. */
export const workLayoutOf = (state: BoardChoice, dir: string): WorkLayout =>
  state.boardProjects?.includes(dir) ? "board" : "list";

/**
 * `state` with `dir` showing `layout`, or `state` itself when it already does; with the list everywhere the field is
 * undefined, so it is not stored.
 */
export function withWorkLayout<S extends BoardChoice>(state: S, dir: string, layout: WorkLayout): S {
  if (workLayoutOf(state, dir) === layout) return state;
  const others = (state.boardProjects ?? []).filter((d) => d !== dir);
  const boardProjects = layout === "board" ? [...others, dir] : others;
  return { ...state, boardProjects: boardProjects.length ? boardProjects : undefined };
}

/** Whether two states choose the same layouts, so an unchanged choice is not saved again. */
export const sameBoardProjects = (a: BoardChoice, b: BoardChoice): boolean =>
  (a.boardProjects ?? []).join("\n") === (b.boardProjects ?? []).join("\n");
