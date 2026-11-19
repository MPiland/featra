import { execFileSync } from "node:child_process";
import type { ElectronApplication } from "@playwright/test";

/** Whether the e2e suite runs on macOS (STORY-63). */
export const mac = process.platform === "darwin";

/**
 * One of the frontmost app's `lsappinfo` fields (`pid`, `name`): the app whose menu bar shows and which gets the
 * keyboard. `lsappinfo` needs no Accessibility permission. Undefined when it can't say.
 */
function frontmost(field: "pid" | "name"): string | undefined {
  try {
    const asn = execFileSync("lsappinfo", ["front"], { encoding: "utf8" }).trim();
    const out = execFileSync("lsappinfo", ["info", "-only", field, asn], { encoding: "utf8" });
    return /=\s*"?([^"\n]+)/.exec(out)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

/** macOS only: the process id of the frontmost app. Undefined when it can't say. */
export function macFrontmostPid(): number | undefined {
  const pid = frontmost("pid");
  return pid === undefined ? undefined : Number(pid);
}

/**
 * Puts Finder in front, as if the user were working there, and resolves once it is the frontmost app. `open -a` goes
 * through LaunchServices, which needs no Automation permission, unlike AppleScript.
 */
export async function finderInFront(): Promise<void> {
  execFileSync("open", ["-a", "Finder"]);
  const deadline = Date.now() + 5_000;
  while (frontmost("name") !== "Finder") {
    if (Date.now() > deadline) {
      throw new Error(`Finder didn't come to the front in 5 s: ${frontmost("name") ?? "no app"} is in front.`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * What macOS does before Featra hears of a Dock click, or of the user opening it again: it makes Featra the active
 * app, in front of the one the user was in. The harness fakes those events from outside, so it fakes the activation
 * too, as `grantForeground` fakes Windows' grant. Featra's own handler must then show and focus its window.
 */
export const activateAsMacOs = (app: ElectronApplication) =>
  app.evaluate(({ app: electronApp }) => electronApp.focus({ steal: true }));
