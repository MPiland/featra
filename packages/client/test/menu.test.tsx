import { cleanup, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { isCollapsed, renderApp, titleBar, viewTitle } from "./harness.tsx";

const menuButton = () => within(titleBar()).getByRole("button", { name: "Menu" });
const menus = () => screen.queryAllByRole("menu");
const menuAt = (depth: number) => menus()[depth] as HTMLElement;
/** Text of the items directly in a menu (not those of its open submenus): label followed by shortcut. */
const labels = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>("[role^=menuitem]"))
    .filter((i) => i.closest("[role=menu]") === menu)
    .map((i) => i.textContent);
const item = (name: string | RegExp) =>
  screen.queryByRole("menuitem", { name }) ?? screen.getByRole("menuitemradio", { name });

/** Opens the menu (if closed) and hovers through the named submenus. */
async function openPath(user: UserEvent, ...names: string[]) {
  if (menus().length === 0) await user.click(menuButton());
  for (const name of names) await user.hover(item(name));
}

afterEach(cleanup);

describe("AC5: app menu", () => {
  it("opens File, Edit, View and Help submenus and shows each item's shortcut", async () => {
    const { user } = renderApp();
    await user.click(menuButton());
    expect(labels(menuAt(0))).toEqual(["File", "Edit", "View", "Help"]);

    await user.hover(item("File"));
    expect(labels(menuAt(1))).toEqual(["Settings…Ctrl+,", "QuitCtrl+Q"]);
    await user.hover(item("Edit"));
    expect(labels(menuAt(1))).toEqual([
      "UndoCtrl+Z",
      "RedoCtrl+Y",
      "CutCtrl+X",
      "CopyCtrl+C",
      "PasteCtrl+V",
      "Select allCtrl+A",
    ]);
    await user.hover(item("View"));
    expect(labels(menuAt(1))).toEqual([
      "Toggle sidebarCtrl+B",
      "Zoom inCtrl+=",
      "Zoom outCtrl+-",
      "Reset zoomCtrl+0",
      "Theme",
    ]);
    await user.hover(item("Theme"));
    expect(labels(menuAt(2))).toEqual(["System", "Light", "Dark"]);
    await user.hover(item("Help"));
    expect(menus()).toHaveLength(2); // hovering another top-level item closes View and Theme
    expect(labels(menuAt(1))).toEqual(["About Featra", "Troubleshooting"]);
    await user.hover(item("Troubleshooting"));
    expect(labels(menuAt(2))).toEqual(["Reload window", "Toggle developer tools"]);
  });

  it("uses Cmd on macOS", async () => {
    const { user } = renderApp({ platform: "darwin" });
    await openPath(user, "File");
    expect(labels(menuAt(1))).toEqual(["Settings…⌘,", "Quit⌘Q"]);
    await user.hover(item("Edit"));
    expect(labels(menuAt(1))).toEqual(["Undo⌘Z", "Redo⇧⌘Z", "Cut⌘X", "Copy⌘C", "Paste⌘V", "Select all⌘A"]);
    await user.hover(item("View"));
    expect(labels(menuAt(1)).slice(0, 4)).toEqual(["Toggle sidebar⌘B", "Zoom in⌘=", "Zoom out⌘-", "Reset zoom⌘0"]);
  });

  it("marks submenus and radio items for assistive technology", async () => {
    const { user } = renderApp();
    await openPath(user, "View", "Theme");
    expect(item("View").getAttribute("aria-haspopup")).toBe("menu");
    expect(item("View").getAttribute("aria-expanded")).toBe("true");
    expect(item("Edit").getAttribute("aria-expanded")).toBe("false");
    expect(menuAt(2).getAttribute("aria-label")).toBe("Theme");
    expect(item("System").getAttribute("role")).toBe("menuitemradio");
  });

  it("reaches a submenu item by keyboard: arrows, Enter, Escape", async () => {
    const { user } = renderApp();
    menuButton().focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(item("File"));
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(item("View"));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(item(/^Toggle sidebar/));
    expect(item("View").getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{End}{Enter}"); // Theme: Enter opens it and moves in
    expect(document.activeElement).toBe(item("System"));
    await user.keyboard("{Escape}"); // back to Theme
    expect(document.activeElement).toBe(item("Theme"));
    expect(menus()).toHaveLength(2);
    await user.keyboard("{ArrowLeft}"); // back to View
    expect(document.activeElement).toBe(item("View"));
    expect(menus()).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(menus()).toHaveLength(0);
    expect(document.activeElement).toBe(menuButton());
  });

  it("runs an item with Enter and with Space", async () => {
    const { user } = renderApp();
    menuButton().focus();
    await user.keyboard("{ArrowDown}{ArrowRight}{Enter}"); // File > Settings…
    expect(viewTitle().textContent).toBe("Settings");
    expect(menus()).toHaveLength(0);
    expect(document.activeElement).toBe(menuButton());
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}"); // View > Toggle sidebar
    await user.keyboard(" ");
    expect(isCollapsed()).toBe(true);
  });

  it("ArrowDown on the button opens the menu; Up, Home and End wrap and jump", async () => {
    const { user } = renderApp();
    menuButton().focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("File"));
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(item("Help"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(item("File"));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(item("Help"));
  });

  it("Tab and a click outside close the menu", async () => {
    const { user } = renderApp();
    await user.click(menuButton());
    await user.keyboard("{Tab}");
    expect(menus()).toHaveLength(0);
    await user.click(menuButton());
    await user.click(viewTitle());
    expect(menus()).toHaveLength(0);
  });

  it("File: Settings… opens Settings and Quit quits; Ctrl+, opens Settings too", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "File");
    await user.click(item(/^Settings/));
    expect(viewTitle().textContent).toBe("Settings");
    expect(menus()).toHaveLength(0);
    await openPath(user, "File");
    await user.click(item(/^Quit/));
    expect(actions()).toEqual(["quit"]);

    cleanup();
    const second = renderApp();
    await second.user.keyboard("{Control>},{/Control}");
    expect(viewTitle().textContent).toBe("Settings");
  });

  it("Ctrl+Q quits on Windows and Linux; Alt+F4 is close (to the tray), so Quit never shows it", async () => {
    for (const platform of ["win32", "linux"]) {
      const { user, actions } = renderApp({ platform });
      await openPath(user, "File");
      expect(labels(menuAt(1))).toEqual(["Settings…Ctrl+,", "QuitCtrl+Q"]);
      expect(labels(menuAt(1)).join()).not.toContain("Alt+F4");
      await user.keyboard("{Escape}{Escape}{Control>}q{/Control}");
      expect(actions()).toEqual(["quit"]);
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
      ["Select all", "selectAll"],
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

  it("View: Toggle sidebar collapses the sidebar", async () => {
    const { user } = renderApp();
    await openPath(user, "View");
    await user.click(item(/^Toggle sidebar/));
    expect(isCollapsed()).toBe(true);
  });

  it("View: zoom in, out and reset step the zoom factor and save it", async () => {
    const { user, actions, saves } = renderApp();
    for (const name of [/^Zoom in/, /^Zoom in/, /^Zoom out/, /^Reset zoom/]) {
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

  it("starts at the stored zoom and theme without re-saving them", () => {
    const { calls, saves } = renderApp({ state: { zoomFactor: 1.25, theme: "dark" } });
    expect(calls).toEqual(["zoom:1.25", "theme:dark"]);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(saves).toEqual([]);
  });

  it("View: Theme pins Light or Dark over the OS, and System follows it again", async () => {
    const { user, actions, saves } = renderApp();
    await openPath(user, "View", "Theme");
    expect(item("System").getAttribute("aria-checked")).toBe("true");
    await user.click(item("Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await openPath(user, "View", "Theme");
    await user.click(item("Light"));
    expect(document.documentElement.dataset.theme).toBe("light");
    await openPath(user, "View", "Theme");
    expect(item("Light").getAttribute("aria-checked")).toBe("true");
    expect(item("System").getAttribute("aria-checked")).toBe("false");
    await user.click(item("System"));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(actions()).toEqual(["theme:dark", "theme:light", "theme:system"]);
    expect(saves.map((s) => s.theme)).toEqual(["dark", "light", "system"]);
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
    await user.click(within(screen.getByRole("dialog", { name: "About Featra" })).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Help has no Keyboard shortcuts item and Ctrl+/ does nothing (shortcuts live in Settings, STORY-20)", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "Help");
    expect(labels(menuAt(1))).not.toContain("Keyboard shortcuts");
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}/{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions()).toEqual([]);
  });

  it("Help: Troubleshooting reloads the window and toggles developer tools", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "Help", "Troubleshooting");
    await user.click(item("Reload window"));
    await openPath(user, "Help", "Troubleshooting");
    await user.click(item("Toggle developer tools"));
    expect(actions()).toEqual(["reload", "toggleDevTools"]);
  });

  it("in a plain browser tab, lists only what works there: no Quit and no Troubleshooting", async () => {
    const { user } = renderApp({ platform: "web" });
    await openPath(user, "File");
    expect(labels(menuAt(1))).toEqual(["Settings…Ctrl+,"]);
    await user.hover(item("Help"));
    expect(labels(menuAt(1))).toEqual(["About Featra"]);
  });
});
