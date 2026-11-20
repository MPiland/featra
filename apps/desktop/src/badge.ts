import { NEEDS_COPY } from "@featra/client/bridge";
import { overlayBitmap, overlayLabel } from "./badge-image.ts";

/**
 * The taskbar and Dock badge (STORY-67): how many agents wait on the user across every open project, the switcher's
 * count, shown where each OS shows one. macOS has the Dock's badge; Windows has an overlay icon on the taskbar button,
 * with a description for screen readers; Linux has the launcher count, on the desktops that have one (Unity's launcher
 * API). At 0 the badge clears. What the OS gives is passed in, so the rules run in tests without Electron.
 */
export interface BadgeDeps {
  platform: NodeJS.Platform;
  /** macOS: the Dock's badge text; "" clears it. */
  dock?: { setBadge: (text: string) => void };
  /** Linux: the launcher's count, 0 clears it; false where the desktop shows none. */
  setBadgeCount: (count: number) => boolean;
  /** Windows: the overlay on the taskbar button (null clears it) and what a screen reader hears for it. */
  setOverlay: (overlay: Overlay | null, description: string) => void;
  log: (message: string) => void;
}

/** The overlay to draw: its label ("3", "9+") and its pixels (`overlayBitmap`). */
export interface Overlay {
  label: string;
  bitmap: Buffer;
}

export interface Badge {
  /** Shows `count`, or clears the badge at 0. The same count again does nothing. */
  show: (count: number) => void;
  /** Applies the count again: a hidden window's taskbar button loses its overlay, so one shown again gets it back. */
  refresh: () => void;
}

export function createBadge({ platform, dock, setBadgeCount, setOverlay, log }: BadgeDeps): Badge {
  let count = 0;
  let toldNoCount = false;

  const apply = () => {
    if (platform === "darwin") {
      dock?.setBadge(count > 0 ? String(count) : "");
      return;
    }
    if (platform === "win32") {
      const label = overlayLabel(count);
      if (count > 0) setOverlay({ label, bitmap: overlayBitmap(label) }, NEEDS_COPY.waiting(count));
      else setOverlay(null, "");
      return;
    }
    if (setBadgeCount(count) || count === 0 || toldNoCount) return;
    toldNoCount = true;
    log("This desktop shows no count on the app's icon");
  };

  return {
    show(next) {
      const valid = Number.isSafeInteger(next) && next > 0 ? next : 0;
      if (valid === count) return;
      count = valid;
      apply();
    },
    refresh() {
      if (count > 0) apply();
    },
  };
}
