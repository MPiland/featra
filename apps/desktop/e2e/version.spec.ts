import { expect, test } from "./fixtures.ts";
import { launch, tempUserData } from "./app.ts";
import { pressShortcut } from "./keys.ts";
import { atReviewSize, uxShot } from "./ux-shot.ts";
import { readManifest } from "../packaging/modules.ts";
import { DESKTOP } from "../packaging/paths.ts";

/**
 * STORY-65: the app shows its version under Settings, in the real app. The version is apps/desktop/package.json's:
 * the one a release's tag must match and its installers are named with. Only the profile folder is faked.
 */
test.describe("the app's version (STORY-65)", () => {
  test("Settings shows the app's version, the one a release is tagged with, on every page", async () => {
    const { version } = await readManifest(DESKTOP);
    const profile = await tempUserData();
    const { app, page } = await launch(profile.dir);
    try {
      await atReviewSize(app, page);
      await pressShortcut(page, "settings");
      const pages = page.getByRole("navigation", { name: "Settings pages" });
      const shown = pages.getByText(`Version ${version}`, { exact: true });
      await expect(shown).toBeVisible();
      expect(await app.evaluate(({ app: electronApp }) => electronApp.getVersion())).toBe(version);
      await uxShot(page, "feat-19-settings-version", shown);
      await pages.getByRole("button", { name: "Keyboard shortcuts" }).click();
      await expect(page.getByRole("heading", { name: "Keyboard shortcuts", level: 2 })).toBeVisible();
      await expect(shown).toBeVisible();
    } finally {
      await app.close();
      await profile.dispose();
    }
  });
});
