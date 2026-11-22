import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepBadgeOn, SHOWN_SETTLE_MS } from "../src/badge-window.ts";

/**
 * STORY-67 AC1, AC3, regression (review): Windows makes a window's taskbar button after the window shows, and an
 * overlay set before the button exists is dropped. So the badge is set again once the button is there. Only the
 * window and the clock are fake.
 */
beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

function windowWithBadge() {
  const win = new EventEmitter();
  const refreshes = { count: 0 };
  keepBadgeOn(win, { refresh: () => void (refreshes.count += 1) });
  return { win, refreshes };
}

describe("the badge on a window shown again", () => {
  it("is set again when the window shows, and again once its taskbar button exists", () => {
    const { win, refreshes } = windowWithBadge();
    win.emit("show");
    expect(refreshes.count).toBe(1);
    vi.advanceTimersByTime(SHOWN_SETTLE_MS - 1);
    expect(refreshes.count).toBe(1);
    vi.advanceTimersByTime(1);
    expect(refreshes.count).toBe(2);
  });

  it("waits no longer than a quarter second for the button", () => {
    expect(SHOWN_SETTLE_MS).toBeGreaterThanOrEqual(100);
    expect(SHOWN_SETTLE_MS).toBeLessThanOrEqual(250);
  });

  it("is set again when the window is restored or focused", () => {
    const { win, refreshes } = windowWithBadge();
    win.emit("restore");
    win.emit("focus");
    expect(refreshes.count).toBe(2);
  });

  it("is left alone while the window is hidden", () => {
    const { win, refreshes } = windowWithBadge();
    win.emit("hide");
    win.emit("blur");
    vi.advanceTimersByTime(SHOWN_SETTLE_MS);
    expect(refreshes.count).toBe(0);
  });
});
