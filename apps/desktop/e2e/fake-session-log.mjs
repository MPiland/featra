import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The session's file, where Claude keeps it: `projects/<the cwd, non-alphanumerics as "-">/<session>.jsonl`. Claude
 * names the folder after the cwd's real path, so on Windows a short 8.3 name (`RUNNER~1`) is spelled out in full.
 */
const sessionFile = (home, cwd, session) =>
  join(home, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"), `${session}.jsonl`);

/** The session's file, kept as Claude keeps it, when the test gave Claude a config folder of its own. */
export function sessionLog(options) {
  const home = process.env.CLAUDE_CONFIG_DIR;
  if (!home) return { id: "fake-session", earlier: [], write: () => {} };
  const id = options.resume ?? randomUUID();
  const cwd = realpathSync.native(options.cwd);
  const file = sessionFile(home, cwd, id);
  const lines = existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  let parent = lines.at(-1)?.uuid ?? null;
  const line = (type, message) => {
    const uuid = randomUUID();
    const entry = { type, parentUuid: parent, uuid, timestamp: new Date().toISOString(), isSidechain: false };
    parent = uuid;
    return JSON.stringify({
      ...entry,
      userType: "external",
      cwd,
      sessionId: id,
      version: "2.1.0",
      message,
    });
  };
  const earlier = lines.filter((l) => l.type === "user" && typeof l.message.content === "string");
  return {
    id,
    earlier: earlier.map((l) => l.message.content),
    write: (text, reply) => {
      mkdirSync(dirname(file), { recursive: true });
      const user = line("user", { role: "user", content: text });
      const answer = line("assistant", {
        id: `msg_${randomUUID()}`,
        role: "assistant",
        content: [{ type: "text", text: reply }],
      });
      appendFileSync(file, `${user}\n${answer}\n`);
    },
  };
}
