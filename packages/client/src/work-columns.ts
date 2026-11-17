/**
 * Which of the Work list's columns show (STORY-62). Features and stories share one grid: the name, then Status
 * (a story's Stage), then three columns that each row type fills its own way: Progress (Criteria), Tasks, and Scope
 * (PR). The name and Status always show. With the card pane open, Tasks and Scope are hidden. Any column that doesn't
 * fit the list's width is hidden too, least important first: Tasks, then Scope, then Progress. So no cell has to wrap
 * or be cut short. The widths are the tracks of the grid's template, in CSS px.
 */
export type WorkColumn = "progress" | "tasks" | "scope";

export const WORK_GRID = {
  /** The caret column, the gap between columns, and the fixed tracks. */
  caret: 14,
  gap: 14,
  status: 116,
  progress: 184,
  tasks: 64,
  scope: 176,
  /** What the name column keeps before a column is dropped: a story's title, and its line of session and actions. */
  name: 300,
  /** The list's padding (16 each side), the table's border (1 each side) and a row's padding (14 each side). */
  frame: 62,
} as const;

/** The columns in their place on the grid; the index is the column's place in WORK_COPY's headers. */
export const WORK_COLUMNS: readonly WorkColumn[] = ["progress", "tasks", "scope"];

/** Kept first when the width runs short. */
const PRIORITY: readonly WorkColumn[] = ["progress", "scope", "tasks"];

/**
 * The columns shown in a Work list `width` px wide (its `clientWidth`). A width of 0 means not measured yet: every
 * column the pane allows shows.
 */
export function workColumns(width: number, paneOpen: boolean): WorkColumn[] {
  const allowed = paneOpen ? PRIORITY.filter((c) => c === "progress") : PRIORITY;
  let kept: readonly WorkColumn[] = allowed;
  if (width > 0) {
    const g = WORK_GRID;
    let used = g.frame + g.caret + g.gap + g.name + g.gap + g.status;
    const fit: WorkColumn[] = [];
    for (const c of allowed) {
      used += g.gap + g[c];
      if (used > width) break;
      fit.push(c);
    }
    kept = fit;
  }
  return WORK_COLUMNS.filter((c) => kept.includes(c));
}

/** The grid's `grid-template-columns` for the columns shown. */
export function workGridTemplate(columns: readonly WorkColumn[]): string {
  const g = WORK_GRID;
  return [`${g.caret}px`, "minmax(0, 1fr)", `${g.status}px`, ...columns.map((c) => `${g[c]}px`)].join(" ");
}

/** The headers, or a row's cells, of the columns shown: the name and Status, then `columns` in their place. */
export function shownCells<T>(cells: readonly T[], columns: readonly WorkColumn[]): T[] {
  return cells.filter((_, i) => {
    const column = WORK_COLUMNS[i - 2];
    return i < 2 || (column !== undefined && columns.includes(column));
  });
}
