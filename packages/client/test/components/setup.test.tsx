/** STORY-42 (and STORY-2's offer, which it replaces): when the setup page shows, through the real App. */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { openSettings } from "./settings/helpers.tsx";
import { button, list, lists, page, result, settle, shown, switchTo } from "./setup-helpers.tsx";

afterEach(cleanup);

const OTHER = { dir: "/home/me/other", name: "other" };

describe("AC1: a project that isn't set up shows the setup page in Work instead of the list", () => {
  it("a folder that isn't a git repository", async () => {
    renderApp({ setup: { [PROJECT.dir]: { state: "no-git" } } });
    expect(within(await shown()).getByRole("heading", { level: 2 }).textContent).toBe("Set up project");
    expect(list()).toBeNull();
  });

  it("a repository without .featra/", async () => {
    renderApp({ setup: { [PROJECT.dir]: { state: "no-featra" } } });
    expect(await shown()).toBeTruthy();
    expect(list()).toBeNull();
  });

  it("a project that is set up shows the list", async () => {
    renderApp();
    await settle();
    expect(page()).toBeNull();
    expect(list()).toBeTruthy();
  });

  it("the browser build, which has no folders, shows no page", async () => {
    renderApp({ platform: "web", setup: { [PROJECT.dir]: { state: "no-git" } } });
    await settle();
    expect(page()).toBeNull();
  });

  it("Skip goes to the empty list, changes nothing, and the page stays away for that project", async () => {
    const { user, actions } = renderApp({
      projects: [PROJECT, OTHER],
      setup: { [PROJECT.dir]: { state: "no-featra" } },
    });
    await user.click(await button("Skip"));
    expect(page()).toBeNull();
    expect(list()).toBeTruthy();
    await switchTo(user, "other");
    await switchTo(user, "manager");
    await settle();
    expect(page()).toBeNull();
    expect(actions()).toEqual([`switchTo:${OTHER.dir}`, `switchTo:${PROJECT.dir}`]);
  });

  it("each project is checked: switching to one that isn't set up shows its page", async () => {
    const { user } = renderApp({ projects: [PROJECT, OTHER], setup: { [OTHER.dir]: { state: "no-git" } } });
    await settle();
    expect(page()).toBeNull();
    await switchTo(user, "other");
    expect(await shown()).toBeTruthy();
  });

  it('"Set up project" in Project settings reopens the page in Work, even for a project that is set up', async () => {
    const { user, actions } = renderApp();
    await openSettings(user, "Workflow");
    await user.click(screen.getByRole("button", { name: "Set up project" }));
    expect(await shown()).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Work");
    expect(actions()).toEqual([]);
  });

  it("reopening for another project switches to it first", async () => {
    const { user, actions } = renderApp({ projects: [PROJECT, OTHER] });
    await openSettings(user, "Workflow");
    await user.click(screen.getByRole("button", { name: "Project: manager" }));
    await user.click(screen.getByRole("option", { name: "other" }));
    await user.click(screen.getByRole("button", { name: "Set up project" }));
    expect(await shown()).toBeTruthy();
    expect(actions()).toEqual([`switchTo:${OTHER.dir}`]);
  });

  it("Skip after a reopen goes back to the list", async () => {
    const { user } = renderApp();
    await openSettings(user, "Workflow");
    await user.click(screen.getByRole("button", { name: "Set up project" }));
    await user.click(await button("Skip"));
    expect(page()).toBeNull();
    expect(list()).toBeTruthy();
  });
});

describe("AC4: the result step lists what was created and kept; Done goes to the list", () => {
  it("shows both lists, then Done shows the list and the page doesn't come back", async () => {
    const { user } = renderApp({
      projects: [PROJECT, OTHER],
      setup: { [PROJECT.dir]: { state: "no-git" } },
      initResults: {
        [PROJECT.dir]: { created: [".git/", ".featra/config.yaml", "decisions.md"], kept: ["CONTEXT.md"] },
      },
    });
    await user.click(await button("Set up"));
    const done = await result();
    expect(lists(done)).toEqual([
      { label: "Created", paths: [".git/", ".featra/config.yaml", "decisions.md"] },
      { label: "Kept", paths: ["CONTEXT.md"] },
    ]);
    await user.click(within(done).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("region", { name: "Project is set up" })).toBeNull();
    expect(list()).toBeTruthy();
    await switchTo(user, "other");
    await switchTo(user, "manager");
    await settle();
    expect(page()).toBeNull();
  });

  it("a list with nothing in it isn't shown", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-featra" } },
      initResults: { [PROJECT.dir]: { created: [".featra/config.yaml"], kept: [] } },
    });
    await user.click(await button("Set up"));
    expect(lists(await result())).toEqual([{ label: "Created", paths: [".featra/config.yaml"] }]);
  });
});

describe("when the server fails", () => {
  it("a project that can't be checked shows why, with Try again and Skip", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "error", error: "Folder not found: /home/me/manager" } },
      planFailures: { [PROJECT.dir]: "Folder not found: /home/me/manager" },
    });
    const region = await shown();
    expect((await within(region).findByRole("alert")).textContent).toBe(
      "Can't check this project: Folder not found: /home/me/manager",
    );
    expect(
      within(region)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Skip", "Try again"]);
    await user.click(within(region).getByRole("button", { name: "Skip" }));
    expect(page()).toBeNull();
  });

  it("a failed setup says why and keeps the page, so the user can try again", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-featra" } },
      initFailures: { [PROJECT.dir]: "Can't set up the project: access denied" },
    });
    await user.click(await button("Set up"));
    expect((await within(await shown()).findByRole("alert")).textContent).toBe(
      "Can't set up the project: access denied",
    );
    expect((await button("Set up")).hasAttribute("disabled")).toBe(false);
  });
});
