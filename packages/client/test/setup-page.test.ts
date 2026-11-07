/** STORY-42: the setup page's rows, worked out from the server's plan. */
import { SETUP_ITEM_IDS, type SetupItemId } from "@featra/work-format/setup-plan";
import { describe, expect, it } from "vitest";
import { initialChoice, itemsToSet, setupRows } from "../src/setup-page.ts";

const plan = (git: boolean, existing: SetupItemId[] = []) =>
  ({ ok: true, git, items: SETUP_ITEM_IDS.map((id) => ({ id, exists: existing.includes(id) })) }) as const;
const states = (rows: { id: string; state: string }[]) => rows.map((r) => `${r.id}:${r.state}`);

describe("setupRows", () => {
  it("a plain folder: git and featra required, every knowledge file and the .gitignore a choice", () => {
    const rows = setupRows(plan(false));
    expect(states(rows.repository)).toEqual(["git:required", "featra:required"]);
    expect(states(rows.knowledge)).toEqual([
      "context:choice",
      "decisions:choice",
      "openQuestions:choice",
      "adr:choice",
      "gitignore:choice",
    ]);
    expect(rows.repository[0]!.help).not.toBe("Already a git repository");
  });

  it("a repository says so; existing files are kept; an existing .gitignore isn't listed", () => {
    const rows = setupRows(plan(true, ["context", "adr", "gitignore"]));
    expect(rows.repository[0]!.help).toBe("Already a git repository");
    expect(states(rows.knowledge)).toEqual(["context:kept", "decisions:choice", "openQuestions:choice", "adr:kept"]);
  });

  it("an existing Featra folder is kept, not required", () => {
    expect(states(setupRows(plan(true, ["featra"])).repository)).toEqual(["git:required", "featra:kept"]);
  });
});

describe("initialChoice", () => {
  it("ticks every choice, nothing required or kept", () => {
    expect([...initialChoice(plan(true, ["decisions"]))]).toEqual(["context", "openQuestions", "adr", "gitignore"]);
  });
});

describe("itemsToSet", () => {
  it("asks for what is ticked and what is kept, in the page's order; never the required items", () => {
    const p = plan(true, ["featra", "adr"]);
    expect(itemsToSet(p, new Set(["gitignore", "context"]))).toEqual(["context", "adr", "gitignore"]);
  });

  it("a choice that is unticked isn't asked for", () => {
    expect(itemsToSet(plan(false), new Set())).toEqual([]);
  });
});
