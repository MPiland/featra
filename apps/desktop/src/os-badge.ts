import { app, nativeImage, type BrowserWindow } from "electron";
import { BADGE_PX, BADGE_SCALE } from "./badge-image.ts";
import { createBadge, type Badge } from "./badge.ts";
import { e2e, testHooks } from "./test-hooks.ts";

/**
 * The badge on Electron's own calls (STORY-67): the Dock's badge, the launcher count, and the overlay on `window()`'s
 * taskbar button. E2E runs make the same calls and record each one, since a test can't read the taskbar.
 */
export function createOsBadge(window: () => BrowserWindow | undefined, log: (message: string) => void): Badge {
  const record = testHooks.badge;
  const note = (shows: string) => {
    const win = window();
    if (e2e) record.calls.push({ on: "badge", shows, visible: !!win && !win.isDestroyed() && win.isVisible() });
  };
  return createBadge({
    platform: process.platform,
    dock: app.dock && {
      setBadge(text) {
        app.dock?.setBadge(text);
        if (e2e) record.dock = text;
        note(text);
      },
    },
    setBadgeCount(count) {
      if (e2e) record.launcher = count;
      note(count > 0 ? String(count) : "");
      return app.setBadgeCount(count);
    },
    setOverlay(overlay, description) {
      const win = window();
      note(overlay?.label ?? "");
      if (!win || win.isDestroyed()) return;
      const image =
        overlay &&
        nativeImage.createFromBitmap(overlay.bitmap, { width: BADGE_PX, height: BADGE_PX, scaleFactor: BADGE_SCALE });
      win.setOverlayIcon(image, description);
      if (e2e)
        record.overlay = overlay &&
          image && { label: overlay.label, description, ...image.getSize(), empty: image.isEmpty() };
    },
    log,
  });
}
