import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import electronPath from "electron";

// No trailing separator: on Windows a trailing backslash escapes the closing quote of the argument.
const appDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

/** A temporary userData folder: the only storage the app sees. Fakes the platform's storage location. */
export async function tempUserData(): Promise<{ dir: string; dispose: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "featra-e2e-"));
  return { dir, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** Launches the built app (run `pnpm --filter @featra/desktop build` first; `test:e2e` does). */
export async function launch(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env, FEATRA_USER_DATA_DIR: userDataDir } as Record<string, string>;
  delete env.FEATRA_CLIENT_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [appDir],
    env,
  });
  const page = await app.firstWindow();
  await page.getByRole("banner").waitFor();
  return { app, page };
}
