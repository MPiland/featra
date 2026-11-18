import { type ChildProcess, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { test, type ElectronApplication, type TestInfo } from "@playwright/test";

/**
 * What a failed e2e test keeps of each app it launched (BUG-30): a screenshot of each window and the app's own trace,
 * with its actions, DOM snapshots and screencast. Playwright's `trace` option only records browser contexts, not an
 * Electron app, so the app is traced here, from launch until it closes. Both are saved to the test's output folder as
 * `electron-<n>-window-<w>.png` and `electron-<n>.zip`; `preserveOutput: "failures-only"` drops them for a test that
 * passes. A test that fails or times out before it closes its app gets them too: the evidence fixture (`fixtures.ts`)
 * closes what it left running, after the test, when Playwright gives fixture teardown its own time.
 */

/** The annotation each kept file is named with, for the reporter and for tests. */
export const EVIDENCE = "app evidence";

type Annotation = { type: string; description?: string };

/** The files kept for a test, once each, from its annotations. */
export function keptFiles(...annotations: readonly (readonly Annotation[])[]): string[] {
  const all = annotations.flat();
  return [...new Set(all.flatMap((a) => (a.type === EVIDENCE && a.description ? [a.description] : [])))];
}

const SCREENSHOT_MS = 10_000;
const CLOSE_MS = 15_000;
let launches = 0;

/** Each launched app not yet closed, with what saves its evidence. */
const openApps = new Map<ElectronApplication, () => Promise<void>>();

/**
 * Screenshots taken while the test was still passing, when a spec closed its app: written only if the test then fails.
 * A spec that closes its app in `finally` after a failed step closes it before Playwright marks the test failed.
 */
let unsaved: { info: TestInfo; path: string; png: Buffer }[] = [];

const failing = (info: TestInfo) => info.status !== info.expectedStatus;

async function save(info: TestInfo, path: string, png: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, png);
  name(info, path);
}

function name(info: TestInfo, path: string): void {
  info.annotations.push({ type: EVIDENCE, description: path });
}

/** Starts tracing a launched app; its `close` saves the evidence first. */
export function traceUntilClosed(app: ElectronApplication): void {
  const context = app.context();
  const started = context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  let saved: Promise<void> | undefined;
  const keep = (afterTest = false) =>
    (saved ??= keepEvidence(
      app,
      started.then(() => context),
      afterTest,
    ));
  openApps.set(app, () => keep(true));
  app.once("close", () => openApps.delete(app));
  const close = app.close.bind(app);
  app.close = async () => {
    await keep();
    openApps.delete(app);
    await close();
  };
}

/** Saves a screenshot of each shown window, then the trace, and names them on the test for the reporter. */
async function keepEvidence(
  app: ElectronApplication,
  tracing: Promise<ReturnType<ElectronApplication["context"]>>,
  afterTest: boolean,
): Promise<void> {
  const info = test.info();
  launches += 1;
  const n = launches;
  const shots: { path: string; png: Buffer }[] = [];
  for (const [w, page] of app.windows().entries()) {
    // A hidden or minimised window (in the tray) draws no frame, so a screenshot of it would only wait.
    const shown = await page.evaluate(() => document.visibilityState === "visible").catch(() => false);
    if (!shown) continue;
    const png = await page.screenshot({ timeout: SCREENSHOT_MS }).catch(() => undefined);
    if (png) shots.push({ path: info.outputPath(`electron-${n}-window-${w + 1}.png`), png });
  }
  const now = afterTest || failing(info);
  for (const shot of shots) {
    if (now) await save(info, shot.path, shot.png);
    else unsaved.push({ info, ...shot });
  }
  const trace = info.outputPath(`electron-${n}.zip`);
  await tracing
    .then((context) => context.tracing.stop({ path: trace }))
    .then(
      () => name(info, trace),
      () => undefined,
    );
}

/** Ends a process and, on Windows, the processes it started (Electron's GPU, renderer and utility processes). */
function kill(proc: ChildProcess): void {
  if (process.platform === "win32" && proc.pid !== undefined) {
    try {
      execFileSync("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      // Already gone, or taskkill refused: fall back to the main process.
    }
  }
  proc.kill();
}

/**
 * Closes every app the test left running, after saving its evidence (BUG-30): a spec closes its app at the end of
 * `try`, so one that fails or times out never does. The evidence is saved before the close is timed, so killing an app
 * that won't close can't cut off its trace. Then writes the screenshots a spec's own close took if the test failed.
 */
export async function closeLeftRunning(): Promise<void> {
  for (const [app, keep] of openApps) {
    openApps.delete(app);
    const proc = app.process();
    if (proc.exitCode !== null || proc.signalCode !== null) continue;
    await keep();
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), CLOSE_MS)));
    const closed = app.close().then(
      () => true,
      () => false,
    );
    if (!(await Promise.race([closed, timedOut]))) kill(proc);
    clearTimeout(timer);
  }
  const held = unsaved;
  unsaved = [];
  for (const { info, path, png } of held) {
    if (failing(info)) await save(info, path, png);
  }
}
