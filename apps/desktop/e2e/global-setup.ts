import { describeDesktop, desktopBlocker, desktopState, grantForeground, stopHelper, wslg } from "./foreground.ts";
import { harnessLeftovers } from "./leftovers.ts";

/**
 * Checks, before any test, that the run can mean something (BUG-4). Fails fast, naming the problem:
 * - harness processes from an earlier or a parallel run are still alive (they would hold windows and the foreground);
 * - on Windows and WSLg, the desktop can't take the harness's faked input, so every focus test would fail on setup:
 *   the screen is locked, a UAC prompt is up, an elevated window is in front, or a foreground grant fails outright.
 */
export default async function globalSetup() {
  const left = harnessLeftovers();
  if (left.length > 0) {
    throw new Error(
      `e2e: harness processes from an earlier or parallel run are still running; end them first:\n  ${left.join("\n  ")}`,
    );
  }
  if (process.platform !== "win32" && !wslg) return;
  try {
    const state = await desktopState();
    const blocker = desktopBlocker(state);
    if (blocker)
      throw new Error(`e2e: the focus tests can't run on this desktop: ${blocker}. ${describeDesktop(state)}`);
    await grantForeground(process.pid); // Windows only; its error names what is in front
  } finally {
    stopHelper();
  }
}
