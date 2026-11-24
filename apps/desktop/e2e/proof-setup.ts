import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

/**
 * Shared by the proof journeys (STORY-25): the project's dev server is fixture-dev-server.mjs, a static page, and the
 * user sets the project's proof and that server in Settings > Project, as a user would before a story moves to review.
 */
const FIXTURE = fileURLToPath(new URL("./fixture-dev-server.mjs", import.meta.url)).replaceAll("\\", "/");

/** The dev-server command Featra runs in the story's worktree: `{port}` is the port Featra picked. */
export const DEV_SERVER_COMMAND = `node "${FIXTURE}" {port}`;

/** A port nothing on this computer listens on now, for the dev server's URL. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** Opens Settings > Project > Workflow, where the Proof section is, and resolves with that section. */
export async function proofSettings(page: Page) {
  await page.getByRole("navigation", { name: "Featra" }).getByRole("button", { name: "Settings" }).click();
  await page
    .getByRole("navigation", { name: "Settings pages" })
    .getByRole("list", { name: "Project" })
    .getByRole("button", { name: "Workflow" })
    .click();
  const section = page.getByRole("region", { name: "Proof" });
  await expect(section).toBeVisible();
  return section;
}

/** Sets the project's proof to `mode` (an option's label) and its dev server to the fixture's, at `url`. */
export async function setProof(page: Page, mode: "Screenshots" | "Preview", url: string) {
  const section = await proofSettings(page);
  await section.getByRole("radio", { name: mode }).check();
  await expect(section.getByRole("radio", { name: mode })).toBeChecked();
  await section.getByRole("textbox", { name: "Dev-server command" }).fill(DEV_SERVER_COMMAND);
  await section.getByRole("textbox", { name: "Dev-server URL" }).fill(url);
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText("Saved")).toBeVisible();
  return section;
}
