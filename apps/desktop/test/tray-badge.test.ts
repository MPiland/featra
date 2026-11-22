import { NEEDS_COPY } from "@featra/client/bridge";
import { describe, expect, it } from "vitest";
import { createTrayBadge, TRAY_TOOLTIP, type TrayLook } from "../src/tray-badge.ts";

/**
 * STORY-67 AC5: the tray icon shows when agents are waiting, with the count in its tooltip, over the real rules. Only
 * the tray is fake: it records each look it is given.
 */
function trayWithBadge() {
  const badge = createTrayBadge();
  const looks: TrayLook[] = [];
  badge.attach((look) => looks.push(look));
  return { badge, looks };
}

const waiting = (n: number): TrayLook => ({ dot: true, tooltip: NEEDS_COPY.waiting(n) });
const plain: TrayLook = { dot: false, tooltip: TRAY_TOOLTIP };

describe("AC5: the tray icon shows when agents are waiting, and its tooltip says how many", () => {
  it("puts the dot on the icon and the count in the tooltip", () => {
    const { badge, looks } = trayWithBadge();
    badge.show(1);
    badge.show(2);
    expect(looks).toEqual([waiting(1), waiting(2)]);
    expect(looks[1]?.tooltip).toBe("2 agents waiting");
  });

  it("returns to the plain icon at 0", () => {
    const { badge, looks } = trayWithBadge();
    badge.show(3);
    badge.show(0);
    expect(looks).toEqual([waiting(3), plain]);
    expect(TRAY_TOOLTIP).toBe("Featra");
  });

  it("sets the tray only when the count changes, and not at all for 0 at the start", () => {
    const { badge, looks } = trayWithBadge();
    badge.show(0);
    badge.show(2);
    badge.show(2);
    expect(looks).toEqual([waiting(2)]);
  });

  it("takes a count that isn't a whole number above 0 as none", () => {
    const { badge, looks } = trayWithBadge();
    badge.show(2);
    badge.show(-1);
    badge.show(1.5);
    badge.show(Number.NaN);
    expect(looks).toEqual([waiting(2), plain]);
  });

  it("gives a tray made later the current count, and a new plain tray nothing", () => {
    const badge = createTrayBadge();
    badge.show(2);
    const later: TrayLook[] = [];
    badge.attach((look) => later.push(look));
    expect(later).toEqual([waiting(2)]);
    badge.show(0);
    const plainTray: TrayLook[] = [];
    badge.attach((look) => plainTray.push(look));
    expect(plainTray).toEqual([]);
  });

  it("leaves a removed tray alone", () => {
    const { badge, looks } = trayWithBadge();
    badge.attach(undefined);
    badge.show(1);
    expect(looks).toEqual([]);
  });
});
