/** Zoom steps, as in Chromium's own zoom menu. */
export const ZOOM_FACTORS: readonly number[] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const DEFAULT_ZOOM = 1;

const EPS = 1e-6;

/** Snaps a stored value to the nearest step; anything unusable resets to 100%. */
export function normalizeZoom(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_ZOOM;
  return ZOOM_FACTORS.reduce((best, f) => (Math.abs(f - raw) < Math.abs(best - raw) ? f : best), DEFAULT_ZOOM);
}

export function zoomIn(factor: number): number {
  return ZOOM_FACTORS.find((f) => f > factor + EPS) ?? ZOOM_FACTORS[ZOOM_FACTORS.length - 1]!;
}

export function zoomOut(factor: number): number {
  return [...ZOOM_FACTORS].reverse().find((f) => f < factor - EPS) ?? ZOOM_FACTORS[0]!;
}
