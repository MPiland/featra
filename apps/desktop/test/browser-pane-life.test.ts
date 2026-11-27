/**
 * STORY-74: how long the Browser pane's page lives (browser-pane.ts). It closes with its window, and when the window's
 * own page reloads or crashes, as that page drove it; a closed pane leaves no listener on the window. Escape in it
 * closes the pane as Escape in the other panes does, and focusing the pane's place gives it the keyboard. Fakes only
 * Electron (browser-fakes.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { fakeWindow, platform, type FakeContents } from "./browser-fakes.ts";

vi.mock("electron", async () => (await import("./browser-fakes.ts")).fakeElectron());

const pages = await import("../src/dev-pages.ts");
platform.onContents = (contents: FakeContents) => pages.guardContents(contents as never);
const { openPane, openPanes, paneOf } = await import("../src/browser-pane.ts");
const { targetOf } = await import("../src/browser-ipc.ts");

const TARGET = { dir: "D:/p", id: "FEAT-2" };
const open = (w = fakeWindow(), key = "browser-load-1") => {
  const pane = openPane(w.win as never, key, TARGET, () => {});
  const view = platform.views.at(-1)!.view;
  return { ...w, pane, view, contents: view.webContents };
};
const navigation = (isMainFrame: boolean, isSameDocument: boolean) => ({ isMainFrame, isSameDocument });
const key = (k: string, extra: Record<string, boolean> = {}) => ({
  type: "keyDown",
  key: k,
  shift: false,
  control: false,
  alt: false,
  meta: false,
  ...extra,
});

describe("the pane's page, while the window's page lives", () => {
  it("knows its project and the story or feature it shows, for an agent's tool (STORY-40)", () => {
    const { pane } = open();
    expect([pane.dir, pane.id]).toEqual(["D:/p", "FEAT-2"]);
  });

  // Regression (STORY-74 review): a reload of the window left the view on screen, over a page that no longer knew it.
  it("closes when the window's page loads again, but not for its own in-page or frame navigations", () => {
    const { page, contents, children, view, win } = open();
    page.emit("did-start-navigation", navigation(true, true));
    page.emit("did-start-navigation", navigation(false, false));
    expect(contents.destroyed).toBe(false);
    page.emit("did-start-navigation", navigation(true, false));
    expect(contents.destroyed).toBe(true);
    expect(children.has(view)).toBe(false);
    expect(paneOf(win as never, "browser-load-1")).toBeNull();
  });

  it("closes when the window's page crashes", () => {
    const { page, contents } = open();
    page.emit("render-process-gone", {}, { reason: "crashed" });
    expect(contents.destroyed).toBe(true);
  });

  it("leaves no listener on the window once closed", () => {
    const w = fakeWindow();
    const { pane } = open(w);
    expect(w.page.listenerCount("did-start-navigation")).toBe(1);
    expect(w.events.listenerCount("closed")).toBe(1);
    (pane as unknown as { close: () => void }).close();
    expect(w.page.listenerCount("did-start-navigation")).toBe(0);
    expect(w.page.listenerCount("render-process-gone")).toBe(0);
    expect(w.events.listenerCount("closed")).toBe(0);
    expect(openPanes()).not.toContain(pane);
  });

  it("tells the window when Escape is pressed in it, and nothing for other keys", () => {
    const { contents, sent } = open();
    contents.emit("before-input-event", {}, key("Escape", { shift: true }));
    contents.emit("before-input-event", {}, key("a"));
    contents.emit("before-input-event", {}, { ...key("Escape"), type: "keyUp" });
    expect(sent.filter(([channel]) => channel === "browser:escape")).toEqual([]);
    contents.emit("before-input-event", {}, key("Escape"));
    expect(sent.filter(([channel]) => channel === "browser:escape")).toEqual([["browser:escape", "browser-load-1"]]);
  });

  it("takes the keyboard when focused", () => {
    const { pane, contents } = open();
    pane.focus();
    expect(contents.focused).toBe(1);
  });
});

describe("what a pane shows, as the page sends it", () => {
  it("is a project folder and a card id, or nothing", () => {
    expect(targetOf({ dir: "D:/p", id: "STORY-1" })).toEqual({ dir: "D:/p", id: "STORY-1" });
    expect(targetOf({ dir: "", id: "STORY-1" })).toBeNull();
    expect(targetOf({ dir: "D:/p", id: 4 })).toBeNull();
    expect(targetOf({ dir: "D:/p", id: "x".repeat(101) })).toBeNull();
    expect(targetOf("D:/p")).toBeNull();
  });
});
