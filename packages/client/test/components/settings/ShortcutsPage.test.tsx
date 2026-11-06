/** STORY-20 Settings: the Keyboard shortcuts page (AC7). */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildAppMenu, filterShortcuts, listShortcuts, type MenuActions } from "../../../src/menu.ts";
import { shortcutLabel, type ShortcutId } from "../../../src/shortcuts.ts";
import { renderApp, sidebar, titleBar, viewTitle } from "../../harness.tsx";
import { main, pageTitle, openSettings } from "./helpers.tsx";

afterEach(cleanup);

const noop = () => {};
const actionsStub = new Proxy({}, { get: () => noop }) as MenuActions;
const menuFor = (platform: string) =>
  buildAppMenu({
    platform,
    sidebarShown: true,
    fullScreen: false,
    canGoBack: true,
    canGoForward: true,
    actions: actionsStub,
  });

describe("AC7: Keyboard shortcuts page, by area and searchable; Help > Keyboard Shortcuts and Ctrl+/ open it", () => {
  it("lists every shortcut Featra has, each under its menu", () => {
    for (const platform of ["win32", "darwin", "linux"]) {
      const listed = listShortcuts(menuFor(platform));
      const ids: ShortcutId[] = [
        "settings",
        "keyboardShortcuts",
        "closeWindow",
        "quit",
        "undo",
        "redo",
        "cut",
        "copy",
        "paste",
        "selectAll",
        "toggleSidebar",
        "zoomReset",
        "zoomIn",
        "zoomOut",
        "fullScreen",
        "reload",
        "back",
        "forward",
      ];
      const labels = ids.map((id) => shortcutLabel(id, platform)).filter((l) => l !== undefined);
      expect(listed.map((e) => e.keys).toSorted(), platform).toEqual(labels.toSorted());
      expect([...new Set(listed.map((e) => e.area))], platform).toEqual(["File", "Edit", "View", "Go", "Help"]);
    }
    expect(listShortcuts(menuFor("win32")).find((e) => e.keys === "Ctrl+B")).toEqual({
      area: "View",
      name: "Sidebar",
      keys: "Ctrl+B",
    });
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
    const areas = within(main())
      .getAllByRole("table")
      .map((t) => t.getAttribute("aria-label"));
    expect(areas).toEqual(["File", "Edit", "View", "Go", "Help"]);
    const view = within(main()).getByRole("table", { name: "View" });
    expect(within(view).getByRole("rowheader", { name: "Zoom In" }).closest("tr")!.textContent).toBe("Zoom InCtrl+=");

    await user.type(within(main()).getByRole("searchbox", { name: "Search shortcuts" }), "zoom");
    expect(
      within(main())
        .getAllByRole("table")
        .map((t) => t.getAttribute("aria-label")),
    ).toEqual(["View"]);
    expect(
      within(main())
        .getAllByRole("rowheader")
        .map((r) => r.textContent),
    ).toEqual(["Zoom In", "Zoom Out"]);

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
    for (const [platform, keys] of [
      ["win32", "{Control>}/{/Control}"],
      ["darwin", "{Meta>}/{/Meta}"],
    ] as const) {
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
