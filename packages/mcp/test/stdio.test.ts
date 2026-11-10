import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOOLS } from "../src/index.ts";
import { CHAT, DIR, startHarness, WINDOW_TOKEN, type Harness } from "./stdio-harness.ts";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0]?.text ?? "";

describe("the Featra MCP over stdio", () => {
  it("offers log_decision, defer_question and draft_cards, with the descriptions that teach when to log", async () => {
    const { tools } = await (await h.connect()).listTools();
    expect(tools.map((t) => t.name)).toEqual(["log_decision", "defer_question", "draft_cards", "start_feature"]);
    const decision = (tools[0]?.description ?? "").toLowerCase();
    for (const cue of [
      "changes behavior or scope",
      "public contract",
      "stored data or security",
      "trade-offs",
      "trivia",
    ]) {
      expect(decision).toContain(cue);
    }
    expect(tools[1]?.description).toContain("open-questions.md");
    // What an agent reads is the tools' own text, not a copy.
    expect(tools.map((t) => t.description)).toEqual(TOOLS.map((t) => t.description));
  });

  it("log_decision appends a dated entry to decisions.md with why, rejected, session and card", async () => {
    const client = await h.connect();
    const result = await client.callTool({
      name: "log_decision",
      arguments: {
        decision: "Entries carry an id marker",
        why: "Undo must remove exactly one entry.",
        rejected: ["Match by text: edits break it"],
        card: "STORY-47",
      },
    });
    expect(text(result)).toBe("Logged to decisions.md.");
    const file = h.disk.files.get(join(DIR, "decisions.md")) ?? "";
    expect(file).toContain("- 2026-11-09 — Entries carry an id marker <!-- featra:e1 -->");
    expect(file).toContain("  - Why: Undo must remove exactly one entry.");
    expect(file).toContain("  - Rejected: Match by text: edits break it");
    expect(file).toContain("  - Session: Developer chat 1a2b3c4d");
    expect(file).toContain("  - Card: STORY-47");
    expect(h.events).toContainEqual({
      type: "logged",
      entry: "e1",
      file: "decisions.md",
      summary: "Entries carry an id marker",
    });
  });

  it("defer_question appends the question and its context to open-questions.md", async () => {
    const client = await h.connect();
    const result = await client.callTool({
      name: "defer_question",
      arguments: { question: "Should Undo survive a restart?", context: "Assumed no; the ledger is in memory." },
    });
    expect(text(result)).toBe("Logged to open-questions.md.");
    const file = h.disk.files.get(join(DIR, "open-questions.md")) ?? "";
    expect(file).toContain("Should Undo survive a restart?");
    expect(file).toContain("  - Context: Assumed no; the ledger is in memory.");
    expect(file).toContain("  - Session: Developer chat 1a2b3c4d");
  });

  it("refuses a bad input as a tool error, writing nothing", async () => {
    const before = h.disk.files.get(join(DIR, "decisions.md"));
    const client = await h.connect();
    const missing = await client.callTool({ name: "log_decision", arguments: { decision: "No reason given" } });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toMatch(/^Not logged\./);
    const badCard = await client.callTool({
      name: "log_decision",
      arguments: { decision: "x", why: "y", card: "not a card id" },
    });
    expect(badCard.isError).toBe(true);
    const unknown = await client.callTool({ name: "forget_everything", arguments: {} });
    expect(unknown.isError).toBe(true);
    expect(h.disk.files.get(join(DIR, "decisions.md"))).toBe(before);
  });

  it("logs into the chat its secret belongs to, and a window token does not open the agent socket", async () => {
    const env = await h.env();
    expect(env.FEATRA_AGENT_URL).toBe(`ws://127.0.0.1:${h.server.port}/v1/agent`);
    expect(h.bridge.resolve(env.FEATRA_AGENT_TOKEN ?? "")).toBe(CHAT);
    const refused = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`${env.FEATRA_AGENT_URL}?token=${WINDOW_TOKEN}`);
      ws.addEventListener("error", () => resolve(true), { once: true });
      ws.addEventListener("open", () => resolve(false), { once: true });
    });
    expect(refused).toBe(true);
  });

  it("refuses a log once Settings has turned the MCP off, saying why, and writes nothing", async () => {
    const client = await h.connect();
    const before = h.disk.files.get(join(DIR, "decisions.md"));
    h.settings.enabled = false;
    try {
      const off = await client.callTool({ name: "log_decision", arguments: { decision: "Late", why: "Too late." } });
      expect(off.isError).toBe(true);
      expect(text(off)).toContain("Featra MCP is off for this project.");
      expect(h.disk.files.get(join(DIR, "decisions.md"))).toBe(before);
    } finally {
      h.settings.enabled = true;
    }
    const on = await client.callTool({ name: "log_decision", arguments: { decision: "Back on", why: "Settings." } });
    expect(on.isError).toBeFalsy();
  });

  it("exits when it has no address to reach Featra at", async () => {
    await expect(h.connect({ FEATRA_AGENT_URL: "", FEATRA_AGENT_TOKEN: "" })).rejects.toThrow("Connection closed");
  });
});
