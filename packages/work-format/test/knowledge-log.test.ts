import { describe, expect, it } from "vitest";
import {
  addEntry,
  appendEntry,
  chatUndoParams,
  entryMarker,
  foldChat,
  formatEntry,
  LOG_LIMITS,
  mcpEnabled,
  newLogFile,
  normalizeChatEvent,
  parseAgentRequest,
  parseDecision,
  parseLogInput,
  parseQuestion,
  parseRequest,
  removeEntry,
  type DecisionInput,
} from "../src/index.ts";

const CTX = { date: "2026-11-09", session: "Developer chat 1a2b3c4d", id: "abc12345" };
const decision = (extra: Partial<DecisionInput> = {}): DecisionInput => ({
  kind: "decision",
  decision: "Use a socket",
  why: "Scoped secrets.",
  rejected: [],
  card: null,
  ...extra,
});

describe("what the tools take", () => {
  it("accepts a decision, trims it to one line and keeps the card", () => {
    expect(parseDecision({ decision: "  Use a\nsocket ", why: "Scoped   secrets.", card: "STORY-47" })).toEqual({
      ok: true,
      value: decision({ decision: "Use a socket", card: "STORY-47" }),
    });
  });

  it("accepts a question with its context", () => {
    expect(parseQuestion({ question: "Keep Undo?", context: "Assumed no." })).toEqual({
      ok: true,
      value: { kind: "question", question: "Keep Undo?", context: "Assumed no.", card: null },
    });
  });

  it.each([
    ["no input", undefined, '"decision" is required'],
    ["no why", { decision: "x" }, '"why" is required'],
    ["a number for why", { decision: "x", why: 3 }, '"why" is required'],
    ["a blank decision", { decision: "  ", why: "y" }, '"decision" is required'],
    ["a long decision", { decision: "x".repeat(LOG_LIMITS.headline + 1), why: "y" }, "too long"],
    ["rejected that isn't a list", { decision: "x", why: "y", rejected: "no" }, '"rejected" must be a list'],
    ["an empty alternative", { decision: "x", why: "y", rejected: [""] }, '"rejected" is required'],
    ["too many alternatives", { decision: "x", why: "y", rejected: Array(11).fill("a") }, "too many"],
    ["a card that isn't an id", { decision: "x", why: "y", card: "my card" }, "card id such as STORY-47"],
  ])("refuses %s, saying what to fix", (_, input, message) => {
    const parsed = parseDecision(input);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.error).toContain(message);
  });

  it("refuses a question without context, and an unknown kind", () => {
    expect(parseQuestion({ question: "x" })).toMatchObject({ ok: false });
    expect(parseLogInput("other", {})).toEqual({ ok: false, error: "Unknown kind of entry." });
    expect(parseLogInput("question", { question: "q", context: "c" }).ok).toBe(true);
  });

  it("drops anything in the text that could pass for an entry's marker", () => {
    const parsed = parseDecision({ decision: "Hide <!-- featra:abc12345 --> this", why: "y" });
    expect(parsed.ok && parsed.value.decision).toBe("Hide this");
  });
});

describe("the entry", () => {
  it("is a dated list item with its details under it, and a marker", () => {
    expect(formatEntry(decision({ rejected: ["Files: slow", "Stdout: no"], card: "STORY-47" }), CTX)).toBe(
      [
        "- 2026-11-09 — Use a socket <!-- featra:abc12345 -->",
        "  - Why: Scoped secrets.",
        "  - Rejected: Files: slow; Stdout: no",
        "  - Session: Developer chat 1a2b3c4d",
        "  - Card: STORY-47",
      ].join("\n"),
    );
  });

  it("leaves out Rejected and Card when there are none, and gives a question its context", () => {
    const entry = formatEntry({ kind: "question", question: "Keep Undo?", context: "Assumed no.", card: null }, CTX);
    expect(entry).toBe(
      [
        "- 2026-11-09 — Keep Undo? <!-- featra:abc12345 -->",
        "  - Context: Assumed no.",
        "  - Session: Developer chat 1a2b3c4d",
      ].join("\n"),
    );
    expect(formatEntry(decision(), CTX)).not.toMatch(/Rejected|Card/);
  });

  it("starts a missing file from the header Featra init writes", () => {
    expect(newLogFile("decisions.md")).toMatch(/^# /);
    expect(newLogFile("open-questions.md")).toMatch(/^# /);
  });
});

describe("adding and removing an entry", () => {
  const one = formatEntry(decision({ decision: "One" }), { ...CTX, id: "one" });
  const two = formatEntry(decision({ decision: "Two" }), { ...CTX, id: "two" });

  it("adds after a heading with a blank line, and after an entry without one", () => {
    const first = addEntry("# Decisions\n", one);
    expect(first).toBe(`# Decisions\n\n${one}\n`);
    expect(addEntry(first, two)).toBe(`# Decisions\n\n${one}\n${two}\n`);
  });

  it("adds to an empty file, and to a file with no final line break", () => {
    expect(addEntry("", one)).toBe(`${one}\n`);
    expect(addEntry("# Decisions", one)).toBe(`# Decisions\n\n${one}\n`);
  });

  it("removes only the entry its marker names", () => {
    const file = addEntry(addEntry("# Decisions\n", one), two);
    expect(removeEntry(file, "one", one)).toEqual({ ok: true, text: `# Decisions\n\n${two}\n` });
    expect(removeEntry(file, "two", two)).toEqual({ ok: true, text: `# Decisions\n\n${one}\n` });
  });

  it("says edited when a line of the entry changed, and gone when its marker is not in the file", () => {
    const file = addEntry("# Decisions\n", one);
    expect(removeEntry(file.replace("Scoped", "Scoped!"), "one", one)).toEqual({ ok: false, reason: "edited" });
    expect(removeEntry(file.replace("  - Session", "  - Session extra\n  - Session"), "one", one)).toEqual({
      ok: false,
      reason: "edited",
    });
    expect(removeEntry("# Decisions\n", "one", one)).toEqual({ ok: false, reason: "gone" });
  });

  it("works on CRLF files without mixing in LF", () => {
    const crlf = addEntry("# Decisions\r\n", one);
    expect(crlf).not.toMatch(/[^\r]\n/);
    expect(removeEntry(crlf, "one", one)).toEqual({ ok: true, text: "# Decisions\r\n\r\n" });
  });

  it("names its marker the way the entry carries it", () => {
    expect(one).toContain(entryMarker("one"));
  });
});

describe("what the chat does with logged entries", () => {
  it("normalizes logged and log-undone events and refuses malformed ones", () => {
    expect(normalizeChatEvent({ type: "logged", entry: "e1", file: "decisions.md", summary: "S" })).toEqual({
      type: "logged",
      entry: "e1",
      file: "decisions.md",
      summary: "S",
    });
    expect(normalizeChatEvent({ type: "logged", entry: "e1", file: "other.md", summary: "S" })).toBeNull();
    expect(normalizeChatEvent({ type: "logged", entry: "", file: "decisions.md", summary: "S" })).toBeNull();
    expect(normalizeChatEvent({ type: "log-undone", entry: "e1" })).toEqual({ type: "log-undone", entry: "e1" });
    expect(normalizeChatEvent({ type: "log-undone" })).toBeNull();
  });

  it("shows a logged row, and marks only that one undone", () => {
    const view = foldChat([
      { type: "logged", entry: "e1", file: "decisions.md", summary: "One" },
      { type: "logged", entry: "e2", file: "open-questions.md", summary: "Two?" },
      { type: "log-undone", entry: "e1" },
    ]);
    expect(view.items).toEqual([
      expect.objectContaining({ kind: "log", entry: "e1", file: "decisions.md", undone: true }),
      expect.objectContaining({ kind: "log", entry: "e2", file: "open-questions.md", undone: false }),
    ]);
  });

  it("takes chat.undoLog params only with a chat and an entry", () => {
    expect(chatUndoParams({ id: "c", entry: "e" })).toEqual({ id: "c", entry: "e" });
    expect(chatUndoParams({ id: "c" })).toBeNull();
    expect(chatUndoParams({ entry: "e" })).toBeNull();
    expect(parseRequest(JSON.stringify({ id: 1, method: "chat.undoLog", params: {} }))).toEqual({
      id: 1,
      method: "chat.undoLog",
      params: {},
    });
  });
});

describe("what an agent's MCP may ask the server", () => {
  it("is log.append only, as one request with an id", () => {
    expect(parseAgentRequest(JSON.stringify({ id: 4, method: "log.append", params: { a: 1 } }))).toEqual({
      id: 4,
      method: "log.append",
      params: { a: 1 },
    });
    expect(parseAgentRequest(JSON.stringify({ id: 4, method: "chat.approve" }))).toEqual({
      id: 4,
      error: "Unknown method.",
    });
    expect(parseAgentRequest("{")).toEqual({ id: null, error: "Malformed request." });
    expect(parseAgentRequest(JSON.stringify({ method: "log.append" }))).toEqual({
      id: null,
      error: "Malformed request.",
    });
  });
});

describe("whether a project's agents get the MCP", () => {
  it("is on by default", () => {
    expect(mcpEnabled(null, undefined)).toBe(true);
  });

  it("follows the app default, and the project's own setting wins", () => {
    expect(mcpEnabled(null, false)).toBe(false);
    expect(mcpEnabled("version: 1\n", false)).toBe(false);
    expect(mcpEnabled("mcp: true\n", false)).toBe(true);
    expect(mcpEnabled("mcp: false\n", true)).toBe(false);
  });

  it("falls back to the default when the config can't be read", () => {
    expect(mcpEnabled("stages: []\n", true)).toBe(true);
    expect(mcpEnabled("{{{", false)).toBe(false);
  });
});

describe("a marker an agent forges", () => {
  it.each([
    ["nested in another", "Hide <!-- featra:<!-- featra:x -->abc12345 --> this"],
    ["split by another", "Keep <!<!-- featra:a -->-- featra:abc12345 --> this"],
    ["nested several deep", "Keep <!-- featra:<!-- featra:<!-- featra:a -->b -->c -->abc12345 --> this"],
  ])("does not survive when it is %s", (_, forged) => {
    const parsed = parseDecision({ decision: forged, why: `Why ${forged}`, rejected: [forged] });
    expect(parsed.ok).toBe(true);
    expect(JSON.stringify(parsed)).not.toMatch(/featra:/);
  });
});

describe("a file with Windows or mixed line endings", () => {
  const one = formatEntry(decision({ decision: "One" }), { ...CTX, id: "one" });
  const two = formatEntry(decision({ decision: "Two" }), { ...CTX, id: "two" });

  it("adds an entry in CRLF to a CRLF file, with nothing in LF", () => {
    const file = addEntry(addEntry("# Decisions\r\n", one), two);
    expect(file).not.toMatch(/[^\r]\n/);
    expect(file.startsWith("# Decisions\r\n\r\n- 2026-11-09")).toBe(true);
  });

  it("adds to a file whose last line break is LF in LF, and leaves the lines before it as they are", () => {
    const before = "# Decisions\r\nMine\r\nMore\n";
    const after = addEntry(before, one);
    expect(after.startsWith(before)).toBe(true);
    expect(after.slice(before.length)).not.toContain("\r");
  });

  it("adds to a mixed file whose last line break is CRLF in CRLF", () => {
    const before = "# Decisions\nMine\r\n";
    const after = addEntry(before, one);
    expect(after.startsWith(before)).toBe(true);
    expect(after.slice(before.length)).not.toMatch(/[^\r]\n/);
  });

  it("removes an entry without changing any other line's ending", () => {
    const head = "# Decisions\nlf line\r\ncrlf line\n";
    const file = `${head}${addEntry("", one).replaceAll("\n", "\r\n")}tail\r\n`;
    const result = removeEntry(file, "one", one);
    expect(result).toEqual({ ok: true, text: `${head}tail\r\n` });
  });

  it("removes an entry from a file with no line break at its end", () => {
    const file = `# Decisions\n\n${one.replaceAll("\n", "\r\n")}`;
    expect(removeEntry(file, "one", one)).toEqual({ ok: true, text: "# Decisions\n\n" });
  });

  it("takes the entry back out of what it was added to, byte for byte, in each ending", () => {
    for (const base of ["# Notes\nMine\n", "# Notes\r\nMine\r\n", "# Notes\nMine\r\n", "# Notes\r\nMine"]) {
      const added = appendEntry(base, one);
      const removed = removeEntry(added.text, "one", one, added.gap);
      expect(removed.ok && removed.text).toBe(base.endsWith("\n") ? base : `${base}${eolAfter(base)}`);
    }
  });
});

/** The line break `appendEntry` adds to a file that has none at its end: its last one's. */
const eolAfter = (file: string) => (/\r\n[^\n]*$/.test(file) ? "\r\n" : "\n");

describe("taking an entry back out", () => {
  const one = formatEntry(decision({ decision: "One" }), { ...CTX, id: "one" });
  const two = formatEntry(decision({ decision: "Two" }), { ...CTX, id: "two" });

  it("says whether it put a blank line before the entry", () => {
    expect(appendEntry("# Decisions\n", one).gap).toBe(true);
    expect(appendEntry("# Decisions\n\n", one).gap).toBe(false);
    expect(appendEntry(addEntry("# Decisions\n", one), two).gap).toBe(false);
  });

  it("removes that blank line too when nothing follows the entry", () => {
    const added = appendEntry("# Decisions\nMine\n", one);
    expect(removeEntry(added.text, "one", one, added.gap)).toEqual({ ok: true, text: "# Decisions\nMine\n" });
  });

  it("keeps a blank line that was already there", () => {
    const added = appendEntry("# Decisions\n\n", one);
    expect(removeEntry(added.text, "one", one, added.gap)).toEqual({ ok: true, text: "# Decisions\n\n" });
  });

  it("keeps the blank line when an entry logged after it still needs it", () => {
    const first = appendEntry("# Decisions\n", one);
    const file = addEntry(first.text, two);
    expect(removeEntry(file, "one", one, first.gap)).toEqual({ ok: true, text: `# Decisions\n\n${two}\n` });
  });

  it.each([
    ["a bullet under it", "\n    - a note of mine"],
    ["a line indented one level", "\n  - Extra: mine"],
    ["a line indented deeper", "\n        deep"],
    ["a tab-indented line", "\n\tnote"],
  ])("refuses an entry with %s", (_, extra) => {
    const file = `# Decisions\n\n${one}${extra}\n`;
    expect(removeEntry(file, "one", one, true)).toEqual({ ok: false, reason: "edited" });
  });

  it("is not stopped by an unindented line after it", () => {
    expect(removeEntry(`${one}\nMy own paragraph\n`, "one", one)).toEqual({ ok: true, text: "My own paragraph\n" });
  });
});
