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
  screen.queryByRole("menuitem", { name }) ?? screen.getByRole("menuitemcheckbox", { name });

/** Opens the menu (if closed) and hovers through the named submenus. */
async function openPath(user: UserEvent, ...names: string[]) {
  if (menus().length === 0) await user.click(menuButton());
  for (const name of names) await user.hover(item(name));
}

afterEach(cleanup);

describe("AC5: app menu", () => {
  it("opens File, Edit, View, Go and Help, modelled on Claude's menu in Title Case, with each item's shortcut", async () => {
    const { user } = renderApp();
    await user.click(menuButton());
    expect(labels(menuAt(0))).toEqual(["File", "Edit", "View", "Go", "Help"]);

    await user.hover(item("File"));
    expect(labels(menuAt(1))).toEqual(["Settings…Ctrl+,", "Close WindowCtrl+Shift+W", "Exit"]);
    await user.hover(item("Edit"));
    expect(labels(menuAt(1))).toEqual([
      "UndoCtrl+Z",
      "RedoCtrl+Y",
      "CutCtrl+X",
      "CopyCtrl+C",
      "PasteCtrl+V",
      "Delete",
      "Select AllCtrl+A",
    ]);
    await user.hover(item("View"));
    expect(labels(menuAt(1))).toEqual([
      "SidebarCtrl+B",
      "Actual SizeCtrl+0",
      "Zoom InCtrl+=",
      "Zoom OutCtrl+-",
      "Full ScreenF11",
      "ReloadF5",
    ]);
    await user.hover(item("Go"));
    expect(labels(menuAt(1))).toEqual(["BackAlt+Left", "ForwardAlt+Right", "Work", "Inbox", "Artifacts", "Plugins"]);
    await user.hover(item("Help"));
    expect(menus()).toHaveLength(2);
    expect(labels(menuAt(1))).toEqual(["Troubleshooting", "About Featra"]);
    await user.hover(item("Troubleshooting"));
    expect(labels(menuAt(2))).toEqual([
      "Show Logs in File Explorer",
      "Toggle Developer Tools",
      "Clear Cache and Restart",
      "Reset App Data…",
    ]);
  });

  it("has no Theme submenu and nothing greyed out that isn't built yet (theme moves to Settings, STORY-20)", async () => {
    const { user } = renderApp();
    const all: string[] = [];
    await user.click(menuButton());
    for (const top of ["File", "Edit", "View", "Go", "Help"]) {
      await user.hover(item(top));
      all.push(...labels(menuAt(1)).map(String));
    }
    await user.hover(item("Troubleshooting"));
    all.push(...labels(menuAt(2)).map(String));
    expect(all.join("|")).not.toMatch(/Theme|System|Light|Dark/);
    // Only Back and Forward can be greyed, and only because there is nowhere to go yet.
    const greyed = Array.from(document.querySelectorAll("[aria-disabled=true]")).map((e) => e.textContent);
    expect(greyed).toEqual([]);
    await user.hover(item("Go"));
    expect(Array.from(document.querySelectorAll("[aria-disabled=true]")).map((e) => e.textContent)).toEqual([
      "BackAlt+Left",
      "ForwardAlt+Right",
    ]);
  });

  it("uses Cmd on macOS, Quit Featra ⌘Q, and Finder for the logs", async () => {
    const { user } = renderApp({ platform: "darwin" });
    await openPath(user, "File");
    expect(labels(menuAt(1))).toEqual(["Settings…⌘,", "Close Window⌘W", "Quit Featra⌘Q"]);
    await user.hover(item("Edit"));
    expect(labels(menuAt(1))).toEqual(["Undo⌘Z", "Redo⇧⌘Z", "Cut⌘X", "Copy⌘C", "Paste⌘V", "Delete", "Select All⌘A"]);
    await user.hover(item("View"));
    expect(labels(menuAt(1))).toEqual(["Sidebar⌘B", "Actual Size⌘0", "Zoom In⌘=", "Zoom Out⌘-", "Full Screen⌃⌘F", "Reload⌘R"]);
    await user.hover(item("Go"));
    expect(labels(menuAt(1)).slice(0, 2)).toEqual(["Back⌘[", "Forward⌘]"]);
    await openPath(user, "Help", "Troubleshooting");
    expect(labels(menuAt(2))[0]).toBe("Show Logs in Finder");
  });

  it("Linux: Exit has no shortcut, Redo is Ctrl+Shift+Z and the logs open in the file manager", async () => {
    const { user } = renderApp({ platform: "linux" });
    await openPath(user, "File");
    expect(labels(menuAt(1))).toEqual(["Settings…Ctrl+,", "Close WindowCtrl+Shift+W", "Exit"]);
    await user.hover(item("Edit"));
    expect(labels(menuAt(1))[1]).toBe("RedoCtrl+Shift+Z");
    await openPath(user, "Help", "Troubleshooting");
    expect(labels(menuAt(2))[0]).toBe("Show Logs in File Manager");
  });

  it("marks submenus, the Sidebar checkmark and greyed items for assistive technology", async () => {
    const { user } = renderApp();
    await openPath(user, "Help", "Troubleshooting");
    expect(item("Help").getAttribute("aria-haspopup")).toBe("menu");
    expect(item("Help").getAttribute("aria-expanded")).toBe("true");
    expect(item("Edit").getAttribute("aria-expanded")).toBe("false");
    expect(menuAt(2).getAttribute("aria-label")).toBe("Troubleshooting");
    await user.hover(item("View"));
    expect(item(/^Sidebar/).getAttribute("role")).toBe("menuitemcheckbox");
    expect(item(/^Sidebar/).getAttribute("aria-checked")).toBe("true");
    await user.hover(item("Go"));
    expect(item(/^Back/).getAttribute("aria-disabled")).toBe("true");
    expect(item(/^Work/).hasAttribute("aria-disabled")).toBe(false);
  });

  it("View: Sidebar shows a checkmark while the sidebar is shown and hides it when chosen", async () => {
    const { user } = renderApp();
    await openPath(user, "View");
    await user.click(item(/^Sidebar/));
    expect(isCollapsed()).toBe(true);
    await openPath(user, "View");
    expect(item(/^Sidebar/).getAttribute("aria-checked")).toBe("false");
    await user.click(item(/^Sidebar/));
    expect(isCollapsed()).toBe(false);
    await openPath(user, "View");
    expect(item(/^Sidebar/).getAttribute("aria-checked")).toBe("true");
  });

  it("reaches a submenu item by keyboard: arrows, Enter, Escape", async () => {
    const { user } = renderApp();
    menuButton().focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(item("File"));
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(item("View"));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(item(/^Sidebar/));
    expect(item("View").getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowLeft}{ArrowDown}{ArrowDown}"); // back to View, then down to Help
    expect(document.activeElement).toBe(item("Help"));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(item("Troubleshooting"));
    await user.keyboard("{Enter}"); // Enter opens Troubleshooting and moves in
    expect(document.activeElement).toBe(item("Show Logs in File Explorer"));
    await user.keyboard("{Escape}"); // back to Troubleshooting
    expect(document.activeElement).toBe(item("Troubleshooting"));
    expect(menus()).toHaveLength(2);
    await user.keyboard("{ArrowLeft}"); // back to Help
    expect(document.activeElement).toBe(item("Help"));
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
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}"); // View > Sidebar
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
    const { calls, saves } = renderApp({ state: { zoomFactor: 1.25, theme: "dark" } });
    expect(calls).toEqual(["zoom:1.25", "theme:dark"]);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(saves).toEqual([]);

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
    await user.click(within(screen.getByRole("dialog", { name: "About Featra" })).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Help has no Keyboard Shortcuts item and Ctrl+/ does nothing (shortcuts live in Settings, STORY-20)", async () => {
    const { user, actions } = renderApp();
    await openPath(user, "Help");
    expect(labels(menuAt(1)).join()).not.toMatch(/Keyboard Shortcuts/i);
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}/{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions()).toEqual([]);
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
    expect(labels(menuAt(1))).toEqual(["Settings…Ctrl+,"]);
    await user.hover(item("View"));
    expect(labels(menuAt(1))).toEqual(["SidebarCtrl+B", "Actual SizeCtrl+0", "Zoom InCtrl+=", "Zoom OutCtrl+-", "ReloadF5"]);
    await user.hover(item("Help"));
    expect(labels(menuAt(1))).toEqual(["About Featra"]);
    await user.keyboard("{Escape}{Escape}{F11}{Control>}{Shift>}W{/Shift}{/Control}");
    expect(actions()).toEqual([]); // the browser keeps its own F11; a tab has no window to close
  });
});
