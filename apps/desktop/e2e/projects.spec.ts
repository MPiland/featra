import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { folderDialogs, launch, queueFolderPicks, tempProject, tempUserData } from "./app.ts";

/**
 * STORY-19: switch, create and open projects, in the real app. Only the platform is faked: the userData and project
 * folders are temporary, and the OS folder dialog answers with folders the test queued.
 */
const switcher = (page: Page) =>
  page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: /^Switch project: / });
const projectMenu = (page: Page) => page.getByRole("menu", { name: "Projects" });
const titleProject = (page: Page) => page.getByRole("banner").locator(".ttl-proj");
const workProject = (page: Page) => page.locator("main [data-view=work]");
const dialog = (page: Page) => page.getByRole("dialog");

async function tempFolder(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) };
}

/** Labels of the items directly in a menu: name followed by shortcut. */
const menuLabels = (menu: ReturnType<typeof projectMenu>) =>
  menu.locator("[role^=menuitem]").evaluateAll((items) => items.map((i) => i.textContent));

async function fromSwitcher(page: Page, label: string) {
  await switcher(page).click();
  await projectMenu(page)
    .locator("[role^=menuitem]")
    .filter({ hasText: new RegExp(`^${label}`) })
    .click();
}

async function fromFileMenu(page: Page, label: string) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "File", exact: true }).hover();
  await page
    .locator("[role=menuitem]")
    .filter({ hasText: new RegExp(`^${label}`) })
    .click();
}

const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

test.describe("STORY-19: switch, create and open projects", () => {
  test("open a folder, switch back, create a project, open its settings; the list survives a restart (AC1-AC4)", async () => {
    const profile = await tempUserData();
    const first = await tempProject("progress: stories\n");
    const other = await tempFolder("featra-other-");
    const home = await tempFolder("featra-home-");
    const firstName = basename(first.dir);
    const otherName = basename(other.dir);
    try {
      let { app, page } = await launch(profile.dir, { FEATRA_PROJECT_DIR: first.dir });
      await expect(switcher(page)).toHaveAccessibleName(`Switch project: ${firstName}`);
      await expect(titleProject(page)).toHaveText(`· ${firstName}`);
      await expect(workProject(page)).toHaveAttribute("data-project", first.dir);

      // AC2, AC4: Open Folder… from the keyboard adds an existing folder and switches to it.
      await queueFolderPicks(app, other.dir);
      await page.keyboard.press("Control+O");
      await expect(switcher(page)).toHaveAccessibleName(`Switch project: ${otherName}`);
      await expect(titleProject(page)).toHaveText(`· ${otherName}`);
      await expect(workProject(page)).toHaveAttribute("data-project", other.dir);
      expect(await folderDialogs(app)).toEqual(["Open Folder"]);

      // AC1: the switcher lists both; choosing the first switches back.
      await switcher(page).click();
      expect(await menuLabels(projectMenu(page))).toEqual([
        firstName,
        otherName,
        "New Project…Ctrl+Shift+N",
        "Open Folder…Ctrl+O",
        "Project Settings…Ctrl+Shift+,",
      ]);
      await expect(projectMenu(page).getByRole("menuitemradio", { name: otherName })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await projectMenu(page).getByRole("menuitemradio", { name: firstName }).click();
      await expect(titleProject(page)).toHaveText(`· ${firstName}`);
      await expect(page.getByRole("region", { name: "Chats" })).toHaveAttribute("data-project", first.dir);

      // A cancelled folder dialog changes nothing.
      await fromSwitcher(page, "Open Folder…");
      await expect.poll(() => folderDialogs(app)).toEqual(["Open Folder", "Open Folder"]);
      await expect(titleProject(page)).toHaveText(`· ${firstName}`);

      // AC4: the File menu lists the project commands with their shortcuts.
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("menuitem", { name: "File", exact: true }).hover();
      const file = page.getByRole("menu").nth(1);
      expect((await menuLabels(file)).slice(0, 4)).toEqual([
        "New Project…Ctrl+Shift+N",
        "Open Folder…Ctrl+O",
        "Project Settings…Ctrl+Shift+,",
        "Settings…Ctrl+,",
      ]);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");

      // AC2: New Project… creates the folder where the user says and opens it.
      await fromFileMenu(page, "New Project…");
      await expect(dialog(page).getByRole("heading", { name: "New Project" })).toBeVisible();
      await expect(dialog(page).getByRole("textbox", { name: "Name" })).toBeFocused();
      await dialog(page).getByRole("textbox", { name: "Location" }).fill(home.dir);
      await dialog(page).getByRole("textbox", { name: "Name" }).fill("a:b");
      await expect(dialog(page).getByRole("alert")).toHaveText("A name can't contain \\ / : * ? \" < > |");
      await expect(dialog(page).getByRole("button", { name: "Create" })).toBeDisabled();
      await dialog(page).getByRole("textbox", { name: "Name" }).fill("fresh");
      await page.keyboard.press("Enter");
      await expect(dialog(page)).toHaveCount(0);
      const fresh = join(home.dir, "fresh");
      await expect(titleProject(page)).toHaveText("· fresh");
      await expect(workProject(page)).toHaveAttribute("data-project", fresh);
      expect(await isDir(fresh)).toBe(true);

      // AC3: Project Settings… opens Settings on the current project; its picker lists every project.
      await fromSwitcher(page, "Project Settings…");
      await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
      const picker = page.getByRole("main").getByRole("button", { name: /^Project: / });
      await expect(picker).toHaveText("Project: fresh");
      await picker.click();
      await expect(page.getByRole("listbox", { name: "Project" }).getByRole("option")).toHaveText([
        firstName,
        otherName,
        "fresh",
      ]);
      await page.keyboard.press("Escape");
      await app.close();

      // The list and the current project survive a restart, without FEATRA_PROJECT_DIR.
      ({ app, page } = await launch(profile.dir));
      await expect(switcher(page)).toHaveAccessibleName("Switch project: fresh");
      await switcher(page).click();
      await expect(projectMenu(page).getByRole("menuitemradio")).toHaveText([firstName, otherName, "fresh"]);
      await app.close();
    } finally {
      await profile.dispose();
      await first.dispose();
      await other.dispose();
      await home.dispose();
    }
  });
});
