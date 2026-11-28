/**
 * STORY-74: how long the Browser pane's page lives (browser-pane.ts). It closes with its window, and when the window's
 * own page reloads or crashes, as that page drove it; a closed pane leaves no listener on the window. Escape in it
 * closes the pane as Escape in the other panes does, and focusing the pane's place gives it the keyboard. Fakes only
 * Electron (browser-fakes.ts).
 */
import { describe, expect, it, vi, type Mock } from "vitest";
import { fakeWindow, platform, type FakeContents } from "./browser-fakes.ts";

vi.mock("electron", async () => (await import("./browser-fakes.ts")).fakeElectron());

const pages = await import("../src/dev-pages.ts");
platform.onContents = (contents: FakeContents) => pages.guardContents(contents as never);
const { openPane, openPanes, paneOf } = await import("../src/browser-pane.ts");
const { registerBrowserIpc, targetOf } = await import("../src/browser-ipc.ts");
const { ipcMain, BrowserWindow } = await import("electron");

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

  // STORY-75: Escape leaves Annotate before it closes anything; the window takes the keyboard back to ask first.
  it("leaves Annotate on Escape, before telling the window, which takes the keyboard back", async () => {
    const { pane, contents, sent, focus } = open();
    await pane.annotations.annotate(true);
    const e = { prevented: false, preventDefault: () => void (e.prevented = true) };
    contents.emit("before-input-event", e, key("Escape"));
    expect(e.prevented).toBe(true);
    expect(pane.annotations.state().annotating).toBe(false);
    expect(sent.filter(([channel]) => channel === "browser:escape")).toEqual([]);
    expect(sent.at(-1)).toEqual([
      "browser:annotations",
      "browser-load-1",
      { annotating: false, list: [], editing: null, capturing: false, shots: {} },
    ]);
    contents.emit("before-input-event", {}, key("Escape"));
    expect(focus.count).toBe(1);
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

describe("the page's Annotate calls (STORY-75)", () => {
  type Handler = (e: unknown, ...args: unknown[]) => void;
  // The fake's `ipcMain.on`, which records each handler the app registers.
  const ipc = ipcMain as unknown as { on: Mock<(channel: string, h: Handler) => void> };
  const handlers = () => {
    ipc.on.mockClear();
    registerBrowserIpc(() => {});
    return new Map(ipc.on.mock.calls);
  };

  it("drive the window's own pane by key, with ids and text checked", async () => {
    const w = fakeWindow();
    const { pane } = open(w, "browser-ipc-1");
    const fromWindow = vi.fn<() => typeof w.win>(() => w.win);
    Object.assign(BrowserWindow, { fromWebContents: fromWindow });
    const h = handlers();
    const call = (channel: string, ...args: unknown[]) => h.get(channel)!({ sender: {} }, ...args);
    call("browser:annotate", "browser-ipc-1", true);
    await new Promise<void>((r) => setImmediate(r));
    expect(pane.annotations.state().annotating).toBe(true);
    call("browser:annotate", "browser-other", false);
    call("browser:annotate", "browser-ipc-1", "yes");
    expect(pane.annotations.state().annotating).toBe(false);
    const edit = vi.spyOn(pane.annotations, "edit");
    const comment = vi.spyOn(pane.annotations, "comment");
    const remove = vi.spyOn(pane.annotations, "remove");
    call("browser:annotation-edit", "browser-ipc-1", "a1");
    call("browser:annotation-edit", "browser-ipc-1", 7);
    call("browser:annotation-comment", "browser-ipc-1", "a1", "Bigger");
    call("browser:annotation-comment", "browser-ipc-1", "a1", { html: "<b>" });
    call("browser:annotation-comment", "browser-ipc-1", "x".repeat(101), "Bigger");
    call("browser:annotation-remove", "browser-ipc-1", "a1");
    call("browser:annotation-remove", "browser-ipc-1", null);
    expect(edit.mock.calls).toEqual([["a1"], [null]]);
    expect(comment.mock.calls).toEqual([["a1", "Bigger"]]);
    expect(remove.mock.calls).toEqual([["a1"]]);
  });
});
