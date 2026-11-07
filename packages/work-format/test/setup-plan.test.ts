/** STORY-42: the one-screen setup's items and the shapes both ends check. */
import { describe, expect, it } from "vitest";
import {
  entryLabel,
  isAgentInstructionFile,
  normalizeSetupPlan,
  SERVER_METHODS,
  SETUP_ITEMS,
  setupParams,
} from "../src/index.ts";

describe("AC2: the items the setup page offers", () => {
  it("are the Featra folder (required), each knowledge file, and a starter .gitignore offered only while missing", () => {
    expect(
      SETUP_ITEMS.map((i) => ({ id: i.id, path: entryLabel(i.entry), req: i.required, missing: i.onlyWhenMissing })),
    ).toEqual([
      { id: "featra", path: ".featra/config.yaml", req: true, missing: false },
      { id: "context", path: "CONTEXT.md", req: false, missing: false },
      { id: "decisions", path: "decisions.md", req: false, missing: false },
      { id: "openQuestions", path: "open-questions.md", req: false, missing: false },
      { id: "adr", path: "docs/adr/", req: false, missing: false },
      { id: "gitignore", path: ".gitignore", req: false, missing: true },
    ]);
  });

  it("the starter .gitignore is short and generic: OS junk, node_modules, .env files, build output", () => {
    const entry = SETUP_ITEMS.find((i) => i.id === "gitignore")?.entry;
    const lines = (entry?.kind === "file" ? entry.content : "").split("\n").filter((l) => l && !l.startsWith("#"));
    expect(lines).toEqual(
      expect.arrayContaining([".DS_Store", "Thumbs.db", "node_modules/", ".env", ".env.*", "dist/", "build/"]),
    );
    expect(lines.length).toBeLessThanOrEqual(15);
  });

  it("AC5: no item is an agent instruction file", () => {
    const paths = SETUP_ITEMS.flatMap(({ entry: e }) =>
      e.kind === "file" ? [e.path] : [e.path].concat(e.seed.map((s) => `${e.path}/${s.name}`)),
    );
    expect(paths.filter(isAgentInstructionFile)).toEqual([]);
  });
});

describe("the protocol", () => {
  it("has the plan and the one-pass setup", () => {
    expect(SERVER_METHODS).toEqual(expect.arrayContaining(["project.setupPlan", "project.setup"]));
  });

  it("checks setup params: a dir and known items only", () => {
    expect(setupParams({ dir: "/p", items: ["context", "context", "adr"] })).toEqual({
      dir: "/p",
      items: ["context", "adr"],
    });
    expect(setupParams({ dir: "/p", items: ["CLAUDE.md"] })).toBeNull();
    expect(setupParams({ dir: "/p" })).toBeNull();
    expect(setupParams({ dir: "", items: [] })).toBeNull();
  });

  it("normalizes a plan, dropping unknown items, and turns anything else into an error", () => {
    expect(
      normalizeSetupPlan({
        ok: true,
        git: false,
        items: [{ id: "context", exists: true }, { id: "nope", exists: true }, { id: "adr" }],
      }),
    ).toEqual({ ok: true, git: false, items: [{ id: "context", exists: true }] });
    expect(normalizeSetupPlan({ ok: false, error: "Folder not found: /p" })).toEqual({
      ok: false,
      error: "Folder not found: /p",
    });
    expect(normalizeSetupPlan(null)).toEqual({ ok: false, error: "Something went wrong." });
  });
});
