/** STORY-19: the project switcher, New Project…, Open Folder… and Project Settings…, through the real App. */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LOCATION, PROJECT, renderApp, sidebar, titleBar, viewTitle } from "../harness.tsx";
import { item, labels, menuAt, openPath } from "../menu-harness.ts";
import { main, picker, projectLoaded } from "./settings/helpers.tsx";

afterEach(cleanup);

const OTHER = { dir: "/home/me/website", name: "website" };
const switcher = () => within(sidebar()).getByRole("button", { name: /^Switch project: / });
const projectMenu = () => screen.getByRole("menu", { name: "Projects" });
/** The project the title bar names after the view title. */
const titleProject = () => titleBar().querySelector(".ttl-proj")?.textContent ?? null;
const workProject = () => main().querySelector("[data-view=work]")?.getAttribute("data-project") ?? null;
const chatsProject = () => within(sidebar()).getByRole("region", { name: "Chats" }).getAttribute("data-project");
const dialog = () => screen.getByRole("dialog");
const field = (name: string) => within(dialog()).getByRole("textbox", { name });
const createButton = () => within(dialog()).getByRole("button", { name: "Create" });

/** A menu item's name ends with its shortcut ("Open Folder…Ctrl+O"): find it by how it starts. */
const startsWith = (label: string) => (name: string) => name.startsWith(label);

/** Opens the switcher and chooses a project. */
async function choose(user: UserEvent, name: string) {
  await user.click(switcher());
  await user.click(within(projectMenu()).getByRole("menuitemradio", { name }));
}
/** Opens the switcher and runs one of its commands. */
async function chooseItem(user: UserEvent, label: string) {
  await user.click(switcher());
  await user.click(within(projectMenu()).getByRole("menuitem", { name: startsWith(label) }));
}

describe("AC1: the switcher lists known projects; choosing one switches Work and the chat list", () => {
  it("shows the current project at the top of the sidebar, its initial on the avatar", () => {
    renderApp();
    expect(switcher().getAttribute("aria-label")).toBe("Switch project: manager");
    expect(switcher().textContent).toBe("Mmanager");
    expect(sidebar().firstElementChild?.contains(switcher())).toBe(true);
    expect(titleProject()).toBe("· manager");
    expect(viewTitle().textContent).toBe("Work");
    expect(workProject()).toBe(PROJECT.dir);
    expect(chatsProject()).toBe(PROJECT.dir);
  });

  it("lists every known project, the current one checked, then the project commands", async () => {
    const { user } = renderApp({ projects: [PROJECT, OTHER] });
    await user.click(switcher());
    expect(switcher().getAttribute("aria-expanded")).toBe("true");
    expect(labels(projectMenu())).toEqual([
      "manager",
      "website",
      "New Project…Ctrl+Shift+N",
      "Open Folder…Ctrl+O",
      "Project Settings…Ctrl+Shift+,",
    ]);
    const radios = within(projectMenu()).getAllByRole("menuitemradio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("choosing a project makes it current: the switcher, the title, Work and the chat list follow", async () => {
    const { user, calls } = renderApp({ projects: [PROJECT, OTHER] });
    await choose(user, "website");
    await waitFor(() => expect(switcher().getAttribute("aria-label")).toBe("Switch project: website"));
    expect(calls).toContain(`switchTo:${OTHER.dir}`);
    expect(titleProject()).toBe("· website");
    expect(workProject()).toBe(OTHER.dir);
    expect(chatsProject()).toBe(OTHER.dir);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("works from the keyboard: Enter opens the menu, arrows move, Enter chooses, focus returns to the switcher", async () => {
    const { user } = renderApp({ projects: [PROJECT, OTHER] });
    switcher().focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement?.textContent).toBe("manager");
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(titleProject()).toBe("· website"));
    expect(document.activeElement).toBe(switcher());
  });

  it("when the host refuses (the folder is gone), says why and stays on the current project", async () => {
    const { user } = renderApp({
      projects: [PROJECT, OTHER],
      refusals: { [OTHER.dir]: `Folder not found: ${OTHER.dir}` },
    });
    await choose(user, "website");
    const alert = await screen.findByRole("dialog", { name: "Can't Open Project" });
    expect(alert.textContent).toContain(`Folder not found: ${OTHER.dir}`);
    await user.click(within(alert).getByRole("button", { name: "Close" }));
    expect(titleProject()).toBe("· manager");
  });

  it("with no project, says so in Work and offers New Project… and Open Folder…", async () => {
    const { user } = renderApp({ project: null, folderPicks: ["/home/me/found"] });
    expect(switcher().getAttribute("aria-label")).toBe("Switch project: No project");
    expect(titleProject()).toBeNull();
    const work = main().querySelector("[data-view=work]") as HTMLElement;
    expect(work.textContent).toContain("No project is open.");
    await user.click(within(work).getByRole("button", { name: "Open Folder…" }));
    await waitFor(() => expect(titleProject()).toBe("· found"));
  });
});

describe("AC2: New Project… creates a folder and opens it; Open Folder… adds an existing one", () => {
  it("Open Folder… adds the chosen folder and switches to it; cancelling changes nothing", async () => {
    const { user, calls } = renderApp({ folderPicks: ["/home/me/website"] });
    await chooseItem(user, "Open Folder…");
    await waitFor(() => expect(titleProject()).toBe("· website"));
    expect(calls).toContain("folderDialog:Open Folder");
    await user.click(switcher());
    expect(labels(projectMenu()).slice(0, 2)).toEqual(["manager", "website"]);
    await user.keyboard("{Escape}");
    await chooseItem(user, "Open Folder…"); // no more picks: the dialog is cancelled
    expect(calls.filter((c) => c === "folderDialog:Open Folder")).toHaveLength(2);
    expect(titleProject()).toBe("· website");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("New Project… asks for a name in the suggested location, the name field focused", async () => {
    const { user } = renderApp();
    await chooseItem(user, "New Project…");
    expect(within(dialog()).getByRole("heading").textContent).toBe("New Project");
    expect(document.activeElement).toBe(field("Name"));
    expect((field("Location") as HTMLInputElement).value).toBe(LOCATION);
    expect(createButton()).toHaveProperty("disabled", true);
  });

  it("checks the name as it is typed, and Create waits for a good one", async () => {
    const { user } = renderApp();
    await chooseItem(user, "New Project…");
    await user.type(field("Name"), "a:b");
    expect(within(dialog()).getByRole("alert").textContent).toBe("A name can't contain \\ / : * ? \" < > |");
    expect(field("Name").getAttribute("aria-invalid")).toBe("true");
    expect(createButton()).toHaveProperty("disabled", true);
    await user.clear(field("Name"));
    await user.type(field("Name"), "website");
    expect(within(dialog()).getByRole("alert").textContent).toBe("");
    expect(createButton()).toHaveProperty("disabled", false);
  });

  it("Enter creates the project in the location, closes the dialog and switches to it", async () => {
    const { user, calls } = renderApp();
    await chooseItem(user, "New Project…");
    await user.type(field("Name"), "website{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toContain(`create:${LOCATION}:website`);
    expect(titleProject()).toBe("· website");
    expect(workProject()).toBe(`${LOCATION}/website`);
  });

  it("Choose… picks another location with the folder dialog", async () => {
    const { user, calls } = renderApp({ folderPicks: ["/srv/code"] });
    await chooseItem(user, "New Project…");
    await user.click(within(dialog()).getByRole("button", { name: "Choose…" }));
    await waitFor(() => expect((field("Location") as HTMLInputElement).value).toBe("/srv/code"));
    expect(calls).toContain(`folderDialog:Choose Location:${LOCATION}`);
    await user.type(field("Name"), "api");
    await user.click(createButton());
    await waitFor(() => expect(titleProject()).toBe("· api"));
    expect(calls).toContain("create:/srv/code:api");
  });

  it("shows the host's refusal (the folder is already there) and keeps the dialog open", async () => {
    const { user } = renderApp({ refusals: { [`${LOCATION}/manager`]: '"manager" already exists there.' } });
    await chooseItem(user, "New Project…");
    await user.type(field("Name"), "manager{Enter}");
    await waitFor(() =>
      expect(within(dialog()).getByRole("alert").textContent).toBe('"manager" already exists there.'),
    );
    expect(titleProject()).toBe("· manager");
    await user.type(field("Name"), "2");
    expect(within(dialog()).getByRole("alert").textContent).toBe("");
  });

  it("Cancel and Escape close it without creating anything; focus goes back to the switcher", async () => {
    const { user, calls } = renderApp();
    switcher().focus();
    await user.keyboard("{Enter}{ArrowDown}"); // manager, then New Project…
    await user.keyboard("{Enter}x{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(switcher());
    await chooseItem(user, "New Project…");
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.startsWith("create:"))).toBe(false);
  });
});

describe("AC3: Project Settings… opens Settings on that project", () => {
  it("opens the Project page with the picker on the current project, listing every known project", async () => {
    const { user } = renderApp({ projects: [PROJECT, OTHER] });
    await choose(user, "website");
    await waitFor(() => expect(titleProject()).toBe("· website"));
    await chooseItem(user, "Project Settings…");
    await projectLoaded();
    expect(viewTitle().textContent).toBe("Settings");
    expect(picker().textContent).toBe("Project: website");
    await user.click(picker());
    expect(
      within(screen.getByRole("listbox", { name: "Project" }))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["manager", "website"]);
  });

  it("starts over on the current project each time, even if the picker was moved", async () => {
    const { user } = renderApp({ projects: [PROJECT, OTHER] });
    await chooseItem(user, "Project Settings…");
    await projectLoaded();
    await user.click(picker());
    await user.click(screen.getByRole("option", { name: "website" }));
    expect(picker().textContent).toBe("Project: website");
    await chooseItem(user, "Project Settings…");
    await projectLoaded();
    expect(picker().textContent).toBe("Project: manager");
  });
});

describe("AC4: the File menu's project commands, and their shortcuts", () => {
  it("File > New Project…, Open Folder… and Project Settings… do what the switcher does", async () => {
    const { user } = renderApp({ folderPicks: ["/home/me/website"] });
    await openPath(user, "File");
    await user.click(item(startsWith("Open Folder…")));
    await waitFor(() => expect(titleProject()).toBe("· website"));
    await openPath(user, "File");
    await user.click(item(startsWith("Project Settings…")));
    await projectLoaded();
    expect(picker().textContent).toBe("Project: website");
    await openPath(user, "File");
    await user.click(item(startsWith("New Project…")));
    expect(within(dialog()).getByRole("heading").textContent).toBe("New Project");
  });

  it("Ctrl+Shift+N, Ctrl+O and Ctrl+Shift+, work from anywhere in the window", async () => {
    const { user } = renderApp({ folderPicks: ["/home/me/website"] });
    await user.keyboard("{Control>}o{/Control}");
    await waitFor(() => expect(titleProject()).toBe("· website"));
    await user.keyboard("{Control>}{Shift>}<{/Shift}{/Control}");
    await projectLoaded();
    expect(viewTitle().textContent).toBe("Settings");
    expect(picker().textContent).toBe("Project: website");
    await user.keyboard("{Control>}{Shift>}N{/Shift}{/Control}");
    expect(document.activeElement).toBe(field("Name"));
  });

  it("uses Cmd on macOS", async () => {
    const { user } = renderApp({ platform: "darwin" });
    await openPath(user, "File");
    expect(labels(menuAt(1))[0]).toBe("New Chat⌘N");
    expect(labels(menuAt(1)).slice(1, 4)).toEqual(["New Project…⇧⌘N", "Open Folder…⌘O", "Project Settings…⇧⌘,"]);
    await user.keyboard("{Escape}{Escape}{Meta>}{Shift>}N{/Shift}{/Meta}");
    expect(document.activeElement).toBe(field("Name"));
  });
});
