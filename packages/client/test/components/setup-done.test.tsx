/** STORY-42: init confirms what it created, through the real App over a fake host. */
import { cleanup, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp, sidebar } from "../harness.tsx";

afterEach(cleanup);

const OTHER = { dir: "/home/me/other", name: "other" };
const offer = () => screen.queryByRole("region", { name: "Project setup" });
const shownOffer = () => screen.findByRole("region", { name: "Project setup" });
const confirmation = () => screen.queryByRole("region", { name: "Featra is set up" });
const shownConfirmation = () => screen.findByRole("region", { name: "Featra is set up" });
/** Each list's label and its paths, as the user reads them. */
const lists = (region: HTMLElement) =>
  Array.from(region.querySelectorAll("dl > div")).map((row) => ({
    label: row.querySelector("dt")?.textContent,
    paths: Array.from(row.querySelectorAll("dd code")).map((c) => c.textContent),
  }));
/** Opens the project switcher and chooses a project. */
async function switchTo(user: UserEvent, name: string) {
  await user.click(within(sidebar()).getByRole("button", { name: /^Switch project: / }));
  await user.click(within(screen.getByRole("menu", { name: "Projects" })).getByRole("menuitemradio", { name }));
}
/** Lets the app's status check settle before asserting nothing is shown. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const SCAFFOLD = {
  created: [".featra/config.yaml", "docs/adr/", "docs/adr/README.md", "decisions.md", "open-questions.md"],
  kept: ["CONTEXT.md"],
};

describe("AC1: after Featra init, Work confirms what it created and kept", () => {
  it("lists the files init created and the ones it kept, in place of the offer", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-featra" } },
      initResults: { [PROJECT.dir]: SCAFFOLD },
    });
    await user.click(within(await shownOffer()).getByRole("button", { name: "Initialize Featra" }));
    const region = await shownConfirmation();
    expect(within(region).getByRole("heading", { name: "Featra is set up" })).toBeTruthy();
    expect(lists(region)).toEqual([
      { label: "Created", paths: SCAFFOLD.created },
      { label: "Kept", paths: SCAFFOLD.kept },
    ]);
    expect(offer()).toBeNull();
  });

  it("leaves out the Kept list when init found nothing already there", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-featra" } },
      initResults: { [PROJECT.dir]: { created: SCAFFOLD.created, kept: [] } },
    });
    await user.click(within(await shownOffer()).getByRole("button", { name: "Initialize Featra" }));
    expect(lists(await shownConfirmation())).toEqual([{ label: "Created", paths: SCAFFOLD.created }]);
  });

  it("a failed init shows no confirmation", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-featra" } },
      initFailures: { [PROJECT.dir]: "Can't initialize Featra: access denied" },
    });
    await user.click(within(await shownOffer()).getByRole("button", { name: "Initialize Featra" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Can't initialize Featra: access denied");
    expect(confirmation()).toBeNull();
  });
});

describe("AC2: after Git init, the next step shows without a reload", () => {
  it("Initialize Git is followed by the Initialize Featra offer, and the app doesn't reload", async () => {
    const { user, actions } = renderApp({ setup: { [PROJECT.dir]: { state: "no-git" } } });
    await user.click(within(await shownOffer()).getByRole("button", { name: "Initialize Git" }));
    await screen.findByText("Featra isn't set up in this project.");
    expect(within(await shownOffer()).getByRole("button", { name: "Initialize Featra" })).toBeTruthy();
    expect(actions()).toEqual([`initGit:${PROJECT.dir}`]);
  });
});

describe("AC3: the confirmation can be dismissed and doesn't come back for that project", () => {
  it("Dismiss hides it, and switching away and back shows neither it nor the offer", async () => {
    const { user } = renderApp({
      projects: [PROJECT, OTHER],
      setup: { [PROJECT.dir]: { state: "no-featra" } },
    });
    await user.click(within(await shownOffer()).getByRole("button", { name: "Initialize Featra" }));
    await user.click(within(await shownConfirmation()).getByRole("button", { name: "Dismiss" }));
    expect(confirmation()).toBeNull();

    await switchTo(user, "other");
    await switchTo(user, "manager");
    await settle();
    expect(confirmation()).toBeNull();
    expect(offer()).toBeNull();
  });

  it("belongs to the project it was for: another project never shows it", async () => {
    const { user } = renderApp({
      projects: [PROJECT, OTHER],
      setup: { [PROJECT.dir]: { state: "no-featra" } },
    });
    await user.click(within(await shownOffer()).getByRole("button", { name: "Initialize Featra" }));
    await shownConfirmation();
    await switchTo(user, "other");
    await settle();
    expect(confirmation()).toBeNull();
  });
});
