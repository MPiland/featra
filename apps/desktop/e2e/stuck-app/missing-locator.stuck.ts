import { mkdir } from "node:fs/promises";
import { launch } from "../app.ts";
import { test } from "../fixtures.ts";

/** Times out waiting on a button the app never shows, its app left running for the evidence fixture (BUG-30). */
test("waits on a button the app never shows", async () => {
  const userData = test.info().outputPath("user-data");
  await mkdir(userData, { recursive: true });
  const { page } = await launch(userData);
  await page.getByRole("button", { name: "BUG-30: not in the app" }).click();
});
