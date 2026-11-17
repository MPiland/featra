import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";

/** Where the screens land: CI uploads this folder as `ux-screens-windows` / `ux-screens-ubuntu` for design review. */
const UX_DIR = join(
  fileURLToPath(new URL("../test-results/ux", import.meta.url)),
  process.platform === "win32" ? "windows" : process.platform,
);

/**
 * Saves the whole window, at the app's normal size, as `test-results/ux/<os>/<name>.png` for the design review of a
 * story's screens (decisions.md, 2026-11-16, "Design review of screenshots"). Call it from a journey right after the
 * assertions that put a new or changed screen in the state to review; `show` scrolls that part into view first.
 *
 * It is evidence for a reviewer, not a check: it asserts nothing and never fails or slows a test for long. A screen
 * that can't be taken is logged and skipped. Names are unique across the suite: `<feat>-<surface>-<state>`.
 */
export async function uxShot(page: Page, name: string, show?: Locator): Promise<void> {
  try {
    await show?.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
    await mkdir(UX_DIR, { recursive: true });
    await page.screenshot({ path: join(UX_DIR, `${name}.png`), timeout: 5_000 });
  } catch (err) {
    process.stderr.write(`uxShot: skipped ${name}: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
