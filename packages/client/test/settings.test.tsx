import { cleanup, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@featra/work-format";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORK_SETTINGS, NO_TRAY_REASON, WORK_SETTINGS } from "../src/bridge.ts";
import { buildAppMenu, filterShortcuts, listShortcuts, type MenuActions } from "../src/menu.ts";
import { shortcutLabel, type ShortcutId } from "../src/shortcuts.ts";
import { PROJECT, renderApp, sidebar, titleBar, viewTitle } from "./harness.tsx";

afterEach(cleanup);

const main = () => screen.getByRole("main");
const pageNav = () => within(main()).getByRole("navigation", { name: "Settings pages" });
const pageTitle = () => within(main()).getByRole("heading", { level: 2 }).textContent;
const radios = (group: string) => within(screen.getByRole("radiogroup", { name: group })).getAllByRole("radio");
const checked = (group: string) =>
  (radios(group).find((r) => (r as HTMLInputElement).checked)?.closest("label")?.textContent ?? null);
const row = (control: HTMLElement) => control.closest(".setting") as HTMLElement;

async function openSettings(user: UserEvent, page?: string) {
  await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
  if (page) await user.click(within(pageNav()).getByRole("button", { name: page }));
}

describe("AC1: App and Project scopes; the project picker starts on the current project", () => {
  it("lists the App pages and the Project page in two scopes", async () => {
    const { user } = renderApp();
    await openSettings(user);
    const scopes = within(pageNav()).getAllByRole("list");
    expect(scopes.map((l) => l.getAttribute("aria-labelledby")).map((id) => document.getElementById(id!)!.textContent)).toEqual([
      "App",
      "Project",
    ]);
    expect(within(scopes[0]!).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "General",
      "Appearance",
      "Work defaults",
      "Keyboard shortcuts",
    ]);
    expect(within(scopes[1]!).getAllByRole("button").map((b) => b.textContent)).toEqual(["Work"]);
    expect(pageTitle()).toBe("General");
  });

  it("the Project scope's picker defaults to the current project and lists only it (the project list is STORY-19)", async () => {
    const { user } = renderApp();
    await openSettings(user, "Work");
    const picker = screen.getByRole("combobox", { name: "Project" }) as HTMLSelectElement;
    expect(picker.value).toBe(PROJECT.dir);
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual([PROJECT.name]);
  });

  it("says so when no project is open, instead of showing settings that can't be saved anywhere", async () => {
    const { user } = renderApp({ project: null });
    await openSettings(user, "Work");
    expect(screen.queryByRole("combobox", { name: "Project" })).toBeNull();
    expect(within(main()).getByText(/No project is open/)).toBeTruthy();
  });
});

describe("AC3: a project value that overrides an app default is labelled and can be reset", () => {
  it("shows the app default where the project sets nothing, and Override with the default where it does", async () => {
    const { user } = renderApp({ projectFiles: { [PROJECT.dir]: { progress: "tasks" } } });
    await openSettings(user, "Work");
    const progress = screen.getByRole("radiogroup", { name: "Progress counts" });
    await within(progress).findByText("Override");
    expect(checked("Progress counts")).toBe("Tasks");
    expect(within(progress).getByText("App default: Stories")).toBeTruthy();
    const accept = screen.getByRole("checkbox", { name: "Stories need my Accept to be Done" });
    expect(within(row(accept)).queryByText("Override")).toBeNull();
    expect(within(row(accept)).getByText("App default")).toBeTruthy();
    expect(accept.getAttribute("aria-describedby")).toContain("project-requireAccept-status");
  });

  it("changing a project value makes it an override; Reset removes it and the app default applies again", async () => {
    const { user, projectFiles } = renderApp();
    await openSettings(user, "Work");
    const accept = await screen.findByRole("checkbox", { name: "Stories need my Accept to be Done" });
    await user.click(accept);
    await within(row(accept)).findByText("Override");
    expect(projectFiles.get(PROJECT.dir)).toEqual({ requireAccept: false });
    expect((accept as HTMLInputElement).checked).toBe(false);
    expect(within(row(accept)).getByText("App default: On")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reset Stories need my Accept to be Done to the app default" }));
    await within(row(accept)).findByText("App default");
    expect(projectFiles.get(PROJECT.dir)).toEqual({});
    expect((accept as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(accept); // focus stays on the setting when its Reset button goes
  });

  it("a change shows at once, before the config file is written (regression: the choice looked ignored)", async () => {
    const { user, projectFiles, releaseWrites } = renderApp({ slowProjectWrites: true });
    await openSettings(user, "Work");
    const progress = await screen.findByRole("radiogroup", { name: "Progress counts" });
    await within(progress).findAllByText("App default");
    await user.click(within(progress).getByRole("radio", { name: "Tasks" }));
    expect(checked("Progress counts")).toBe("Tasks");
    expect(within(progress).getByText("Override")).toBeTruthy();
    expect(projectFiles.get(PROJECT.dir)).toBeUndefined();
    await releaseWrites();
    expect(projectFiles.get(PROJECT.dir)).toEqual({ progress: "tasks" });
    expect(checked("Progress counts")).toBe("Tasks");
  });

  it("a project that doesn't override a setting follows the app default as it changes", async () => {
    const { user } = renderApp({ settings: { work: { ...DEFAULT_WORK_SETTINGS, knowledge: "read-only" } } });
    await openSettings(user, "Work");
    await within(screen.getByRole("radiogroup", { name: "Agents and project knowledge" })).findAllByText("App default");
    expect(checked("Agents and project knowledge")).toBe("Only read it");
  });

  it("changing an app default saves it in the app settings, not the project", async () => {
    const { user, appSaved, projectFiles } = renderApp();
    await openSettings(user, "Work defaults");
    expect(within(main()).getByText(/Every project uses these unless its own settings override them/)).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Tasks" }));
    expect(appSaved().at(-1)!.work).toEqual({ ...DEFAULT_WORK_SETTINGS, progress: "tasks" });
    expect(projectFiles.size).toBe(0);
    await user.click(within(pageNav()).getByRole("button", { name: "Work" }));
    await within(screen.getByRole("radiogroup", { name: "Progress counts" })).findByText("App default");
    expect(checked("Progress counts")).toBe("Tasks");
  });

  it("a project whose config file can't be read shows why and offers nothing to change", async () => {
    const { user } = renderApp({ brokenProjects: { [PROJECT.dir]: "progress must be \"stories\" or \"tasks\"" } });
    await openSettings(user, "Work");
    expect((await screen.findByRole("alert")).textContent).toMatch(/can't change this project's settings: progress must be/);
    for (const r of radios("Progress counts")) expect((r as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Stories need my Accept to be Done" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("Featra's own work defaults are work-format's project defaults", () => {
    for (const def of WORK_SETTINGS) expect(DEFAULT_WORK_SETTINGS[def.key]).toEqual(DEFAULT_CONFIG[def.key]);
    expect(DEFAULT_APP_SETTINGS.work).toEqual(DEFAULT_WORK_SETTINGS);
  });
});

/** Tabs forward from the current focus until it leaves `scope`, collecting every stop inside it. */
async function tabStops(user: UserEvent, scope: HTMLElement): Promise<HTMLElement[]> {
  const stops: HTMLElement[] = [];
  for (let i = 0; i < 60; i++) {
    await user.tab();
    const el = document.activeElement as HTMLElement;
    if (!scope.contains(el)) break;
    stops.push(el);
  }
  return stops;
}

describe("AC4: every setting is reachable and changeable by keyboard", () => {
  it("Tab reaches every setting on every page, a radio group being one stop, as browsers have it", async () => {
    const { user } = renderApp({ projectFiles: { [PROJECT.dir]: { worktrees: false } } });
    await openSettings(user);
    const pages = within(pageNav()).getAllByRole("button").map((b) => b.textContent!);
    for (const name of pages) {
      const button = within(pageNav()).getByRole("button", { name });
      await user.click(button);
      await screen.findAllByRole("heading", { level: 2, name });
      if (name === "Work") await within(main()).findAllByText(/^App default/);
      const page = main().querySelector<HTMLElement>(".settings-page")!;
      within(pageNav()).getAllByRole("button").at(-1)!.focus(); // the page follows the page list in tab order
      const stops = await tabStops(user, page);
      // Every enabled control: inputs (one per radio group), selects, buttons.
      const controls = Array.from(page.querySelectorAll<HTMLElement>("input, select, button")).filter(
        (c) => !(c as HTMLInputElement).disabled,
      );
      const groups = new Set(controls.map((c) => (c instanceof HTMLInputElement && c.type === "radio" ? `radio:${c.name}` : c)));
      const reached = new Set(stops.map((c) => (c instanceof HTMLInputElement && c.type === "radio" ? `radio:${c.name}` : c)));
      expect(controls.length, name).toBeGreaterThan(0);
      expect([...groups].filter((g) => !reached.has(g)), name).toEqual([]);
    }
  });

  it("changes each kind of setting from the keyboard: arrows in a choice, Space on a switch, Enter on Reset", async () => {
    const { user, appSaved, projectFiles } = renderApp();
    await openSettings(user);
    // Pages: focus the nav and pick Appearance with Tab and Enter.
    within(pageNav()).getByRole("button", { name: "General" }).focus();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Appearance");
    await user.keyboard("{Enter}");
    expect(pageTitle()).toBe("Appearance");
    screen.getByRole("radio", { name: "System" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(appSaved().at(-1)!.theme).toBe("light");

    await user.click(within(pageNav()).getByRole("button", { name: "General" }));
    screen.getByRole("radio", { name: "Keep running in the tray" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(appSaved().at(-1)!.closeButton).toBe("quit");

    await user.click(within(pageNav()).getByRole("button", { name: "Work" }));
    const worktrees = await screen.findByRole("checkbox", { name: "Build each story in its own worktree" });
    worktrees.focus();
    await user.keyboard(" ");
    await within(row(worktrees)).findByText("Override");
    expect(projectFiles.get(PROJECT.dir)).toEqual({ worktrees: false });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Reset Build each story/ }));
    await user.keyboard("{Enter}");
    await within(row(worktrees)).findByText("App default");
    expect(projectFiles.get(PROJECT.dir)).toEqual({});
    expect(document.activeElement).toBe(worktrees);
  });
});

describe("AC5: File > Settings… and Ctrl+, open Settings", () => {
  it("from the menu and from the keyboard", async () => {
    const { user } = renderApp();
    await user.click(within(titleBar()).getByRole("button", { name: "Menu" }));
    await user.hover(screen.getByRole("menuitem", { name: "File" }));
    await user.click(screen.getByRole("menuitem", { name: /^Settings…/ }));
    expect(viewTitle().textContent).toBe("Settings");
    expect(pageNav()).toBeTruthy();

    await user.click(within(sidebar()).getByRole("button", { name: "Work" }));
    await user.keyboard("{Control>},{/Control}");
    expect(viewTitle().textContent).toBe("Settings");
    expect(pageNav()).toBeTruthy();
  });
});

describe("AC6: Close button: keep running in the tray or quit", () => {
  it("defaults to keep running in the tray, and saves Quit when chosen", async () => {
    const { user, appSaved } = renderApp();
    await openSettings(user, "General");
    expect(checked("Close button")).toBe("Keep running in the tray");
    await user.click(screen.getByRole("radio", { name: "Quit Featra" }));
    expect(appSaved()).toEqual([{ ...DEFAULT_APP_SETTINGS, closeButton: "quit" }]);
    expect(checked("Close button")).toBe("Quit Featra");
  });

  it("macOS keeps the app in the Dock", async () => {
    const { user } = renderApp({ platform: "darwin" });
    await openSettings(user, "General");
    expect(checked("Close button")).toBe("Keep running in the Dock");
  });

  it("without a tray (Linux with no tray host) shows Quit, disabled, with the reason", async () => {
    const { user, appSaved } = renderApp({ platform: "linux", closeToTray: { available: false, reason: NO_TRAY_REASON } });
    await openSettings(user, "General");
    expect(checked("Close button")).toBe("Quit Featra");
    for (const r of radios("Close button")) expect((r as HTMLInputElement).disabled).toBe(true);
    const group = screen.getByRole("radiogroup", { name: "Close button" });
    expect(within(group).getByText(NO_TRAY_REASON)).toBeTruthy();
    expect(group.getAttribute("aria-describedby")).toContain("app-closeButton-status");
    await user.click(screen.getByRole("radio", { name: "Keep running in the tray" }));
    expect(appSaved()).toEqual([]);
  });

  it("a browser tab has no close button to set: General is left out", async () => {
    const { user } = renderApp({ platform: "web" });
    await openSettings(user);
    expect(within(pageNav()).queryByRole("button", { name: "General" })).toBeNull();
    expect(pageTitle()).toBe("Appearance");
  });
});

const noop = () => {};
const actionsStub = new Proxy({}, { get: () => noop }) as MenuActions;
const menuFor = (platform: string) =>
  buildAppMenu({ platform, sidebarShown: true, fullScreen: false, canGoBack: true, canGoForward: true, actions: actionsStub });

describe("AC7: Keyboard shortcuts page, by area and searchable; Help > Keyboard Shortcuts and Ctrl+/ open it", () => {
  it("lists every shortcut Featra has, each under its menu", () => {
    for (const platform of ["win32", "darwin", "linux"]) {
      const listed = listShortcuts(menuFor(platform));
      const ids: ShortcutId[] = [
        "settings", "keyboardShortcuts", "closeWindow", "quit", "undo", "redo", "cut", "copy", "paste", "selectAll",
        "toggleSidebar", "zoomReset", "zoomIn", "zoomOut", "fullScreen", "reload", "back", "forward",
      ];
      const labels = ids.map((id) => shortcutLabel(id, platform)).filter((l) => l !== undefined);
      expect(listed.map((e) => e.keys).sort(), platform).toEqual(labels.sort());
      expect([...new Set(listed.map((e) => e.area))], platform).toEqual(["File", "Edit", "View", "Go", "Help"]);
    }
    expect(listShortcuts(menuFor("win32")).find((e) => e.keys === "Ctrl+B")).toEqual({ area: "View", name: "Sidebar", keys: "Ctrl+B" });
  });

  it("search matches names, keys and areas, every word", () => {
    const all = listShortcuts(menuFor("win32"));
    expect(filterShortcuts(all, "zoom").map((e) => e.name)).toEqual(["Zoom In", "Zoom Out"]);
    expect(filterShortcuts(all, "ctrl+b").map((e) => e.name)).toEqual(["Sidebar"]);
    expect(filterShortcuts(all, "VIEW full").map((e) => e.name)).toEqual(["Full Screen"]);
    expect(filterShortcuts(all, "  ")).toEqual(all);
    expect(filterShortcuts(all, "teleport")).toEqual([]);
  });

  it("shows each area as a table of names and keys, and filters as you type", async () => {
    const { user } = renderApp();
    await openSettings(user, "Keyboard shortcuts");
    const areas = within(main()).getAllByRole("table").map((t) => t.getAttribute("aria-label"));
    expect(areas).toEqual(["File", "Edit", "View", "Go", "Help"]);
    const view = within(main()).getByRole("table", { name: "View" });
    expect(within(view).getByRole("rowheader", { name: "Zoom In" }).closest("tr")!.textContent).toBe("Zoom InCtrl+=");

    await user.type(within(main()).getByRole("searchbox", { name: "Search shortcuts" }), "zoom");
    expect(within(main()).getAllByRole("table").map((t) => t.getAttribute("aria-label"))).toEqual(["View"]);
    expect(within(main()).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Zoom In", "Zoom Out"]);

    await user.type(within(main()).getByRole("searchbox"), "zzz");
    expect(within(main()).queryAllByRole("table")).toEqual([]);
    expect(within(main()).getByRole("status").textContent).toBe("No shortcuts match “zoomzzz”.");
  });

  it("Help > Keyboard Shortcuts opens it", async () => {
    const { user } = renderApp();
    await user.click(within(titleBar()).getByRole("button", { name: "Menu" }));
    await user.hover(screen.getByRole("menuitem", { name: "Help" }));
    expect(screen.getByRole("menuitem", { name: /^Keyboard Shortcuts/ }).textContent).toBe("Keyboard ShortcutsCtrl+/");
    await user.click(screen.getByRole("menuitem", { name: /^Keyboard Shortcuts/ }));
    expect(viewTitle().textContent).toBe("Settings");
    expect(pageTitle()).toBe("Keyboard shortcuts");
  });

  it("Ctrl+/ opens it from anywhere, and ⌘/ on macOS", async () => {
    for (const [platform, keys] of [["win32", "{Control>}/{/Control}"], ["darwin", "{Meta>}/{/Meta}"]] as const) {
      const { user } = renderApp({ platform });
      await openSettings(user, "Appearance");
      await user.click(within(sidebar()).getByRole("button", { name: "Inbox" }));
      await user.keyboard(keys);
      expect(viewTitle().textContent).toBe("Settings");
      expect(pageTitle()).toBe("Keyboard shortcuts");
      cleanup();
    }
  });
});

describe("AC8: Settings > Appearance > Theme: System, Light, Dark; default System", () => {
  it("defaults to System, and applies and saves the choice at once", async () => {
    const { user, calls, appSaved } = renderApp();
    await openSettings(user, "Appearance");
    expect(radios("Theme").map((r) => r.closest("label")!.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(checked("Theme")).toBe("System");
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(calls.at(-1)).toBe("theme:dark");
    expect(appSaved()).toEqual([{ ...DEFAULT_APP_SETTINGS, theme: "dark" }]);

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(calls.at(-1)).toBe("theme:system");
  });

  it("starts on the stored theme", async () => {
    const { user } = renderApp({ settings: { theme: "light" } });
    expect(document.documentElement.dataset.theme).toBe("light");
    await openSettings(user, "Appearance");
    expect(checked("Theme")).toBe("Light");
  });
});
