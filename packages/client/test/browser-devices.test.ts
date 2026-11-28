/**
 * STORY-74's rules, against the real code: what the address bar loads, how a device fits the pane, what a project's
 * stored devices read as, and the page's layout and state as the host takes them.
 */
import { describe, expect, it } from "vitest";
import {
  addDevice,
  addressToUrl,
  DEFAULT_DEVICES,
  DEVICE_PRESETS,
  deviceOfChoice,
  devicesOf,
  fitViewport,
  HANDLE_GUTTER,
  normalizeDevices,
  removeDevice,
  sameDevicesByProject,
  withDevices,
  type BrowserDevices,
} from "../src/browser-devices.ts";
import { DPR, normalizeBrowserLayout, normalizeBrowserState } from "../src/browser.ts";
import { BROWSER_WIDTH, paneWidthFor, stepPaneWidth } from "../src/pane-width.ts";
import { DEFAULT_UI_STATE, normalizeUiState } from "../src/ui-state.ts";

describe("addressToUrl", () => {
  it.each([
    ["http://localhost:5173/a", "http://localhost:5173/a"],
    ["https://example.com", "https://example.com/"],
    ["example.com/docs?q=1", "https://example.com/docs?q=1"],
    ["localhost:5173", "http://localhost:5173/"],
    ["127.0.0.1:8080/x", "http://127.0.0.1:8080/x"],
    ["[::1]:3000", "http://[::1]:3000/"],
    ["  HTTPS://Example.com/  ", "https://example.com/"],
    // The local network and names that never have a public certificate go over http (STORY-74 review).
    ["192.168.1.20:8080", "http://192.168.1.20:8080/"],
    ["10.0.0.5", "http://10.0.0.5/"],
    ["172.20.1.1:3000/a", "http://172.20.1.1:3000/a"],
    ["169.254.10.1", "http://169.254.10.1/"],
    ["printer.local", "http://printer.local/"],
    ["app.test:5173", "http://app.test:5173/"],
    ["api.localhost:3000", "http://api.localhost:3000/"],
    ["172.32.1.1", "https://172.32.1.1/"],
    ["localist.com", "https://localist.com/"],
  ])("loads %s as %s", (typed, url) => expect(addressToUrl(typed)).toBe(url));

  it.each(["", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "chrome://gpu", "intranet", "a b.com"])(
    "refuses %j",
    (typed) => expect(addressToUrl(typed)).toBeNull(),
  );
});

describe("fitViewport", () => {
  it("fills the area when the page fits the pane", () => {
    expect(fitViewport({ width: 600, height: 400 }, null)).toEqual({ x: 0, y: 0, width: 600, height: 400, scale: 1 });
  });

  it("centres a device that fits, at its own size, below the gutter", () => {
    const r = fitViewport({ width: 800, height: 900 }, { width: 375, height: 667 });
    expect(r).toEqual({ x: Math.round((800 - 375) / 2), y: HANDLE_GUTTER, width: 375, height: 667, scale: 1 });
  });

  it("scales a device that doesn't fit down, never up, keeping room for the handles", () => {
    const r = fitViewport({ width: 532, height: 2000 }, { width: 1000, height: 500 });
    expect(r.scale).toBe(0.5);
    expect([r.width, r.height]).toEqual([500, 250]);
    expect(r.x).toBe(HANDLE_GUTTER);
  });
});

describe("a project's devices", () => {
  const kiosk = { name: "Kiosk", width: 1080, height: 1920, dpr: 1, mobile: false };

  it("reads what is malformed as the default", () => {
    expect(normalizeDevices(undefined)).toEqual(DEFAULT_DEVICES);
    expect(normalizeDevices({ choice: 7, responsive: { width: "x" }, custom: "no" })).toEqual(DEFAULT_DEVICES);
  });

  it("clamps sizes, drops bad and repeated devices, and keeps a known choice", () => {
    const d = normalizeDevices({
      choice: { device: "Kiosk" },
      responsive: { width: 10, height: 20000 },
      custom: [
        kiosk,
        { ...kiosk, width: 1 },
        { name: " ", width: 300, height: 300 },
        { name: "Odd", width: 300, height: 300, dpr: 99 },
      ],
    });
    expect(d.responsive).toEqual({ width: 50, height: 9999 });
    expect(d.custom).toEqual([kiosk, { name: "Odd", width: 300, height: 300, dpr: 1, mobile: false }]);
    expect(deviceOfChoice(d)).toEqual(kiosk);
  });

  it("shows the chosen device: none to fit, Responsive's size, an added one before a preset of its name", () => {
    expect(deviceOfChoice(DEFAULT_DEVICES)).toBeNull();
    expect(deviceOfChoice({ ...DEFAULT_DEVICES, choice: "responsive" })).toMatchObject({
      width: 400,
      height: 800,
      mobile: false,
    });
    expect(deviceOfChoice({ ...DEFAULT_DEVICES, choice: { device: "iPhone SE" } })).toEqual(DEVICE_PRESETS[0]);
    const mine = { ...kiosk, name: "iPhone SE" };
    expect(deviceOfChoice({ ...DEFAULT_DEVICES, custom: [mine], choice: { device: "iPhone SE" } })).toEqual(mine);
    expect(deviceOfChoice({ ...DEFAULT_DEVICES, choice: { device: "Gone" } })).toBeNull();
  });

  it("adds a device and chooses it; removing the chosen one fits the pane again", () => {
    const added = addDevice(DEFAULT_DEVICES, kiosk);
    expect(added.choice).toEqual({ device: "Kiosk" });
    expect(addDevice(added, { ...kiosk, width: 900 }).custom).toEqual([{ ...kiosk, width: 900 }]);
    expect(removeDevice(added, "Kiosk")).toEqual({ ...DEFAULT_DEVICES });
    const other: BrowserDevices = { ...added, choice: "responsive" };
    expect(removeDevice(other, "Kiosk").choice).toBe("responsive");
  });

  it("keeps each project's devices apart, and the default as no entry", () => {
    const mine: BrowserDevices = { ...DEFAULT_DEVICES, choice: "responsive" };
    const none: { browserDevices?: Record<string, BrowserDevices> } = {};
    const s = withDevices(withDevices(none, "/a", mine), "/b", { ...mine, choice: { device: "Pixel 8" } });
    expect(devicesOf(s, "/a")).toEqual(mine);
    expect(devicesOf(s, "/c")).toEqual(DEFAULT_DEVICES);
    const back = withDevices(withDevices(s, "/a", DEFAULT_DEVICES), "/b", DEFAULT_DEVICES);
    expect(back.browserDevices).toBeUndefined();
    expect(sameDevicesByProject(s, { browserDevices: { ...s.browserDevices } })).toBe(true);
    expect(sameDevicesByProject(s, back)).toBe(false);
  });

  it("is read back from the UI state, and the default state holds none", () => {
    const raw = {
      ...DEFAULT_UI_STATE,
      browserPaneWidth: 700.4,
      browserDevices: { "/a": { choice: "responsive" }, "": {} },
    };
    const s = normalizeUiState(raw);
    expect(s.browserPaneWidth).toBe(700);
    expect(s.browserDevices).toEqual({ "/a": { ...DEFAULT_DEVICES, choice: "responsive" } });
    const plain = normalizeUiState({ ...DEFAULT_UI_STATE, browserPaneWidth: -1 });
    expect("browserPaneWidth" in plain).toBe(false);
  });
});

describe("the Browser pane's width", () => {
  it("defaults to half the area, within its own limits, keeping the list's", () => {
    expect(paneWidthFor(null, 1600, BROWSER_WIDTH)).toBe(800);
    expect(paneWidthFor(5000, 1600, BROWSER_WIDTH)).toBe(1600 - BROWSER_WIDTH.listMin);
    expect(paneWidthFor(100, 1600, BROWSER_WIDTH)).toBe(BROWSER_WIDTH.min);
    expect(stepPaneWidth(800, "ArrowLeft", 1600, BROWSER_WIDTH)).toBe(816);
  });
});

describe("what the page and host send", () => {
  it("reads a layout defensively: a bad rect hides the view, a bad device fits the pane", () => {
    const device = { width: 375.4, height: 667, dpr: 2, scale: 0.5, mobile: true };
    expect(normalizeBrowserLayout({ bounds: { x: 1, y: 2, width: 3, height: 4 }, device })).toEqual({
      bounds: { x: 1, y: 2, width: 3, height: 4 },
      device: { width: 375, height: 667, dpr: 2, scale: 0.5, mobile: true },
    });
    expect(
      normalizeBrowserLayout({ bounds: { x: 1, y: 2, width: -3, height: 4 }, device: { ...device, dpr: 0 } }),
    ).toEqual({ bounds: null, device: null });
    expect(normalizeBrowserLayout("nope")).toEqual({ bounds: null, device: null });
  });

  it("keeps a device's pixel ratio within what Chromium emulates", () => {
    const device = { width: 375, height: 667, scale: 1, mobile: false };
    const dpr = (n: number) => normalizeBrowserLayout({ bounds: null, device: { ...device, dpr: n } }).device?.dpr;
    expect([dpr(0.1), dpr(2), dpr(1e9)]).toEqual([DPR.min, 2, DPR.max]);
  });

  it("reads a page's state defensively", () => {
    expect(normalizeBrowserState({ url: "https://a.b/", canGoBack: "yes", failed: "" })).toEqual({
      url: "https://a.b/",
      title: "",
      canGoBack: false,
      canGoForward: false,
      loading: false,
      failed: null,
    });
  });
});
