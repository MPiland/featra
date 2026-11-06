import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isCollapsed, renderApp, viewTitle } from "./harness.tsx";
import { item, labels, menuAt, menus, openPath } from "./menu-harness.ts";

afterEach(cleanup);

/** What each menu item does, from the menu and from its shortcut. */
describe("AC5: app menu", () => {
  it("File: Settings… opens Settings, Close Window closes (to the tray) and Exit exits", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "File");
    await user.click(item(/^Settings/));
    expect(viewTitle().textContent).toBe("Settings");
    expect(menus()).toHaveLength(0);
    await openPath(user, "File");
    await user.click(item(/^Close Window/));
    await openPath(user, "File");
    await user.click(item("Exit"));
    expect(actions()).toEqual(["close", "quit"]);
  });

  it("Ctrl+, opens Settings and Ctrl+Shift+W closes the window from the keyboard", async () => {
    const { user, actions } = renderApp();
    await user.keyboard("{Control>},{/Control}");
    expect(viewTitle().textContent).toBe("Settings");
    await user.keyboard("{Control>}{Shift>}W{/Shift}{/Control}");
    expect(actions()).toEqual(["close"]);
    await user.keyboard("{Control>}w{/Control}"); // Ctrl+W alone does nothing
    expect(actions()).toEqual(["close"]);
  });

  it("Ctrl+Q does nothing on Windows and Linux: Exit has no shortcut, and Alt+F4 is close (to the tray)", async () => {
    for (const platform of ["win32", "linux"]) {
      const { user, actions } = renderApp({ platform });
      await openPath(user, "File");
      expect(labels(menuAt(1)).at(-1)).toBe("Exit");
      expect(labels(menuAt(1)).join()).not.toMatch(/Ctrl\+Q|Alt\+F4/);
      await user.keyboard("{Escape}{Escape}{Control>}q{/Control}");
      expect(actions()).toEqual([]);
      cleanup();
    }
  });

  it("Edit items run on the field that had focus when the menu was opened", async () => {
    const { user, actions } = renderApp();
    const field = document.createElement("input");
    field.id = "field";
    screen.getByRole("main").append(field);
    const commands = [
      ["Undo", "undo"],
      ["Redo", "redo"],
      ["Cut", "cut"],
      ["Copy", "copy"],
      ["Paste", "paste"],
      ["Delete", "delete"],
      ["Select All", "selectAll"],
    ] as const;
    for (const [name, command] of commands) {
      await user.click(field);
      await openPath(user, "Edit");
      await user.click(item(new RegExp(`^${name}`)));
      expect(actions().at(-1)).toBe(`edit:${command}:field`);
      expect(document.activeElement).toBe(field);
    }
    expect(actions()).toHaveLength(commands.length);
  });

  it("View: Actual Size, Zoom In and Zoom Out step the zoom factor and save it", async () => {
    const { user, actions, saves } = renderApp();
    for (const name of [/^Zoom In/, /^Zoom In/, /^Zoom Out/, /^Actual Size/]) {
      await openPath(user, "View");
      await user.click(item(name));
    }
    expect(actions()).toEqual(["zoom:1.1", "zoom:1.25", "zoom:1.1", "zoom:1"]);
    expect(saves.map((s) => s.zoomFactor)).toEqual([1.1, 1.25, 1.1, 1]);
  });

  it("Ctrl+=, Ctrl+- and Ctrl+0 zoom from the keyboard", async () => {
    const { user, actions } = renderApp({ state: { zoomFactor: 1.5 } });
    await user.keyboard("{Control>}={/Control}{Control>}-{/Control}{Control>}-{/Control}{Control>}0{/Control}");
    expect(actions()).toEqual(["zoom:1.75", "zoom:1.5", "zoom:1.25", "zoom:1"]);
  });

  it("Ctrl+B toggles the sidebar from the keyboard", async () => {
    const { user } = renderApp();
    await user.keyboard("{Control>}b{/Control}");
    expect(isCollapsed()).toBe(true);
    await user.keyboard("{Control>}b{/Control}");
    expect(isCollapsed()).toBe(false);
  });

  it("starts at the stored zoom and theme without re-saving them; the default theme follows the OS", () => {
    const { calls, saves, appSaved } = renderApp({ state: { zoomFactor: 1.25 }, settings: { theme: "dark" } });
    expect(calls).toEqual(["zoom:1.25", "theme:dark"]);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(saves).toEqual([]);
    expect(appSaved()).toEqual([]);

    cleanup();
    const fresh = renderApp();
    expect(fresh.calls).toEqual(["zoom:1", "theme:system"]);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("View: Full Screen and Reload, from the menu and from F11 and F5", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "View");
    await user.click(item(/^Full Screen/));
    await openPath(user, "View");
    await user.click(item(/^Reload/));
    await user.keyboard("{F11}{F5}");
    expect(actions()).toEqual(["fullScreen", "reload", "fullScreen", "reload"]);
  });

  it("Go: opens the sidebar's views, and Back and Forward work once there is somewhere to go", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "Go");
    await user.click(item(/^Back/)); // greyed: ignored, and the menu stays open
    expect(menus()).toHaveLength(2);
    await user.click(item("Inbox"));
    expect(viewTitle().textContent).toBe("Inbox");
    await openPath(user, "Go");
    await user.click(item("Artifacts"));
    await openPath(user, "Go");
    expect(item(/^Back/).hasAttribute("aria-disabled")).toBe(false);
    expect(item(/^Forward/).getAttribute("aria-disabled")).toBe("true");
    await user.click(item(/^Back/));
    expect(viewTitle().textContent).toBe("Inbox");
    await openPath(user, "Go");
    await user.click(item(/^Forward/));
    expect(viewTitle().textContent).toBe("Artifacts");
    for (const view of ["Plugins", "Work"]) {
      await openPath(user, "Go");
      await user.click(item(view));
      expect(viewTitle().textContent).toBe(view);
    }
    expect(actions()).toEqual([]);
  });

  it("Alt+Left and Alt+Right go back and forward from the keyboard", async () => {
    const { user } = renderApp();
    await openPath(user, "Go");
    await user.click(item("Plugins"));
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(viewTitle().textContent).toBe("Work");
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(viewTitle().textContent).toBe("Plugins");
  });

  it("Help: About Featra shows the name, version and MIT licence in a modal dialog", async () => {
    const { user } = renderApp();
    await openPath(user, "Help");
    await user.click(item("About Featra"));
    const dialog = screen.getByRole("dialog", { name: "About Featra" });
    expect(await within(dialog).findByText("Version 1.2.3")).toBeTruthy();
    expect(within(dialog).getByText("Featra")).toBeTruthy();
    expect(within(dialog).getByText(/MIT licence/)).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector(".shell")!.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    await user.keyboard("{Tab}");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".shell")!.hasAttribute("inert")).toBe(false);

    await openPath(user, "Help");
    await user.click(item("About Featra"));
    await user.click(
      within(screen.getByRole("dialog", { name: "About Featra" })).getByRole("button", { name: "Close" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Help: Troubleshooting shows the logs, toggles developer tools and clears the cache", async () => {
    const { user, actions } = renderApp();
    for (const name of ["Show Logs in File Explorer", "Toggle Developer Tools", "Clear Cache and Restart"]) {
      await openPath(user, "Help", "Troubleshooting");
      await user.click(item(name));
    }
    expect(actions()).toEqual(["showLogs", "toggleDevTools", "clearCacheAndRestart"]);
  });

  it("Help: Reset App Data… asks first; Cancel (focused) keeps the data and Reset and Restart resets", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "Help", "Troubleshooting");
    await user.click(item("Reset App Data…"));
    let dialog = screen.getByRole("dialog", { name: "Reset App Data?" });
    expect(within(dialog).getByText(/projects and their files are not touched/)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions()).toEqual([]);

    await openPath(user, "Help", "Troubleshooting");
    await user.click(item("Reset App Data…"));
    await user.keyboard("{Escape}");
    expect(actions()).toEqual([]);

    await openPath(user, "Help", "Troubleshooting");
    await user.click(item("Reset App Data…"));
    dialog = screen.getByRole("dialog", { name: "Reset App Data?" });
    await user.click(within(dialog).getByRole("button", { name: "Reset and Restart" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions()).toEqual(["resetAppData"]);
  });

  it("in a plain browser tab, lists only what works there: no Close Window, Exit, Full Screen or Troubleshooting", async () => {
    const { user, actions } = renderApp({ platform: "web" });
    await openPath(user, "File");
    // A tab has no folders to create or open; Project Settings… still opens the Project page (STORY-19).
    expect(labels(menuAt(1))).toEqual(["Project Settings…Ctrl+Shift+,", "Settings…Ctrl+,"]);
    await user.hover(item("View"));
    expect(labels(menuAt(1))).toEqual([
      "SidebarCtrl+B",
      "Actual SizeCtrl+0",
      "Zoom InCtrl+=",
      "Zoom OutCtrl+-",
      "ReloadF5",
    ]);
    await user.hover(item("Help"));
    expect(labels(menuAt(1))).toEqual(["Keyboard ShortcutsCtrl+/", "About Featra"]);
    await user.keyboard("{Escape}{Escape}{F11}{Control>}{Shift>}W{/Shift}{/Control}");
    await user.keyboard("{Control>}o{/Control}{Control>}{Shift>}N{/Shift}{/Control}");
    // The browser keeps its own F11, Ctrl+O and Ctrl+Shift+N; a tab has no window to close.
    expect(actions()).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
