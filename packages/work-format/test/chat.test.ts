/** STORY-5: roles, chat events on the wire, the chat view's fold, and tool summaries. */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ROLES,
  chatSendParams,
  chatStartParams,
  EMPTY_CHAT,
  foldChat,
  normalizeChatEvent,
  normalizeChatSnapshot,
  normalizeRoles,
  parsePush,
  SERVER_METHODS,
  SUMMARY_MAX,
  toolSummary,
  type ChatEvent,
} from "../src/index.ts";

describe("AC5: the built-in roles", () => {
  it("are the five, in picker order, each for Claude in Ask with a prompt, model and effort", () => {
    expect(BUILT_IN_ROLES.map((r) => r.name)).toEqual(["Researcher", "Analyst/Refiner", "Dev Lead", "Developer", "QA"]);
    for (const r of BUILT_IN_ROLES) {
      expect(r).toMatchObject({ provider: "claude", permission: "ask" });
      expect(r.prompt.length).toBeGreaterThan(40);
      expect(["opus", "sonnet", "haiku"]).toContain(r.model);
    }
    expect(new Set(BUILT_IN_ROLES.map((r) => r.id)).size).toBe(5);
  });

  it("come back from the socket as they went, and anything malformed is dropped", () => {
    const wire: unknown = JSON.parse(JSON.stringify(BUILT_IN_ROLES));
    expect(normalizeRoles(wire)).toEqual(BUILT_IN_ROLES);
    expect(normalizeRoles([{ ...BUILT_IN_ROLES[0], permission: "bypass" }, { id: "x" }, null])).toEqual([]);
    expect(normalizeRoles("roles")).toEqual([]);
  });
});

describe("the chat protocol (ADR 0015, ADR 0018)", () => {
  it("has the chat methods and the chat.event push", () => {
    expect(SERVER_METHODS).toEqual(
      expect.arrayContaining(["chat.roles", "chat.start", "chat.watch", "chat.send", "chat.stop", "chat.archive"]),
    );
    const push = { event: "chat.event", watch: 3, data: { type: "user", text: "hi" } };
    expect(parsePush(JSON.stringify(push))).toEqual(push);
  });

  it("checks the params", () => {
    expect(chatStartParams({ dir: "/p", role: "qa" })).toEqual({ dir: "/p", role: "qa" });
    expect(chatStartParams({ dir: "/p" })).toBeNull();
    expect(chatSendParams({ id: "c1", text: "line one\nline two" })).toEqual({ id: "c1", text: "line one\nline two" });
    expect(chatSendParams({ id: "c1", text: " \n " })).toBeNull();
  });

  it("reads each event, and drops a malformed one", () => {
    const events: ChatEvent[] = [
      { type: "user", text: "hi" },
      { type: "started", model: "claude-sonnet-5-5" },
      { type: "text", block: "m1:0", delta: "Hel" },
      { type: "tool", id: "t1", name: "Bash", input: { command: "ls" } },
      { type: "tool-denied", id: "t1", name: "Bash", input: { command: "ls" } },
      { type: "tool-result", id: "t1", output: "denied", isError: true },
      { type: "problem", problem: { type: "failed", message: "Boom." } },
      { type: "problem", problem: { type: "not-installed" } },
      { type: "turn-end", outcome: "stopped" },
    ];
    expect(normalizeChatSnapshot(JSON.parse(JSON.stringify({ events })))).toEqual({ events });
    expect(normalizeChatEvent({ type: "turn-end", outcome: "later" })).toBeNull();
    expect(normalizeChatEvent({ type: "tool", id: "", name: "Bash" })).toBeNull();
    expect(normalizeChatSnapshot({ events: "x" })).toEqual({ events: [] });
  });
});

describe("AC2, AC3: what the chat view shows", () => {
  it("joins deltas of one block into one reply, and starts a new reply for a new block", () => {
    const view = foldChat([
      { type: "user", text: "hi" },
      { type: "text", block: "m1:0", delta: "Hel" },
      { type: "text", block: "m1:0", delta: "lo" },
      { type: "text", block: "m2:0", delta: "Again" },
    ]);
    expect(view.items.map((i) => (i.kind === "assistant" ? i.text : i.kind))).toEqual(["user", "Hello", "Again"]);
    expect(view.running).toBe(true);
  });

  it("makes each tool call one row with a summary, that its result fills in", () => {
    const view = foldChat([
      { type: "tool", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool", id: "t2", name: "Bash", input: { command: "ls" } },
      { type: "tool-result", id: "t1", output: "x", isError: false },
    ]);
    expect(view.items).toEqual([
      expect.objectContaining({ kind: "tool", id: "t1", summary: "a.ts", result: { output: "x", isError: false } }),
      expect.objectContaining({ kind: "tool", id: "t2", summary: "ls", result: null, denied: false }),
    ]);
  });

  it("marks a denied call on its row, whether the denial comes before or after the call (AC5)", () => {
    const call: ChatEvent = { type: "tool", id: "t1", name: "Bash", input: { command: "rm -rf build" } };
    const denial: ChatEvent = { type: "tool-denied", id: "t1", name: "Bash", input: { command: "rm -rf build" } };
    for (const events of [
      [call, denial],
      [denial, call],
    ]) {
      expect(foldChat(events).items).toEqual([expect.objectContaining({ kind: "tool", denied: true })]);
    }
  });

  it("marks the calls a stopped turn left unanswered as stopped, and leaves answered and denied ones", () => {
    const view = foldChat([
      { type: "user", text: "x" },
      { type: "tool", id: "t1", name: "Read", input: { file_path: "a.ts" } },
      { type: "tool-result", id: "t1", output: "x", isError: false },
      { type: "tool-denied", id: "t2", name: "Bash", input: { command: "ls" } },
      { type: "tool", id: "t3", name: "Bash", input: { command: "npm test" } },
      { type: "turn-end", outcome: "stopped" },
    ]);
    expect(view.items.filter((i) => i.kind === "tool").map((i) => i.kind === "tool" && [i.id, i.stopped])).toEqual([
      ["t1", false],
      ["t2", false],
      ["t3", true],
    ]);
    const failed = foldChat([
      { type: "tool", id: "t1", name: "Bash", input: { command: "ls" } },
      { type: "turn-end", outcome: "failed" },
    ]);
    expect(failed.items[0]).toMatchObject({ stopped: false });
  });

  it("ends a turn: a stopped one leaves a notice, a problem shows as one", () => {
    expect(
      foldChat([
        { type: "user", text: "x" },
        { type: "turn-end", outcome: "done" },
      ]).running,
    ).toBe(false);
    const stopped = foldChat([
      { type: "user", text: "x" },
      { type: "turn-end", outcome: "stopped" },
    ]);
    expect(stopped.items.at(-1)).toMatchObject({ kind: "notice", notice: { type: "stopped" } });
    const missing = foldChat([
      { type: "user", text: "x" },
      { type: "problem", problem: { type: "not-installed" } },
    ]);
    expect(missing).toMatchObject({ running: false, items: [{ kind: "user" }, { kind: "notice" }] });
  });

  it("keeps the model the agent reported, and ignores a result for no row", () => {
    expect(foldChat([{ type: "started", model: "claude-opus-5-5" }]).model).toBe("claude-opus-5-5");
    expect(foldChat([{ type: "tool-result", id: "gone", output: "", isError: false }])).toEqual(EMPTY_CHAT);
  });
});

describe("AC3: a tool row's short summary", () => {
  it("is the field that says what the call is about", () => {
    expect(toolSummary("Bash", { command: "npm test", description: "Run tests" })).toBe("npm test");
    expect(toolSummary("Edit", { file_path: "src/a.ts", old_string: "a" })).toBe("src/a.ts");
    expect(toolSummary("Grep", { pattern: "TODO", path: "src" })).toBe("TODO");
    expect(toolSummary("WebFetch", { url: "https://example.com", prompt: "x" })).toBe("https://example.com");
    expect(toolSummary("Task", { description: "Find tests", prompt: "long" })).toBe("Find tests");
  });

  it("falls back to the first text input, then nothing", () => {
    expect(toolSummary("mcp__x__y", { count: 2, query: "hello" })).toBe("hello");
    expect(toolSummary("TodoRead", null)).toBe("");
  });

  it("is one line, cut to fit", () => {
    expect(toolSummary("Bash", { command: "echo a\n  echo b" })).toBe("echo a echo b");
    const long = toolSummary("Bash", { command: "x".repeat(200) });
    expect(long).toHaveLength(SUMMARY_MAX);
    expect(long.endsWith("…")).toBe(true);
  });
});
