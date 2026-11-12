/**
 * Writes the entries agents log (STORY-47) into the chat's working folder, so they are committed with that branch.
 * Appends are serialised per file, so two agents logging at once both land; each entry is remembered until Undo, which
 * removes exactly that entry (work-format `removeEntry`) and nothing the user or other entries added since. A write
 * never replaces a file the user changed since it was read: it reads again and starts over.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  appendEntry,
  CHAT_MESSAGES,
  formatEntry,
  isRecord,
  LOG_FILES,
  newLogFile,
  removeEntry,
  type LoggedEntry,
  type LogInput,
} from "@featra/work-format";
import { projectKey } from "./allowed-projects.ts";
import { isBusy, retryBusy } from "./busy-retry.ts";
import { ChatError } from "./chat-error.ts";

/** The disk the log files are read from and written to. A missing file reads as null. */
export interface LogFs {
  read: (file: string) => Promise<string | null>;
  /**
   * Replaces the file with `text`, unless it is no longer `base` (what the caller read): then nothing is written and
   * "changed" comes back, so the caller can start again from what is there now.
   */
  write: (file: string, text: string, base: string | null) => Promise<"changed" | void>;
}

export interface NodeLogFsDeps {
  rename?: typeof rename;
  pause?: (ms: number) => Promise<unknown>;
}

/** A file's text, or null when it isn't there. */
async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if (isRecord(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

/** The real disk: writes replace the file atomically, so a crash never leaves half an entry. */
export function createNodeLogFs({ rename: move = rename, pause }: NodeLogFsDeps = {}): LogFs {
  return {
    read: readText,
    async write(file, text, base) {
      await mkdir(dirname(file), { recursive: true });
      // A name of its own, so two writers (or a crash's leftover) never share a temporary file.
      const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        await writeFile(tmp, text, "utf8");
        // The user may have saved the file since it was read: look again just before it is replaced.
        if ((await readText(file)) !== base) return "changed";
        try {
          return await retryBusy(() => move(tmp, file), pause);
        } catch (err) {
          if (!isBusy(err)) throw err;
          throw new ChatError(`Couldn't write ${basename(file)}: another program has it open.`, { cause: err });
        }
      } finally {
        await rm(tmp, { force: true });
      }
    },
  };
}

export const nodeLogFs = createNodeLogFs();

/** An entry that was logged, as the chat shows it. */
export interface Logged extends LoggedEntry {
  summary: string;
}

export interface LogWriter {
  /** Adds the entry to the folder's `decisions.md` or `open-questions.md` (made if missing), for `chat`. */
  append: (dir: string, chat: string, input: LogInput, session: string) => Promise<Logged>;
  /** Removes the entry `chat` logged; throws a ChatError when it is unknown, or the user has edited it since. */
  undo: (chat: string, entry: string) => Promise<void>;
}

export interface LogWriterDeps {
  fs?: LogFs;
  /** The clock entries are dated with. */
  now?: () => Date;
  newId?: () => string;
  platform?: string;
}

interface Remembered {
  path: string;
  written: string;
  /** Whether a blank line was put before it. */
  gap: boolean;
}

const keyOf = (chat: string, entry: string) => `${chat}\0${entry}`;

/** How many times a write starts over when the user changed the file under it. */
const ATTEMPTS = 5;

export function createLogWriter({
  fs = nodeLogFs,
  now = () => new Date(),
  newId = () => randomBytes(8).toString("hex"),
  platform = process.platform,
}: LogWriterDeps = {}): LogWriter {
  /** Entries by chat and id: one chat can't take back what another logged, whatever it is told. */
  const entries = new Map<string, Remembered>();
  const queues = new Map<string, Promise<unknown>>();

  /** Runs `job` after every earlier one on the same file, whether or not they succeeded. */
  function inOrder<T>(path: string, job: () => Promise<T>): Promise<T> {
    const key = projectKey(path, platform);
    const run = (queues.get(key) ?? Promise.resolve()).then(job, job);
    queues.set(
      key,
      run.catch(() => {}),
    );
    return run;
  }

  /**
   * Reads the file, lets `change` give its new text (null: leave it as it is), and writes that unless the file
   * changed in between; then it starts over with what is there now. `change` may throw to refuse.
   */
  async function update<T>(path: string, change: (text: string | null) => { text: string | null; result: T }) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const base = await fs.read(path);
      const done = change(base);
      if (done.text === null || (await fs.write(path, done.text, base)) !== "changed") return done.result;
    }
    throw new ChatError(`${basename(path)} keeps changing. Try again.`);
  }

  return {
    append(dir, chat, input, session) {
      const file = LOG_FILES[input.kind];
      const path = join(dir, file);
      return inOrder(path, async () => {
        const id = newId();
        const written = formatEntry(input, { date: now().toISOString().slice(0, 10), session, id });
        const gap = await update(path, (text) => {
          const added = appendEntry(text ?? newLogFile(file), written);
          return { text: added.text, result: added.gap };
        });
        entries.set(keyOf(chat, id), { path, written, gap });
        return { entry: id, file, summary: input.kind === "decision" ? input.decision : input.question };
      });
    },
    async undo(chat, entry) {
      const found = entries.get(keyOf(chat, entry));
      if (!found) throw new ChatError(CHAT_MESSAGES.noEntry);
      await inOrder(found.path, async () => {
        await update(found.path, (text) => {
          const removed =
            text === null
              ? ({ ok: false, reason: "gone" } as const)
              : removeEntry(text, entry, found.written, found.gap);
          if (!removed.ok && removed.reason === "edited") throw new ChatError(CHAT_MESSAGES.editedEntry);
          // Already gone from the file (the user deleted it): taking it back has nothing left to do.
          return { text: removed.ok ? removed.text : null, result: undefined };
        });
        entries.delete(keyOf(chat, entry));
      });
    },
  };
}
