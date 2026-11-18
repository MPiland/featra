import { launch, tempUserData } from "./app.ts";
import { test } from "./fixtures.ts";

// TEMPORARY BUG-30 probe: times out waiting on a locator that never comes, to check what CI keeps. Reverted next.
test("BUG-30 probe: times out waiting on a missing locator", async () => {
  const profile = await tempUserData();
  try {
    const { app, page } = await launch(profile.dir);
    await page.getByRole("button", { name: "BUG-30 probe: not in the app" }).click();
    await app.close();
  } finally {
    await profile.dispose();
  }
});
