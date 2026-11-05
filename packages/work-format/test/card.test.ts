import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CardParseError,
  DEFAULT_CONFIG,
  idFromFileName,
  newCard,
  parseCard,
  parseConfig,
  serializeCard,
  validateCards,
} from "../src/index.ts";

const REPO = join(import.meta.dirname, "..", "..", "..");
const CARDS_DIR = join(REPO, ".featra", "cards");

const PBI = `---
id: PBI-7
type: pbi
title: "Side panel: view and edit"
status: In Progress
parent: FEAT-2
order: 3
origin: added
role: developer
agent: claude
model: claude-sonnet-5-5
reasoning: high
sessions:
  - s-1
branch: feat-2/pbi-7
pr: https://github.com/o/r/pull/4
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-05T10:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:s-1
estimate: 3
---

## Description

Opens a side panel.

## Acceptance criteria

- [x] Panel opens on click (test: packages/client/test/panel.test.ts > opens)
- [ ] Saving writes to owner

## Tasks

- [x] Layout
- [ ] Save

## Notes

Handoff: layout done.

## Links

See ADR 0002.
`;

describe("parseCard", () => {
  it("reads frontmatter, ACs with test refs, tasks, notes and unknown sections", () => {
    const c = parseCard(PBI);
    expect(c).toMatchObject({
      id: "PBI-7",
      type: "pbi",
      title: "Side panel: view and edit",
      status: "In Progress",
      parent: "FEAT-2",
      order: 3,
      origin: "added",
      model: "claude-sonnet-5-5",
      sessions: ["s-1"],
      created: "2026-11-04T23:00:00Z",
      description: "Opens a side panel.",
      notes: "Handoff: layout done.",
    });
    expect(c.acs).toEqual([
      { text: "Panel opens on click", done: true, test: "packages/client/test/panel.test.ts > opens" },
      { text: "Saving writes to owner", done: false, test: null },
    ]);
    expect(c.tasks).toEqual([
      { text: "Layout", done: true },
      { text: "Save", done: false },
    ]);
    expect(c.history).toHaveLength(2);
    expect(c.history[1]).toEqual({ at: "2026-11-05T10:00:00Z", field: "status", from: "New", to: "In Progress", by: "session:s-1" });
    expect(c.extra).toEqual({ estimate: 3 });
    expect(c.extraSections).toEqual([{ heading: "Links", content: "See ADR 0002." }]);
  });

  it("accepts CRLF line endings", () => {
    expect(parseCard(PBI.replace(/\n/g, "\r\n")).acs).toHaveLength(2);
  });

  it.each([
    ["no frontmatter", "# hello"],
    ["unknown type", PBI.replace("type: pbi", "type: story")],
    ["missing id", PBI.replace("id: PBI-7\n", "")],
    ["unknown origin", PBI.replace("origin: added", "origin: magic")],
    ["history not a list", PBI.replace(/history:[\s\S]*?estimate/, "history: nope\nestimate")],
  ])("rejects %s", (_, text) => {
    expect(() => parseCard(text, "x.md")).toThrow(CardParseError);
  });
});

describe("serializeCard", () => {
  it("round-trips without losing anything", () => {
    const c = parseCard(PBI);
    expect(parseCard(serializeCard(c))).toEqual(c);
  });

  it("is stable: serializing a parsed serialization gives the same text", () => {
    const once = serializeCard(parseCard(PBI));
    expect(serializeCard(parseCard(once))).toBe(once);
  });

  it("omits PBI-only fields and sections for epics and features", () => {
    const text = serializeCard(newCard({ id: "FEAT-1", type: "feature", title: "Login", status: "draft", parent: "EPIC-1" }, "user", "2026-11-04T23:00:00Z"));
    expect(text).not.toMatch(/^role:/m);
    expect(text).not.toMatch(/^## Acceptance criteria/m);
    expect(text).toMatch(/^## Description/m);
  });

  it("writes PBI sections even when empty", () => {
    const text = serializeCard(newCard({ id: "PBI-1", type: "pbi", title: "X", status: "New", parent: "FEAT-1" }, "user", "2026-11-04T23:00:00Z"));
    expect(text).toMatch(/^## Acceptance criteria\n\n## Tasks\n\n## Notes\n$/m);
  });
});

describe("newCard", () => {
  it("records creation as the first history event", () => {
    const c = newCard({ id: "PBI-9", type: "pbi", title: "X", status: "New", parent: "FEAT-1" }, "session:a", "2026-11-04T23:00:00Z");
    expect(c.history).toEqual([{ at: "2026-11-04T23:00:00Z", field: "status", from: null, to: "New", by: "session:a" }]);
  });
});

describe("Featra's own backlog (real data)", () => {
  const files = readdirSync(CARDS_DIR).filter((f) => f.endsWith(".md"));
  const config = parseConfig(readFileSync(join(REPO, ".featra", "config.yaml"), "utf8"));
  const cards = files.map((f) => parseCard(readFileSync(join(CARDS_DIR, f), "utf8"), f));

  it("every card parses, round-trips and is named after its id", () => {
    expect(files.length).toBeGreaterThan(0);
    files.forEach((f, i) => {
      const c = cards[i]!;
      expect(idFromFileName(f)).toBe(c.id);
      expect(parseCard(serializeCard(c))).toEqual(c);
    });
  });

  it("the set is structurally valid", () => {
    expect(validateCards(cards, config)).toEqual([]);
  });

  it("uses the default config", () => {
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
