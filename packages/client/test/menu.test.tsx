import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isCollapsed, renderApp, viewTitle } from "./harness.tsx";
import { item, labels, menuAt, menuButton, menus, openPath } from "./menu-harness.ts";

afterEach(cleanup);

/** The menu's structure and how it is driven: what it lists, and the keyboard and pointer. */
describe("AC5: app menu", () => {
  it("opens File, Edit, View, Go and Help, modelled on Claude's menu in Title Case, with each item's shortcut", async () => {
    const { user } = renderApp();
    await user.click(menuButton());
    expect(labels(menuAt(0))).toEqual(["File", "Edit", "View", "Go", "Help"]);

    await user.hover(item("File"));
    expect(labels(menuAt(1))).toEqual([
      "New Project…Ctrl+Shift+N",
      "Open Folder…Ctrl+O",
      "Project Settings…Ctrl+Shift+,",
      "Settings…Ctrl+,",
      "Close WindowCtrl+Shift+W",
      "Exit",
    ]);
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
    expect(labels(menuAt(1))).toEqual(["Keyboard ShortcutsCtrl+/", "Troubleshooting", "About Featra"]);
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
    expect(labels(menuAt(1))).toEqual([
      "New Project…⇧⌘N",
      "Open Folder…⌘O",
      "Project Settings…⇧⌘,",
      "Settings…⌘,",
      "Close Window⌘W",
      "Quit Featra⌘Q",
    ]);
    await user.hover(item("Edit"));
    expect(labels(menuAt(1))).toEqual(["Undo⌘Z", "Redo⇧⌘Z", "Cut⌘X", "Copy⌘C", "Paste⌘V", "Delete", "Select All⌘A"]);
    await user.hover(item("View"));
    expect(labels(menuAt(1))).toEqual([
      "Sidebar⌘B",
      "Actual Size⌘0",
      "Zoom In⌘=",
      "Zoom Out⌘-",
      "Full Screen⌃⌘F",
      "Reload⌘R",
    ]);
    await user.hover(item("Go"));
    expect(labels(menuAt(1)).slice(0, 2)).toEqual(["Back⌘[", "Forward⌘]"]);
    await openPath(user, "Help", "Troubleshooting");
    expect(labels(menuAt(2))[0]).toBe("Show Logs in Finder");
  });

  it("Linux: Exit has no shortcut, Redo is Ctrl+Shift+Z and the logs open in the file manager", async () => {
    const { user } = renderApp({ platform: "linux" });
    await openPath(user, "File");
    expect(labels(menuAt(1))).toEqual([
      "New Project…Ctrl+Shift+N",
      "Open Folder…Ctrl+O",
      "Project Settings…Ctrl+Shift+,",
      "Settings…Ctrl+,",
      "Close WindowCtrl+Shift+W",
      "Exit",
    ]);
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
    expect(document.activeElement).toBe(item(/^Keyboard Shortcuts/));
    await user.keyboard("{ArrowDown}");
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
    // File > Settings…, after New Project…, Open Folder… and Project Settings… (the separator is skipped).
    await user.keyboard("{ArrowDown}{ArrowRight}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
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
});
