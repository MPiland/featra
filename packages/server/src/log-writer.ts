/**
 * Writes the entries agents log (STORY-47) into the chat's working folder, so they are committed with that branch.
 * Appends are serialised per file, so two agents logging at once both land; each entry is remembered until Undo, which
 * removes exactly that entry (work-format `removeEntry`) and nothing the user or other entries added since.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  addEntry,
  CHAT_MESSAGES,
  formatEntry,
  isRecord,
  LOG_FILES,
  newLogFile,
  removeEntry,
  type LoggedEntry,
  type LogFile,
  type LogInput,
} from "@featra/work-format";
import { projectKey } from "./allowed-projects.ts";
import { ChatError } from "./chat-error.ts";

/** The disk the log files are read from and written to. A missing file reads as null. */
export interface LogFs {
  read: (file: string) => Promise<string | null>;
  write: (file: string, text: string) => Promise<void>;
}

/** The real disk: writes replace the file atomically, so a crash never leaves half an entry. */
export const nodeLogFs: LogFs = {
  async read(file) {
    try {
      return await readFile(file, "utf8");
    } catch (err) {
      if (isRecord(err) && err.code === "ENOENT") return null;
      throw err;
    }
  },
  async write(file, text) {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, text, "utf8");
    await rename(tmp, file);
  },
};

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
  chat: string;
  path: string;
  file: LogFile;
  written: string;
}

export function createLogWriter({
  fs = nodeLogFs,
  now = () => new Date(),
  newId = () => randomBytes(4).toString("hex"),
  platform = process.platform,
}: LogWriterDeps = {}): LogWriter {
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

  return {
    append(dir, chat, input, session) {
      const file = LOG_FILES[input.kind];
      const path = join(dir, file);
      return inOrder(path, async () => {
        const id = newId();
        const written = formatEntry(input, { date: now().toISOString().slice(0, 10), session, id });
        const text = (await fs.read(path)) ?? newLogFile(file);
        await fs.write(path, addEntry(text, written));
        entries.set(id, { chat, path, file, written });
        return { entry: id, file, summary: input.kind === "decision" ? input.decision : input.question };
      });
    },
    async undo(chat, entry) {
      const found = entries.get(entry);
      // An entry another chat logged is not this chat's to take back.
      if (!found || found.chat !== chat) throw new ChatError(CHAT_MESSAGES.noEntry);
      await inOrder(found.path, async () => {
        const text = await fs.read(found.path);
        const result =
          text === null ? ({ ok: false, reason: "gone" } as const) : removeEntry(text, entry, found.written);
        if (!result.ok && result.reason === "edited") throw new ChatError(CHAT_MESSAGES.editedEntry);
        // Already gone from the file (the user deleted it): taking it back has nothing left to do.
        if (result.ok) await fs.write(found.path, result.text);
        entries.delete(entry);
      });
    },
  };
}
