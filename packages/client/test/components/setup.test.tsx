/** STORY-2: the offer to initialise git and Featra, through the real App over a fake host. */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";

afterEach(cleanup);

const offer = () => screen.queryByRole("region", { name: "Project setup" });
const shown = () => screen.findByRole("region", { name: "Project setup" });
const button = async (name: string) => within(await shown()).getByRole("button", { name });
/** Lets the app's status check settle before asserting nothing is shown. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AC1: the offer follows what the project needs", () => {
  it("a folder that isn't a git repository is offered git init, then Featra init, then nothing", async () => {
    const { user, actions } = renderApp({ setup: { [PROJECT.dir]: { state: "no-git" } } });
    expect((await shown()).textContent).toContain("This folder isn't a git repository.");
    await user.click(await button("Initialize Git"));
    expect(await screen.findByText("Featra isn't set up in this project.")).toBeTruthy();
    await user.click(await button("Initialize Featra"));
    await expect.poll(offer).toBeNull();
    expect(actions()).toEqual([`initGit:${PROJECT.dir}`, `initFeatra:${PROJECT.dir}`]);
  });

  it("a repository without .featra/ is offered Featra init only", async () => {
    renderApp({ setup: { [PROJECT.dir]: { state: "no-featra" } } });
    const region = await shown();
    expect(
      within(region)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Initialize Featra", "Not now"]);
  });

  it("a project that is set up shows no offer", async () => {
    renderApp();
    await settle();
    expect(offer()).toBeNull();
  });

  it("the browser build, which has no folders, shows no offer", async () => {
    renderApp({ platform: "web", setup: { [PROJECT.dir]: { state: "no-git" } } });
    await settle();
    expect(offer()).toBeNull();
  });
});

describe("the offer's other outcomes", () => {
  it("Not now hides it and changes nothing", async () => {
    const { user, actions } = renderApp({ setup: { [PROJECT.dir]: { state: "no-featra" } } });
    await user.click(await button("Not now"));
    expect(offer()).toBeNull();
    expect(actions()).toEqual([]);
  });

  it("a failed init says why and keeps the offer, so the user can try again", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-featra" } },
      initFailures: { [PROJECT.dir]: "Can't initialize Featra: access denied" },
    });
    await user.click(await button("Initialize Featra"));
    expect((await screen.findByRole("alert")).textContent).toBe("Can't initialize Featra: access denied");
    expect(within(await shown()).getByRole("button", { name: "Initialize Featra" })).toBeTruthy();
  });

  it("a status that can't be checked is shown with Not now only", async () => {
    renderApp({ setup: { [PROJECT.dir]: { state: "error", error: "Folder not found: /home/me/manager" } } });
    const region = await shown();
    expect(region.textContent).toContain("Can't check this project: Folder not found: /home/me/manager");
    expect(
      within(region)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Not now"]);
  });
});
