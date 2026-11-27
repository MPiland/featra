/**
 * STORY-74: the Browser pane's page in the main window (browser-pane.ts, browser-emulation.ts, ADR 0047). It is a view
 * of its own, sandboxed without Node in a session apart from the app's, laid out where the page says at the window's
 * zoom; it goes to any web address but no other scheme; its device is shown through the DevTools Protocol; and a
 * closed pane's late calls touch nothing. Fakes only Electron (browser-fakes.ts): its window, view, contents, debugger
 * and session.
 */
import { describe, expect, it, vi } from "vitest";
import { fakeWindow, platform, type FakeContents } from "./browser-fakes.ts";

vi.mock("electron", async () => (await import("./browser-fakes.ts")).fakeElectron());

const pages = await import("../src/dev-pages.ts");
platform.onContents = (contents: FakeContents) => pages.guardContents(contents as never);
const { BROWSER_PARTITION, closePane, openPane, openPanes, paneOf } = await import("../src/browser-pane.ts");
const { emulationCommands } = await import("../src/browser-emulation.ts");

const TARGET = { dir: "D:/p", id: "STORY-1" };
const log = () => {};
const open = (w = fakeWindow(), key = "browser-1") => {
  const pane = openPane(w.win as never, key, TARGET, log);
  const view = platform.views.at(-1)!.view;
  return { ...w, pane, view, contents: view.webContents };
};
/** Lets the emulation queue run. */
const settle = () => new Promise<void>((r) => setImmediate(r));

describe("the pane's page", () => {
  it("is a view of its own in the window, without Node, in a session apart, hidden until laid out", () => {
    const { children, view } = open();
    expect(platform.views.at(-1)!.options).toEqual({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: BROWSER_PARTITION },
    });
    expect(BROWSER_PARTITION).not.toBe(pages.DEV_PARTITION);
    expect(BROWSER_PARTITION).not.toBe("featra");
    expect(platform.partitions).toContain(BROWSER_PARTITION);
    expect(children.has(view)).toBe(true);
    expect(view.visible).toBe(false);
  });

  it("grants no permission and takes no download", () => {
    open();
    const decided: boolean[] = [];
    for (const p of ["media", "notifications", "geolocation"]) platform.request?.({}, p, (ok) => decided.push(ok));
    expect(decided).toEqual([false, false, false]);
    expect(platform.check?.()).toBe(false);
    expect(platform.downloads).toEqual([true]);
  });

  it("is laid out where the page says, in the window's pixels, and hidden with no room", () => {
    const { pane, view } = open(fakeWindow(1.25));
    pane.layout({ bounds: { x: 100, y: 40, width: 400, height: 300 }, device: null });
    expect(view.bounds).toEqual({ x: 125, y: 50, width: 500, height: 375 });
    expect(view.visible).toBe(true);
    expect(pane.bounds()).toEqual({ x: 125, y: 50, width: 500, height: 375 });
    pane.layout({ bounds: null, device: null });
    expect(view.visible).toBe(false);
    expect(pane.bounds()).toBeNull();
  });

  it("goes to any web address, and nowhere else", () => {
    const { pane, contents } = open();
    expect(pane.navigate("https://example.com/a")).toBe(true);
    expect(pane.navigate("file:///etc/passwd")).toBe(false);
    expect(pane.navigate("javascript:alert(1)")).toBe(false);
    expect(pane.navigate("http://user:pw@example.com/")).toBe(false);
    expect(contents.loads).toEqual(["https://example.com/a"]);
    expect(pages.mayNavigate(contents as never, "https://other.example/")).toBe(true);
    expect(pages.mayNavigate(contents as never, "chrome://settings")).toBe(false);
  });

  it("opens a page's new window in itself, and no window", () => {
    const { contents } = open();
    contents.url = "https://example.com/list";
    const own = { referrer: { url: "https://example.com/list" } };
    const handler = contents.setWindowOpenHandler.mock.calls[0]![0];
    expect(handler({ url: "https://example.com/new", disposition: "foreground-tab", ...own })).toEqual({
      action: "deny",
    });
    expect(handler({ url: "file:///x", disposition: "foreground-tab", ...own })).toEqual({ action: "deny" });
    expect(contents.loads).toEqual(["https://example.com/new"]);
  });

  // Regression (STORY-74 review): any frame's window.open, of any kind, took the pane anywhere.
  it("follows only a new tab or window its own page asked for", () => {
    const { contents } = open();
    contents.url = "https://example.com/list";
    const handler = contents.setWindowOpenHandler.mock.calls[0]![0];
    const ask = (disposition: string, referrer: string) =>
      handler({ url: "https://example.com/next", disposition, referrer: { url: referrer } });
    ask("new-window", "https://example.com/list");
    ask("background-tab", "https://example.com/list");
    ask("other", "https://example.com/list");
    ask("foreground-tab", "https://ads.example.net/frame");
    ask("foreground-tab", "");
    expect(contents.loads).toEqual(["https://example.com/next"]);
  });

  it("tells the window its state as it loads, and why a load failed", () => {
    const { contents, sent } = open();
    contents.url = "http://localhost:5173/";
    contents.emit("did-stop-loading");
    expect(sent.at(-1)).toEqual([
      "browser:state",
      "browser-1",
      {
        url: "http://localhost:5173/",
        title: "Fixture",
        canGoBack: true,
        canGoForward: false,
        loading: false,
        failed: null,
      },
    ]);
    contents.emit("did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", "https://x.invalid/", true);
    expect((sent.at(-1)![2] as { failed: string }).failed).toBe("ERR_NAME_NOT_RESOLVED");
    const before = sent.length;
    contents.emit("did-fail-load", {}, -3, "ERR_ABORTED", "https://x/", true);
    contents.emit("did-fail-load", {}, -105, "ERR", "https://x/frame", false);
    expect(sent).toHaveLength(before);
    contents.emit("did-start-loading");
    expect((sent.at(-1)![2] as { failed: string | null }).failed).toBeNull();
  });

  it("is driven only by its key; a closed pane's late calls touch nothing, and the next pane replaces it", () => {
    const w = fakeWindow();
    const first = open(w, "browser-1");
    expect(paneOf(w.win as never, "browser-1")).toBe(first.pane);
    expect(paneOf(w.win as never, "browser-0")).toBeNull();
    const second = open(w, "browser-2");
    expect(first.contents.destroyed).toBe(true);
    expect(w.children.has(first.view)).toBe(false);
    closePane(w.win as never, "browser-1");
    expect(second.contents.destroyed).toBe(false);
    expect(openPanes()).toContain(second.pane);
    closePane(w.win as never, "browser-2");
    expect(second.contents.destroyed).toBe(true);
    expect(paneOf(w.win as never, "browser-2")).toBeNull();
  });

  it("closes with its window", () => {
    const w = fakeWindow();
    const { contents } = open(w, "browser-9");
    w.events.emit("closed");
    expect(contents.destroyed).toBe(true);
  });

  it("goes back, reloads, and captures a region for an annotation", async () => {
    const { pane, contents } = open();
    pane.back();
    pane.reload();
    expect(contents.navigationHistory.back).toBe(1);
    expect(contents.reload).toHaveBeenCalledOnce();
    await pane.capture({ x: 0, y: 0, width: 10, height: 10 });
    expect(contents.capturePage).toHaveBeenCalledWith({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe("the device it shows", () => {
  const phone = { width: 375, height: 667, dpr: 2, mobile: true, scale: 0.5 };

  it("is the device's viewport, screen, pixel ratio and touch, at its scale times the window's zoom", () => {
    expect(emulationCommands(phone, 1.5)).toEqual([
      [
        "Emulation.setDeviceMetricsOverride",
        {
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
          mobile: true,
          scale: 0.75,
          screenWidth: 375,
          screenHeight: 667,
          // The view keeps its size: else Chromium sizes the page's surface to the device and the view shrinks it again.
          dontSetVisibleSize: true,
        },
      ],
      ["Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }],
      ["Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" }],
    ]);
    expect(emulationCommands({ ...phone, mobile: false }, 1)[1]).toEqual([
      "Emulation.setTouchEmulationEnabled",
      { enabled: false },
    ]);
    expect(emulationCommands(null, 1)[0]).toEqual(["Emulation.clearDeviceMetricsOverride", {}]);
  });

  it("is sent once per change, in order, and again on a new document", async () => {
    const { pane, contents } = open();
    const bounds = { x: 0, y: 0, width: 400, height: 700 };
    pane.layout({ bounds, device: phone });
    pane.layout({ bounds, device: phone });
    pane.layout({ bounds, device: null });
    await settle();
    expect(contents.attached).toBe(true);
    expect(contents.commands.map(([m]) => m)).toEqual([
      "Emulation.setDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setEmitTouchEventsForMouse",
      "Emulation.clearDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setEmitTouchEventsForMouse",
    ]);
    pane.layout({ bounds, device: phone });
    await settle();
    const count = contents.commands.length;
    contents.emit("did-navigate");
    await settle();
    expect(contents.commands.slice(count).map(([m]) => m)).toEqual([
      "Emulation.setDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Emulation.setEmitTouchEventsForMouse",
    ]);
  });
});
