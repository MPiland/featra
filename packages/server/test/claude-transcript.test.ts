/**
 * STORY-44 AC2: a chat's transcript, read from Claude's own session file by the SDK's real reader. Only the file's
 * folder is faked (`CLAUDE_CONFIG_DIR`); the translation is the adapter's own.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSessionReader } from "../src/claude-sdk.ts";
import { claudeHistory, transcriptEvents, type SessionReader } from "../src/claude-transcript.ts";
import { claudeHome, projectFolder, sessionLines } from "./claude-sessions.ts";
import { sdk } from "./fake-query.ts";

let home: Awaited<ReturnType<typeof claudeHome>>;
let project: Awaited<ReturnType<typeof projectFolder>>;
let reader: SessionReader;

beforeAll(async () => {
  home = await claudeHome();
  project = await projectFolder();
  reader = await loadSessionReader();
});

afterAll(async () => {
  await project.dispose();
  await home.dispose();
});

describe("claudeHistory: a session file read back as chat events", () => {
  it("gives each prompt, reply, tool and result, and ends each turn", async () => {
    const session = await sessionLines(project.dir)
      .prompt("hello")
      .reply("m1", [sdk.text("Hi."), sdk.toolUse("t1", "Read", { file_path: "a.md" })])
      .toolResult("t1", "# A")
      .reply("m2", [sdk.text("It's A.")])
      .prompt("thanks")
      .reply("m3", [sdk.text("Any time.")])
      .write();
    expect(await claudeHistory(reader, session, project.dir)).toEqual([
      { type: "user", text: "hello" },
      { type: "text", block: "m1:0", delta: "Hi." },
      { type: "tool", id: "t1", name: "Read", input: { file_path: "a.md" } },
      expect.objectContaining({ type: "tool-result", id: "t1" }),
      { type: "text", block: "m2:0", delta: "It's A." },
      { type: "turn-end", outcome: "done" },
      { type: "user", text: "thanks" },
      { type: "text", block: "m3:0", delta: "Any time." },
      { type: "turn-end", outcome: "done" },
    ]);
  });

  it("skips a corrupt line and a torn last line", async () => {
    const session = await sessionLines(project.dir)
      .prompt("hello")
      .raw("{not json")
      .reply("m1", [sdk.text("Hi.")])
      .write('{"type":"user","message":{"role":"us');
    expect(await claudeHistory(reader, session, project.dir)).toEqual([
      { type: "user", text: "hello" },
      { type: "text", block: "m1:0", delta: "Hi." },
      { type: "turn-end", outcome: "done" },
    ]);
  });

  it("is null when Claude no longer has the session, or its project", async () => {
    expect(await claudeHistory(reader, randomUUID(), project.dir)).toBeNull();
    expect(await claudeHistory(reader, randomUUID(), `${project.dir}-gone`)).toBeNull();
  });
});

describe("transcriptEvents", () => {
  it("leaves out a subagent's messages, as the live stream does", () => {
    const main = { parent_tool_use_id: null };
    expect(
      transcriptEvents([
        { ...main, type: "user", message: { role: "user", content: [{ type: "text", text: "a" }, sdk.text("b")] } },
        { type: "assistant", parent_tool_use_id: "t1", message: { id: "s1", content: [sdk.text("sub")] } },
        { ...main, type: "assistant", message: { id: "m1", content: [sdk.text("done")] } },
      ]),
    ).toEqual([
      { type: "user", text: "a\nb" },
      { type: "text", block: "m1:0", delta: "done" },
      { type: "turn-end", outcome: "done" },
    ]);
  });

  it("is empty for a session with no messages", () => {
    expect(transcriptEvents([])).toEqual([]);
  });
});
