/**
 * How wide the card pane is (STORY-4, ADR 0017). The user's chosen width is kept in the UI state; what the pane
 * actually gets is that width fitted to the work area, so the list keeps its minimum and nothing scrolls sideways.
 */
export const PANE_WIDTH = {
  /** The pane's own limits, in CSS px. */
  min: 320,
  max: 720,
  /** What the list beside it keeps. */
  listMin: 240,
  /** The default, as a share of the work area. */
  share: 0.4,
  /** One arrow key press on the handle. */
  step: 16,
} as const;

/**
 * The widths the pane can take in a work area `split` px wide. When the area is too narrow for both minimums, the
 * pane and the list share it in their proportion. A `split` of 0 means not measured yet: only the pane's own limits.
 */
export function paneLimits(split: number): { min: number; max: number } {
  if (split <= 0) return { min: PANE_WIDTH.min, max: PANE_WIDTH.max };
  const max = Math.min(PANE_WIDTH.max, split - PANE_WIDTH.listMin);
  if (max >= PANE_WIDTH.min) return { min: PANE_WIDTH.min, max };
  const shared = Math.round((split * PANE_WIDTH.min) / (PANE_WIDTH.min + PANE_WIDTH.listMin));
  return { min: shared, max: shared };
}

/** The width the pane gets: the chosen one (or the default share) within the limits. */
export function paneWidthFor(wanted: number | null, split: number): number {
  const { min, max } = paneLimits(split);
  return Math.round(Math.min(max, Math.max(min, wanted ?? split * PANE_WIDTH.share)));
}

/** The width after a key press on the handle, or null when the key doesn't resize. The pane is on the right. */
export function stepPaneWidth(width: number, key: string, split: number): number | null {
  const { min, max } = paneLimits(split);
  if (key === "Home") return min;
  if (key === "End") return max;
  if (key === "ArrowLeft") return paneWidthFor(width + PANE_WIDTH.step, split);
  if (key === "ArrowRight") return paneWidthFor(width - PANE_WIDTH.step, split);
  return null;
}

/** A stored width, read defensively: anything but a positive finite number means the default. */
export function normalizePaneWidth(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}
