import type { Badge } from "./badge.ts";

/**
 * How long after a window shows its taskbar button exists. Windows makes the button after `ShowWindow` returns, and an
 * overlay set before it is there is dropped without an error, so the badge is set again after this wait (STORY-67).
 */
export const SHOWN_SETTLE_MS = 200;

/** The window events the badge follows: Electron's BrowserWindow has them all. */
export interface BadgeWindow {
  on: {
    (event: "show", listener: () => void): unknown;
    (event: "restore", listener: () => void): unknown;
    (event: "focus", listener: () => void): unknown;
  };
}

/**
 * Keeps the badge on `win`'s taskbar button: a window hidden to the tray, minimised, or brought back after Explorer
 * restarts may have a new button without the overlay. It is set again when the window shows (then again once the
 * button exists), is restored, or takes the focus.
 */
export function keepBadgeOn(win: BadgeWindow, badge: Pick<Badge, "refresh">): void {
  const refresh = () => badge.refresh();
  win.on("show", () => {
    refresh();
    setTimeout(refresh, SHOWN_SETTLE_MS);
  });
  win.on("restore", refresh);
  win.on("focus", refresh);
}
