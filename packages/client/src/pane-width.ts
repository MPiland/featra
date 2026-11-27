/**
 * How wide a docked pane is (STORY-4, ADR 0017). The user's chosen width is kept in the UI state; what the pane
 * actually gets is that width fitted to the work area, so the list keeps its minimum and nothing scrolls sideways.
 * The card pane and the Browser pane (STORY-74) each have their own limits.
 */
export interface PaneSpec {
  /** The pane's own limits, in CSS px. */
  min: number;
  max: number;
  /** What the list beside it keeps. */
  listMin: number;
  /** The default, as a share of the work area. */
  share: number;
  /** One arrow key press on the handle. */
  step: number;
}

export const PANE_WIDTH = { min: 320, max: 720, listMin: 240, share: 0.4, step: 16 } as const satisfies PaneSpec;

/** The Browser pane: wide enough for a phone, and as wide as a desktop page beside the list. */
export const BROWSER_WIDTH = { min: 360, max: 1920, listMin: 240, share: 0.5, step: 16 } as const satisfies PaneSpec;

/**
 * The widths the pane can take in a work area `split` px wide. When the area is too narrow for both minimums, the
 * pane and the list share it in their proportion. A `split` of 0 means not measured yet: only the pane's own limits.
 */
export function paneLimits(split: number, spec: PaneSpec = PANE_WIDTH): { min: number; max: number } {
  if (split <= 0) return { min: spec.min, max: spec.max };
  const max = Math.min(spec.max, split - spec.listMin);
  if (max >= spec.min) return { min: spec.min, max };
  const shared = Math.max(0, Math.round((split * spec.min) / (spec.min + spec.listMin)));
  return { min: shared, max: shared };
}

/** The width the pane gets: the chosen one (or the default share) within the limits. */
export function paneWidthFor(wanted: number | null, split: number, spec: PaneSpec = PANE_WIDTH): number {
  const { min, max } = paneLimits(split, spec);
  return Math.round(Math.min(max, Math.max(min, wanted ?? split * spec.share)));
}

/** The width after a key press on the handle, or null when the key doesn't resize. The pane is on the right. */
export function stepPaneWidth(width: number, key: string, split: number, spec: PaneSpec = PANE_WIDTH): number | null {
  const { min, max } = paneLimits(split, spec);
  if (key === "Home") return min;
  if (key === "End") return max;
  if (key === "ArrowLeft") return paneWidthFor(width + spec.step, split, spec);
  if (key === "ArrowRight") return paneWidthFor(width - spec.step, split, spec);
  return null;
}

/** A stored width, read defensively: anything but a positive finite number means the default. */
export function normalizePaneWidth(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}
