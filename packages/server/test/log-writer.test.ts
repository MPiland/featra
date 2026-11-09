import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_MESSAGES, LOG_FILES, type DecisionInput, type LogInput, type QuestionInput } from "@featra/work-format";
import { createLogWriter, type LogFs } from "../src/log-writer.ts";

/** The disk is a map; the clock is fixed. Everything else is the real writer and the real entry format. */
function world(files: Record<string, string> = {}) {
  const disk = new Map(Object.entries(files));
  let writes = 0;
  const fs: LogFs = {
    read: async (file) => {
      await Promise.resolve();
      return disk.get(file) ?? null;
    },
    write: async (file, text) => {
      // A slow disk: a second append that didn't wait for this one would read the old text.
      await new Promise((r) => setTimeout(r, 5));
      disk.set(file, text);
      writes++;
    },
  };
  let n = 0;
  const writer = createLogWriter({
    fs,
    now: () => new Date("2026-11-09T09:30:00Z"),
    newId: () => `id${++n}`,
    platform: "linux",
  });
  return { disk, writer, writes: () => writes };
}

const DIR = "/work/featra";
const SESSION = "Developer chat 1a2b3c4d";
const decision = (text: string, extra: Partial<DecisionInput> = {}): DecisionInput => ({
  kind: "decision",
  decision: text,
  why: `Because ${text}.`,
  rejected: [],
  card: null,
  ...extra,
});
const question = (text: string): QuestionInput => ({
  kind: "question",
  question: text,
  context: "Assumed yes.",
  card: null,
});
const at = (name: string) => join(DIR, name);
const log = (w: ReturnType<typeof world>, chat: string, input: LogInput) => w.writer.append(DIR, chat, input, SESSION);

describe("appending an entry", () => {
  it("creates a missing decisions.md from the scaffold header, then adds the dated entry", async () => {
    const w = world();
    const logged = await log(w, "c1", decision("Use a socket", { card: "STORY-47", rejected: ["Files: slow"] }));
    expect(logged).toEqual({ entry: "id1", file: "decisions.md", summary: "Use a socket" });
    const text = w.disk.get(at("decisions.md")) ?? "";
    expect(text.startsWith("# ")).toBe(true);
    expect(text).toContain("- 2026-11-09 — Use a socket <!-- featra:id1 -->");
    expect(text).toContain("  - Why: Because Use a socket.");
    expect(text).toContain("  - Rejected: Files: slow");
    expect(text).toContain(`  - Session: ${SESSION}`);
    expect(text).toContain("  - Card: STORY-47");
  });

  it("puts a question and its context in open-questions.md, not decisions.md", async () => {
    const w = world();
    const logged = await log(w, "c1", question("Keep Undo after restart?"));
    expect(logged.file).toBe(LOG_FILES.question);
    expect(w.disk.has(at("decisions.md"))).toBe(false);
    expect(w.disk.get(at("open-questions.md"))).toContain("  - Context: Assumed yes.");
  });

  it("keeps what the file already says and adds after it", async () => {
    const w = world({ [at("decisions.md")]: "# Decisions\n\n- 2026-01-01 — Old one\n" });
    await log(w, "c1", decision("New one"));
    const text = w.disk.get(at("decisions.md")) ?? "";
    expect(text.startsWith("# Decisions\n\n- 2026-01-01 — Old one\n")).toBe(true);
    expect(text.indexOf("New one")).toBeGreaterThan(text.indexOf("Old one"));
  });

  it("lands every entry when several are logged at once", async () => {
    const w = world();
    await Promise.all(["A", "B", "C", "D"].map((t) => log(w, `c-${t}`, decision(`Decision ${t}`))));
    const text = w.disk.get(at("decisions.md")) ?? "";
    for (const t of ["A", "B", "C", "D"]) expect(text).toContain(`Decision ${t} <!-- featra:`);
    expect(w.writes()).toBe(4);
  });

  it("keeps going after a write fails", async () => {
    const broken = createLogWriter({
      platform: "linux",
      fs: {
        read: async () => null,
        write: async () => {
          throw new Error("disk full");
        },
      },
    });
    await expect(broken.append(DIR, "c1", decision("x"), SESSION)).rejects.toThrow("disk full");
    await expect(broken.append(DIR, "c1", decision("y"), SESSION)).rejects.toThrow("disk full");
  });
});

describe("Undo", () => {
  it("removes exactly that entry, leaving the ones logged after it", async () => {
    const w = world();
    const first = await log(w, "c1", decision("First"));
    await log(w, "c1", decision("Second"));
    await log(w, "c1", question("Third?"));
    await w.writer.undo("c1", first.entry);
    const text = w.disk.get(at("decisions.md")) ?? "";
    expect(text).not.toContain("First");
    expect(text).toContain("Second <!-- featra:id2 -->");
    expect(w.disk.get(at("open-questions.md"))).toContain("Third?");
  });

  it("removes an entry in the middle without touching its neighbours' details", async () => {
    const w = world();
    await log(w, "c1", decision("One"));
    const two = await log(w, "c1", decision("Two"));
    await log(w, "c1", decision("Three"));
    await w.writer.undo("c1", two.entry);
    const text = w.disk.get(at("decisions.md")) ?? "";
    expect(text).toContain("  - Why: Because One.");
    expect(text).toContain("  - Why: Because Three.");
    expect(text).not.toContain("Because Two.");
  });

  it("keeps what the user wrote in the file since", async () => {
    const w = world();
    const one = await log(w, "c1", decision("One"));
    w.disk.set(at("decisions.md"), `${w.disk.get(at("decisions.md"))}\nMy own note.\n`);
    await w.writer.undo("c1", one.entry);
    expect(w.disk.get(at("decisions.md"))).toContain("My own note.");
    expect(w.disk.get(at("decisions.md"))).not.toContain("One");
  });

  it("refuses an entry the user has edited, and changes nothing", async () => {
    const w = world();
    const one = await log(w, "c1", decision("One"));
    const edited = (w.disk.get(at("decisions.md")) ?? "").replace("Because One.", "Because I reworded it.");
    w.disk.set(at("decisions.md"), edited);
    await expect(w.writer.undo("c1", one.entry)).rejects.toThrow(CHAT_MESSAGES.editedEntry);
    expect(w.disk.get(at("decisions.md"))).toBe(edited);
  });

  it("succeeds quietly when the user already deleted the entry, or the file", async () => {
    const w = world();
    const one = await log(w, "c1", decision("One"));
    const two = await log(w, "c1", decision("Two"));
    w.disk.set(at("decisions.md"), "# Decisions\n");
    await expect(w.writer.undo("c1", one.entry)).resolves.toBeUndefined();
    w.disk.delete(at("decisions.md"));
    await expect(w.writer.undo("c1", two.entry)).resolves.toBeUndefined();
    expect(w.disk.has(at("decisions.md"))).toBe(false);
  });

  it("refuses an entry it doesn't know, or one another chat logged", async () => {
    const w = world();
    const one = await log(w, "c1", decision("One"));
    await expect(w.writer.undo("c1", "nope")).rejects.toThrow(CHAT_MESSAGES.noEntry);
    await expect(w.writer.undo("c2", one.entry)).rejects.toThrow(CHAT_MESSAGES.noEntry);
    expect(w.disk.get(at("decisions.md"))).toContain("One");
  });

  it("can't take back the same entry twice", async () => {
    const w = world();
    const one = await log(w, "c1", decision("One"));
    await w.writer.undo("c1", one.entry);
    await expect(w.writer.undo("c1", one.entry)).rejects.toThrow(CHAT_MESSAGES.noEntry);
  });

  it("keeps a CRLF file in CRLF", async () => {
    const w = world({ [at("decisions.md")]: "# Decisions\r\n\r\n- 2026-01-01 — Old\r\n" });
    const one = await log(w, "c1", decision("One"));
    expect(w.disk.get(at("decisions.md"))).not.toMatch(/[^\r]\n/);
    await w.writer.undo("c1", one.entry);
    expect(w.disk.get(at("decisions.md"))).toBe("# Decisions\r\n\r\n- 2026-01-01 — Old\r\n");
  });
});
