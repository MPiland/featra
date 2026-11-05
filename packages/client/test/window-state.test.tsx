import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { browserBridge, sizeButtonAction, sizeButtonFor } from "../src/bridge.ts";
import { renderApp, titleBar } from "./harness.tsx";

afterEach(cleanup);

const NORMAL = { maximized: false, fullScreen: false };
const MAXIMIZED = { maximized: true, fullScreen: false };
// The OS can report a full-screen window as maximized too; full screen wins.
const FULL = { maximized: false, fullScreen: true };
const FULL_FROM_MAXIMIZED = { maximized: true, fullScreen: true };

/** The window control between Minimize and Close. */
const sizeButton = () => {
  const buttons = within(titleBar()).getAllByRole("button");
  return buttons[buttons.findIndex((b) => b.getAttribute("aria-label") === "Minimize") + 1]!;
};
const icon = () => sizeButton().querySelector("svg")!.getAttribute("data-icon");

async function fullScreenItem(user: ReturnType<typeof renderApp>["user"]) {
  await user.click(screen.getByRole("button", { name: "Menu" }));
  await user.hover(screen.getByRole("menuitem", { name: "View" }));
  return screen.getByRole("menuitemcheckbox", { name: /^Full Screen/ });
}

describe("BUG-1: the maximize button follows the window's state", () => {
  it("in full screen it leaves full screen, whatever the maximized flag says; otherwise it toggles maximize", () => {
    expect(sizeButtonAction(FULL)).toBe("leaveFullScreen");
    expect(sizeButtonAction(FULL_FROM_MAXIMIZED)).toBe("leaveFullScreen");
    expect(sizeButtonAction(MAXIMIZED)).toBe("unmaximize");
    expect(sizeButtonAction(NORMAL)).toBe("maximize");
  });

  it("is labelled Maximize, Restore Down (Restore on Linux) or Exit Full Screen, with the matching icon", () => {
    expect(sizeButtonFor(NORMAL, "win32")).toEqual({ label: "Maximize", icon: "maximize" });
    expect(sizeButtonFor(MAXIMIZED, "win32")).toEqual({ label: "Restore Down", icon: "restore" });
    expect(sizeButtonFor(MAXIMIZED, "linux")).toEqual({ label: "Restore", icon: "restore" });
    expect(sizeButtonFor(FULL, "win32")).toEqual({ label: "Exit Full Screen", icon: "restore" });
    expect(sizeButtonFor(FULL_FROM_MAXIMIZED, "linux")).toEqual({ label: "Exit Full Screen", icon: "restore" });
  });

  it("the title bar's button shows the label, tooltip and icon for every state the host reports", () => {
    const { setWindowState } = renderApp();
    expect(sizeButton()).toHaveProperty("ariaLabel", "Maximize");
    expect(icon()).toBe("maximize");
    for (const [state, label, glyph] of [
      [MAXIMIZED, "Restore Down", "restore"],
      [FULL_FROM_MAXIMIZED, "Exit Full Screen", "restore"],
      [MAXIMIZED, "Restore Down", "restore"],
      [FULL, "Exit Full Screen", "restore"],
      [NORMAL, "Maximize", "maximize"],
    ] as const) {
      setWindowState(state);
      expect(sizeButton().getAttribute("aria-label")).toBe(label);
      expect(sizeButton().getAttribute("data-tip")).toBe(label);
      expect(icon()).toBe(glyph);
    }
  });

  it("asks the host to act on a click; the host decides from the real window (see sizeButtonAction)", async () => {
    const { user, actions, setWindowState } = renderApp();
    setWindowState(FULL);
    await user.click(screen.getByRole("button", { name: "Exit Full Screen" }));
    expect(actions()).toEqual(["toggleMaximize"]);
  });

  it("View > Full Screen is checked while the window is full screen, and follows changes from anywhere", async () => {
    const { user, setWindowState } = renderApp();
    expect(await fullScreenItem(user)).toHaveProperty("ariaChecked", "false");
    setWindowState(FULL);
    expect(screen.getByRole("menuitemcheckbox", { name: /^Full Screen/ }).getAttribute("aria-checked")).toBe("true");
    setWindowState(NORMAL);
    expect(screen.getByRole("menuitemcheckbox", { name: /^Full Screen/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("a plain browser tab reports a normal window and never changes", async () => {
    const b = browserBridge(window.localStorage);
    expect(await b.window.state()).toEqual(NORMAL);
    const off = b.window.onStateChange(() => {
      throw new Error("no window to change");
    });
    off();
  });
});
