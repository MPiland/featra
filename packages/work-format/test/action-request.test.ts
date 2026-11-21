/** STORY-68: the rules of an agent's request to the user: its input, the card's reading of it, and the call's answer. */
import { describe, expect, it } from "vitest";
import {
  ACTION_LIMITS,
  ACTION_MESSAGES,
  ACTION_RESULTS,
  actionAsk,
  parseActionOutcome,
  parseActionRequest,
} from "../src/index.ts";

const step = { text: "Sign in to the CLI.", command: "gh auth login" };

/** The parser's refusal of a hidden character in `where` (review S2). */
const hiddenIn = (where: string) => ({ ok: false, error: ACTION_MESSAGES.hidden(where) });

describe("parseActionRequest (AC1)", () => {
  it("takes a title, a why and steps, trimmed, and drops an empty why or command", () => {
    expect(
      parseActionRequest({
        title: "  Sign   in\n now ",
        why: "  It needs your account. ",
        steps: [
          { text: " Run it. ", command: "  gh auth login " },
          { text: "Come back.", command: "  " },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        title: "Sign in now",
        why: "It needs your account.",
        steps: [{ text: "Run it.", command: "gh auth login" }, { text: "Come back." }],
      },
    });
    expect(parseActionRequest({ title: "T", why: " ", steps: [{ text: "x", command: null }] })).toEqual({
      ok: true,
      value: { title: "T", steps: [{ text: "x" }] },
    });
  });

  it("keeps a command's own lines and quoting as given", () => {
    const command = "sudo tee /etc/hosts <<'EOF'\n127.0.0.1 featra.test\nEOF";
    const parsed = parseActionRequest({ title: "T", steps: [{ text: "x", command }] });
    expect(parsed.ok && parsed.value.steps[0]?.command).toBe(command);
  });

  describe("refuses control and invisible characters that could hide what it says (review S2)", () => {
    // C0 and C1 controls and DEL; the bidi embeddings, overrides and isolates; and zero-width spaces.
    const hidden = [
      "\u0000",
      "\u0007",
      "\u001b",
      "\r",
      "\u007f",
      "\u0085",
      "\u009b",
      "\u202a",
      "\u202b",
      "\u202c",
      "\u202d",
      "\u202e",
      "\u2066",
      "\u2067",
      "\u2068",
      "\u2069",
      "\u200b",
      "\u2060",
      "\ufeff",
    ];

    const named = hidden.map((ch) => [ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"), ch] as const);
    it.each(named)("refuses U+%s in the command, the text, the title and why", (_code, ch) => {
      expect(parseActionRequest({ title: "T", steps: [{ text: "x", command: `rm -rf ${ch}/tmp/x` }] })).toEqual(
        hiddenIn("Step 1's command"),
      );
      expect(parseActionRequest({ title: "T", steps: [step, { text: `Run ${ch}it.` }] })).toEqual(
        hiddenIn("Step 2's text"),
      );
      expect(parseActionRequest({ title: `Sign ${ch}in`, steps: [step] })).toEqual(hiddenIn("The title"));
      expect(parseActionRequest({ title: "T", why: `It ${ch}needs it.`, steps: [step] })).toEqual(hiddenIn("Why"));
    });

    it("refuses a joiner in a command, where nothing needs one, but keeps it in text, where emoji and scripts do", () => {
      expect(parseActionRequest({ title: "T", steps: [{ text: "x", command: "gh\u200d auth login" }] })).toEqual(
        hiddenIn("Step 1's command"),
      );
      expect(parseActionRequest({ title: "T", steps: [{ text: "x", command: "gh\u200c auth login" }] })).toEqual(
        hiddenIn("Step 1's command"),
      );
      const text = {
        title: "Sign in \u{1F469}\u200d\u{1F4BB}",
        why: "\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645",
        steps: [{ text: "Run it \u{1F469}\u200d\u{1F4BB}." }],
      };
      expect(parseActionRequest(text).ok).toBe(true);
    });

    it("keeps new lines and tabs, and ordinary non-ASCII text", () => {
      const lines = {
        title: "T",
        why: "Line one.\n\tLine two.",
        steps: [{ text: "Run it\n\tnow.", command: "a &&\n\tb" }],
      };
      expect(parseActionRequest(lines).ok).toBe(true);
      const french = {
        title: "Connexion à l'interface",
        steps: [{ text: "Exécutez-la.", command: "echo «ok» – done" }],
      };
      expect(parseActionRequest(french).ok).toBe(true);
    });
  });

  it("refuses a missing or long title", () => {
    expect(parseActionRequest({ steps: [step] })).toEqual({ ok: false, error: ACTION_MESSAGES.badTitle });
    expect(parseActionRequest({ title: "   ", steps: [step] })).toEqual({ ok: false, error: ACTION_MESSAGES.badTitle });
    expect(parseActionRequest({ title: "x".repeat(ACTION_LIMITS.title + 1), steps: [step] })).toEqual({
      ok: false,
      error: ACTION_MESSAGES.longTitle,
    });
    expect(parseActionRequest({ title: "x".repeat(ACTION_LIMITS.title), steps: [step] }).ok).toBe(true);
  });

  it("refuses a why that isn't text, or is long", () => {
    expect(parseActionRequest({ title: "T", why: 3, steps: [step] })).toEqual({
      ok: false,
      error: ACTION_MESSAGES.badWhy,
    });
    expect(parseActionRequest({ title: "T", why: "x".repeat(ACTION_LIMITS.why + 1), steps: [step] })).toEqual({
      ok: false,
      error: ACTION_MESSAGES.longWhy,
    });
  });

  it("refuses no steps, too many, or steps that aren't a list", () => {
    for (const steps of [undefined, [], "do it", Array.from({ length: ACTION_LIMITS.steps + 1 }, () => step)]) {
      expect(parseActionRequest({ title: "T", steps })).toEqual({ ok: false, error: ACTION_MESSAGES.badSteps });
    }
    expect(parseActionRequest({ title: "T", steps: Array.from({ length: ACTION_LIMITS.steps }, () => step) }).ok).toBe(
      true,
    );
  });

  it("names the step whose text or command is wrong", () => {
    expect(parseActionRequest({ title: "T", steps: [step, { command: "ls" }] })).toEqual({
      ok: false,
      error: ACTION_MESSAGES.badStep(2),
    });
    expect(parseActionRequest({ title: "T", steps: [{ text: "x".repeat(ACTION_LIMITS.step + 1) }] })).toEqual({
      ok: false,
      error: ACTION_MESSAGES.badStep(1),
    });
    expect(parseActionRequest({ title: "T", steps: ["just text"] })).toEqual({
      ok: false,
      error: ACTION_MESSAGES.badStep(1),
    });
    expect(parseActionRequest({ title: "T", steps: [step, step, { text: "x", command: ["ls"] }] })).toEqual({
      ok: false,
      error: ACTION_MESSAGES.badCommand(3),
    });
    expect(
      parseActionRequest({ title: "T", steps: [{ text: "x", command: "x".repeat(ACTION_LIMITS.command + 1) }] }),
    ).toEqual({ ok: false, error: ACTION_MESSAGES.badCommand(1) });
  });
});

describe("actionAsk (AC2)", () => {
  it("reads the card's request from an approval's input, and nothing from another input", () => {
    expect(actionAsk({ title: "T", steps: [step] })).toEqual({ title: "T", steps: [step] });
    expect(actionAsk({ command: "npm test" })).toBeNull();
    expect(actionAsk(null)).toBeNull();
  });
});

describe("the call's answer (AC3)", () => {
  it("tells the agent Done, or that the user couldn't, with their reason", () => {
    expect(ACTION_RESULTS.done).toBe("The user says it's done.");
    expect(ACTION_RESULTS.cant("No admin rights.")).toBe("The user couldn't do it: No admin rights.");
    expect(ACTION_RESULTS.cant()).toBe("The user couldn't do it.");
  });

  it("reads the answer as it crosses the socket, and refuses anything else", () => {
    expect(parseActionOutcome({ outcome: "done" })).toEqual({ outcome: "done" });
    expect(parseActionOutcome({ outcome: "cant", reason: "No." })).toEqual({ outcome: "cant", reason: "No." });
    expect(parseActionOutcome({ outcome: "cant", reason: "" })).toEqual({ outcome: "cant" });
    expect(parseActionOutcome({ outcome: "cant", reason: 1 })).toBeNull();
    expect(parseActionOutcome({ outcome: "skipped" })).toBeNull();
    expect(parseActionOutcome("done")).toBeNull();
  });
});
