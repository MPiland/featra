/** STORY-20 Settings: scopes and pages (AC1), the keyboard (AC4), and how Settings opens (AC5). */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp, sidebar, titleBar, viewTitle } from "../../harness.tsx";
import { main, pageNav, pageTitle, checked, row, WORK, navButton, description, switchFor, isOn, projectLoaded, picker, openSettings, tabStops } from "./helpers.tsx";

afterEach(cleanup);

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
      WORK,
      "Keyboard shortcuts",
    ]);
    // The same name at both scopes: the same settings, as your defaults and as this project's.
    expect(within(scopes[1]!).getAllByRole("button").map((b) => b.textContent)).toEqual([WORK]);
    expect(pageTitle()).toBe("General");
  });

  it("the Project scope's picker, in the page header, defaults to the current project and lists only it (the project list is STORY-19)", async () => {
    const { user } = renderApp();
    await openSettings(user, WORK);
    expect(picker().textContent).toBe(`Project: ${PROJECT.name}`);
    expect(picker().closest(".settings-header")!.querySelector("h2")!.textContent).toBe(WORK);
    expect(picker().getAttribute("aria-haspopup")).toBe("listbox");
    await user.click(picker());
    const list = screen.getByRole("listbox", { name: "Project" });
    expect(within(list).getAllByRole("option").map((o) => [o.textContent, o.getAttribute("aria-selected")])).toEqual([
      [PROJECT.name, "true"],
    ]);
  });

  it("the picker works from the keyboard: Enter opens it, Escape closes only it and focus returns", async () => {
    const { user } = renderApp();
    await openSettings(user, WORK);
    picker().focus();
    await user.keyboard("{Enter}");
    const list = screen.getByRole("listbox", { name: "Project" });
    expect(document.activeElement).toBe(list);
    expect(picker().getAttribute("aria-expanded")).toBe("true");
    expect(list.getAttribute("aria-activedescendant")).toBe(within(list).getByRole("option").id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(picker());
    expect(viewTitle().textContent).toBe("Settings");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox", { name: "Project" })).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(picker());
    expect(picker().textContent).toBe(`Project: ${PROJECT.name}`);
  });

  it("says where project settings are saved in plain words; the file path is only a tooltip", async () => {
    const { user } = renderApp();
    await openSettings(user, WORK);
    const saved = within(main()).getByText("Saved in the project, shared through git.");
    expect(saved.getAttribute("title")).toMatch(/\.featra\/config\.yaml/);
    expect(main().textContent).not.toMatch(/config\.yaml|\.featra/);
  });

  it("no page repeats itself: no section heading echoes the page title, and a page with one group has no section heading (regression: the Project page repeated its title)", async () => {
    const { user } = renderApp();
    await openSettings(user);
    for (const [i, button] of within(pageNav()).getAllByRole("button").entries()) {
      await user.click(button);
      await screen.findAllByRole("heading", { level: 2, name: button.textContent! });
      if (i === 4) await projectLoaded();
      const page = main().querySelector<HTMLElement>(".settings-page")!;
      const sections = within(page).queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(sections, button.textContent!).not.toContain(pageTitle());
      expect(new Set(sections).size, button.textContent!).toBe(sections.length);
      if (page.querySelectorAll(".settings-card").length === 1 && !page.querySelector("table"))
        expect(sections, `${button.textContent}: one group`).toEqual([]);
      // Every description says something its label doesn't.
      for (const help of page.querySelectorAll(".setting-help")) {
        const label = help.closest(".setting-row")!.querySelector(".setting-label > span")!.textContent!.toLowerCase();
        expect(help.textContent!.toLowerCase(), label).not.toContain(label);
      }
    }
  });

  it("says so when no project is open, instead of showing settings that can't be saved anywhere", async () => {
    const { user } = renderApp({ project: null });
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await user.click(navButton(WORK));
    expect(within(main()).queryByRole("button", { name: /^Project: / })).toBeNull();
    expect(within(main()).getByText(/^No project is open\.$/)).toBeTruthy();
  });
});

describe("AC4: every setting is reachable and changeable by keyboard", () => {
  it("Tab reaches every setting on every page, a radio group being one stop, as browsers have it", async () => {
    const { user } = renderApp({ projectFiles: { [PROJECT.dir]: { worktrees: false } } });
    await openSettings(user);
    const buttons = within(pageNav()).getAllByRole("button");
    expect(buttons.length).toBe(5);
    for (const [i, button] of buttons.entries()) {
      const name = `${i + 1}. ${button.textContent}`;
      await user.click(button);
      await screen.findAllByRole("heading", { level: 2, name: button.textContent! });
      if (i === buttons.length - 1) {
        await projectLoaded();
        expect(within(main()).getByText("Overridden")).toBeTruthy(); // its Reset button is a stop too
      }
      const page = main().querySelector<HTMLElement>(".settings-page")!;
      within(pageNav()).getAllByRole("button").at(-1)!.focus(); // the page follows the page list in tab order
      const stops = await tabStops(user, page);
      // Every enabled control: inputs (one per radio group), selects, buttons (switches, Reset, the picker).
      const controls = Array.from(page.querySelectorAll<HTMLElement>("input, select, button")).filter(
        (c) => !(c as HTMLInputElement).disabled,
      );
      const groups = new Set(controls.map((c) => (c instanceof HTMLInputElement && c.type === "radio" ? `radio:${c.name}` : c)));
      const reached = new Set(stops.map((c) => (c instanceof HTMLInputElement && c.type === "radio" ? `radio:${c.name}` : c)));
      expect(controls.length, name).toBeGreaterThan(0);
      expect([...groups].filter((g) => !reached.has(g)), name).toEqual([]);
    }
  });

  it("changes each kind of setting from the keyboard: arrows in a segmented control, Space and Enter on a switch, Enter on Reset", async () => {
    const { user, appSaved, projectFiles } = renderApp();
    await openSettings(user);
    // Pages: focus the nav and pick Appearance with Tab and Enter.
    navButton("General").focus();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Appearance");
    await user.keyboard("{Enter}");
    expect(pageTitle()).toBe("Appearance");
    screen.getByRole("radio", { name: "System" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(appSaved().at(-1)!.theme).toBe("light");
    await user.keyboard("{ArrowRight}");
    expect(appSaved().at(-1)!.theme).toBe("dark");
    expect(checked("Theme")).toBe("Dark");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Dark" }));
    await user.keyboard("{ArrowLeft}");
    expect(checked("Theme")).toBe("Light");

    await user.click(navButton("General"));
    screen.getByRole("radio", { name: "Minimize to tray" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(appSaved().at(-1)!.closeButton).toBe("quit");

    await user.click(navButton(WORK, "App"));
    const appAccept = switchFor("Require acceptance before Done");
    appAccept.focus();
    await user.keyboard("{Enter}");
    expect(isOn(appAccept)).toBe(false);
    expect(appSaved().at(-1)!.work.requireAccept).toBe(false);
    await user.keyboard(" ");
    expect(isOn(appAccept)).toBe(true);
    expect(appSaved().at(-1)!.work.requireAccept).toBe(true);

    await user.click(navButton(WORK, "Project"));
    await projectLoaded();
    const worktrees = switchFor("Use a worktree per story");
    worktrees.focus();
    await user.keyboard(" ");
    await within(row(worktrees)).findByText("Overridden");
    expect(isOn(worktrees)).toBe(false);
    expect(projectFiles.get(PROJECT.dir)).toEqual({ worktrees: false });
    // Reset sits by the label, before the switch: Shift+Tab reaches it.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Reset Use a worktree per story/ }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(within(row(worktrees)).queryByText("Overridden")).toBeNull());
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
