import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, type ElectronApplication } from "@playwright/test";

/**
 * TEMPORARY diagnostic (STORY-25, the Windows close hang): on Windows, snapshots the app's process tree and, a few
 * seconds after the quit starts, lists which of those processes are still alive, in the test's output and its log.
 */
export async function watchQuit(app: ElectronApplication): Promise<void> {
  if (process.platform !== "win32") return;
  const script = fileURLToPath(new URL("diag-procs.ps1", import.meta.url));
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Root", String(app.process().pid)];
  const diag = spawn("powershell", [...args, "-Out", test.info().outputPath("procs.txt")], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  diag.stdout.pipe(process.stdout);
  await new Promise<void>((ready) => {
    diag.stdout.on("data", (d: Buffer) => d.includes("[diag] ready") && ready());
    diag.once("exit", () => ready());
  });
}
