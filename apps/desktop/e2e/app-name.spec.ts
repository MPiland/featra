import { realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { expect, test } from "./fixtures.ts";
import { launch, tempUserData } from "./app.ts";

/**
 * STORY-63: Featra is named Featra, but keeps its profile where it always was. Run without a test userData folder, so
 * Electron picks the folder itself, with the user's home faked by a temporary folder.
 */
test.describe("the app's name (STORY-63)", () => {
  test("is Featra, and the profile stays in the @featra/desktop folder, where existing projects and settings are", async () => {
    test.skip(
      process.platform === "win32",
      "Windows gives Electron the AppData folder from the shell, not the environment: the test can't fake it",
    );
    const home = await tempUserData();
    // macOS: CoreFoundation's home is CFFIXED_USER_HOME, and Library/Application Support is in it. Linux: XDG_CONFIG_HOME.
    const { app } = await launch("", {
      HOME: home.dir,
      CFFIXED_USER_HOME: home.dir,
      XDG_CONFIG_HOME: join(home.dir, ".config"),
    });
    try {
      const paths = await app.evaluate(({ app: electronApp }) => ({
        name: electronApp.getName(),
        appData: electronApp.getPath("appData"),
        userData: electronApp.getPath("userData"),
      }));
      expect(paths.name).toBe("Featra");
      expect(paths.userData).toBe(join(paths.appData, "@featra", "desktop"));
      // In the fake home, not the real profile.
      expect(await realpath(paths.userData)).toContain(`${await realpath(home.dir)}${sep}`);
    } finally {
      await app.close();
      await home.dispose();
    }
  });
});
