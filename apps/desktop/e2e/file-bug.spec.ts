import { expect, test, type ElectronApplication } from "@playwright/test";
import { parseCard } from "@featra/work-format";
import { FAKE_SDK, PATH_KEY, standInClaude } from "./agent.ts";
import { launch, tempUserData } from "./app.ts";
import { draftInNewChat } from "./draft-chat.ts";
import { cardFile, git, project } from "./draft-project.ts";

/**
 * STORY-13: filing bugs from Work. The real app, its real local server and real git; only the platform and the agent
 * are faked (agent.ts). FEAT-1 is Done and FEAT-2 is started on its own branch. A bug blamed on FEAT-2 is proposed
 * under it and committed on its branch, which isn't checked out; one blamed on FEAT-1 goes on the project bug list in
 * main's checkout, and FEAT-1 stays Done. No GitHub is involved.
 */
test("New bug proposes where it goes, the user confirms, and it is filed there with the bug icon", async () => {
  const userData = await tempUserData();
  const repo = await project();
  const bin = await standInClaude();
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(userData.dir, {
      FEATRA_PROJECT_DIR: repo.dir,
      FEATRA_E2E_AGENT_SDK: FAKE_SDK,
      [PATH_KEY]: bin.path,
    });
    running = app;
    const draft = await draftInNewChat(page, "FEAT-2");
    await draft.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => git(repo.dir, "status", "--porcelain")).toBe("");
    await draft.getByRole("button", { name: "Start", exact: true }).click();
    await expect.poll(() => git(repo.dir, "branch", "--format=%(refname:short)")).toContain("feature/2-shaping");
    const main = git(repo.dir, "rev-parse", "main");

    await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Work" }).click();
    const work = page.getByRole("region", { name: "Work list" });
    const form = work.getByRole("form", { name: "New bug" });
    const place = () => form.getByRole("combobox", { name: "Place it" });

    // AC1-AC3: a bug blamed on the feature in progress is proposed under it; Create commits it on its branch.
    await work.getByRole("button", { name: "New bug" }).click();
    await form.getByRole("textbox", { name: "Title" }).fill("Saves twice");
    await form.getByRole("textbox", { name: "Description" }).fill("Pressing Save writes two copies.");
    await form.getByRole("combobox", { name: "Suspected cause" }).selectOption({ label: "FEAT-2 Shaping" });
    await expect(place()).toHaveValue("feature:FEAT-2");
    await form.getByRole("button", { name: "Create" }).click();
    await expect(work.getByRole("status")).toHaveText("Filed BUG-1.");
    expect(git(repo.dir, "log", "-1", "--format=%s", "feature/2-shaping")).toBe("BUG-1: bug filed");
    const names = git(repo.dir, "ls-tree", "--name-only", "feature/2-shaping:.featra/cards");
    expect(names.split("\n")).toContain("BUG-1-saves-twice.md");
    const bug = parseCard(git(repo.dir, "show", "feature/2-shaping:.featra/cards/BUG-1-saves-twice.md"));
    expect(bug).toMatchObject({ type: "bug", parent: "FEAT-2", status: "New", origin: "bug" });
    expect(bug.description).toContain("Suspected cause: FEAT-2 Shaping");
    expect(git(repo.dir, "rev-parse", "main")).toBe(main);
    expect(git(repo.dir, "status", "--porcelain")).toBe("");

    // AC4: the bug shows under its feature with the bug icon.
    await work.getByRole("button", { name: "Shaping", exact: true }).click();
    const row = work.getByRole("row", { name: /Saves twice/ });
    await expect(row.getByRole("img", { name: "Bug" })).toBeVisible();

    // A bug blamed on the Done feature goes on the project bug list, and the feature stays Done.
    const before = await cardFile(repo.dir, "FEAT-1");
    await work.getByRole("button", { name: "New bug" }).click();
    await form.getByRole("textbox", { name: "Title" }).fill("Old crash");
    await form.getByRole("combobox", { name: "Suspected cause" }).selectOption({ label: "FEAT-1 First" });
    await expect(place()).toHaveValue("project");
    await expect(place().getByRole("option", { name: /FEAT-1/ })).toHaveCount(0);
    await form.getByRole("button", { name: "Create" }).click();
    await expect(work.getByRole("status")).toHaveText("Filed BUG-2.");
    const projectBugs = work.getByRole("region", { name: "Project bugs" });
    await expect(projectBugs.getByRole("row", { name: /Old crash/ }).getByRole("img", { name: "Bug" })).toBeVisible({
      timeout: 30_000,
    });
    expect(parseCard(await cardFile(repo.dir, "BUG-2"))).toMatchObject({ parent: null, origin: "bug" });
    expect(await cardFile(repo.dir, "FEAT-1")).toBe(before);
    await app.close();
  } finally {
    await running?.close().catch(() => {});
    await userData.dispose();
    await repo.dispose();
    await bin.dispose();
  }
});
