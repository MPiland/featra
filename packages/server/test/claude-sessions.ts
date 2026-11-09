/**
 * Claude's session files, for tests (STORY-44): the real SDK reads them, from a folder of the test's own. Only their
 * location is faked, through `CLAUDE_CONFIG_DIR`; the lines are written as Claude writes them.
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tempFolder } from "./temp-folder.ts";

/** Points Claude's config folder at a temp folder until `dispose`. */
export async function claudeHome() {
  const home = await tempFolder();
  const before = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = home.dir;
  return {
    dir: home.dir,
    dispose: async () => {
      if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = before;
      await home.dispose();
    },
  };
}

/** A project folder, by its real path: Claude names its sessions' folder after it. */
export async function projectFolder() {
  const folder = await tempFolder();
  return { ...folder, dir: await realpath(folder.dir) };
}

/** The session's file: Claude keeps it under `projects/`, in a folder named for the project. */
export const sessionFile = (dir: string, session: string) =>
  join(process.env.CLAUDE_CONFIG_DIR ?? "", "projects", dir.replace(/[^a-zA-Z0-9]/g, "-"), `${session}.jsonl`);

/** Lines of a session, each chained to the one before, as Claude writes them. */
export function sessionLines(dir: string, session: string = randomUUID()) {
  let parent: string | null = null;
  const lines: string[] = [];
  const add = (type: "user" | "assistant", message: unknown, extra: Record<string, unknown> = {}) => {
    const uuid = randomUUID();
    lines.push(
      JSON.stringify({
        type,
        parentUuid: parent,
        uuid,
        timestamp: new Date(Date.UTC(2026, 10, 9, 10, 0, lines.length)).toISOString(),
        isSidechain: false,
        userType: "external",
        cwd: dir,
        sessionId: session,
        version: "2.1.0",
        message,
        ...extra,
      }),
    );
    parent = uuid;
  };
  const self = {
    session,
    prompt: (text: string) => (add("user", { role: "user", content: text }), self),
    reply: (id: string, content: unknown[]) => (add("assistant", { id, role: "assistant", content }), self),
    toolResult: (id: string, content: string) => (
      add("user", { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] }),
      self
    ),
    /** A line that isn't JSON, as a torn write leaves it. */
    raw: (text: string) => (lines.push(text), self),
    write: async (tail = "") => {
      const file = sessionFile(dir, session);
      await mkdir(join(file, ".."), { recursive: true });
      await appendFile(file, `${lines.join("\n")}\n${tail}`, "utf8");
      return session;
    },
  };
  return self;
}
