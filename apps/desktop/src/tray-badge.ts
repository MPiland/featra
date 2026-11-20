import { NEEDS_COPY } from "@featra/client/bridge";
import { badgeCount } from "./badge.ts";

/** The tray icon's tooltip with no agent waiting. */
export const TRAY_TOOLTIP = "Featra";

/** How the tray icon looks: with the red dot or plain, and its tooltip. */
export interface TrayLook {
  dot: boolean;
  tooltip: string;
}

export interface TrayBadge {
  /** Shows `count` on the tray, or the plain icon at 0. The same count again does nothing. */
  show: (count: number) => void;
  /** The tray to set, or undefined once it is gone. A tray made while agents wait gets the count at once. */
  attach: (set: ((look: TrayLook) => void) | undefined) => void;
}

/**
 * The tray's share of the badge (STORY-67): while agents wait on the user, the tray icon has a red dot and its tooltip
 * says how many ("2 agents waiting"), the switcher's words; at 0 it is the plain icon again. The tray comes and goes
 * with the Close button setting, so the count is kept here and given to each tray made.
 */
export function createTrayBadge(): TrayBadge {
  let count = 0;
  let set: ((look: TrayLook) => void) | undefined;
  const look = (): TrayLook =>
    count > 0 ? { dot: true, tooltip: NEEDS_COPY.waiting(count) } : { dot: false, tooltip: TRAY_TOOLTIP };
  return {
    show(next) {
      const valid = badgeCount(next);
      if (valid === count) return;
      count = valid;
      set?.(look());
    },
    attach(next) {
      set = next;
      if (count > 0) set?.(look());
    },
  };
}
