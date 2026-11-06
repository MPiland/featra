import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

/** Past this size the log is moved to `main.old.log` on the next start, so it never grows without bound. */
export const MAX_LOG_BYTES = 1024 * 1024;

export interface Log {
  /** `<userData>/logs/main.log`: what Help > Troubleshooting > Show Logs opens. */
  readonly file: string;
  info: (message: string) => void;
  /** Resolves once every line logged so far is on disk. */
  flush: () => Promise<void>;
}

/**
 * The main process's log: one timestamped line per lifecycle event (start, hide to tray, quit, troubleshooting).
 * Writes are queued and never throw; a log that can't be written must not take the app down.
 */
export function createLog(dir: string, now: () => Date = () => new Date()): Log {
  const file = join(dir, "main.log");
  let queue: Promise<void> = (async () => {
    await mkdir(dir, { recursive: true });
    const size = await stat(file).then(
      (s) => s.size,
      () => 0,
    );
    if (size > MAX_LOG_BYTES) await rename(file, join(dir, "main.old.log"));
  })().catch(() => {});

  return {
    file,
    info(message) {
      const line = `${now().toISOString()} ${message}\n`;
      queue = queue.then(() => appendFile(file, line, "utf8")).catch(() => {});
    },
    flush: () => queue,
  };
}
