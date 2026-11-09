/**
 * STORY-6 Settings > Project > Roles, through the real App (AC1 to AC4, AC7). The host's server is faked at the socket
 * (roles-server.ts): it serves the lists and records the edits. Which file an edit writes is proved against the real
 * server in packages/server, and the whole path in the Electron journey.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ModeInfo } from "@featra/work-format/modes";
import { BUILT_IN_ROLES, type Role } from "@featra/work-format/roles";
import { PROJECT, renderApp } from "../../harness.tsx";
import { main, openSettings } from "./helpers.tsx";

afterEach(cleanup);

const AUTO: ModeInfo = { provider: "claude", name: "auto", level: "user", fullAccess: false };
const FULL: ModeInfo = { provider: "claude", name: "bypassPermissions", level: "project", fullAccess: true };

const builtIn = (id: string, patch: Partial<Role> = {}): Role => ({
  ...BUILT_IN_ROLES.find((r) => r.id === id)!,
  ...patch,
});
const custom = (id: string, name: string): Role => ({
  id,
  name,
  provider: "claude",
  prompt: "Mine.",
  model: "sonnet",
  effort: "medium",
  permission: "ask",
  source: { kind: "custom" },
});
const agent = (
  id: string,
  name: string,
  provider: "claude" | "codex",
  scope: "project" | "user" = "project",
): Role => ({
  ...custom(id, name),
  prompt: "You review.",
  description: "Reviews code",
  source: { kind: "provider", provider, scope },
});

const LIST = {
  roles: [
    ...BUILT_IN_ROLES.map((r) => ({ ...r, mode: AUTO })),
    custom("mine", "Mine"),
    agent("claude:project:reviewer", "reviewer", "claude"),
    agent("codex:user:scout", "scout", "codex", "user"),
  ],
  problems: [".claude/agents/bad.md: no frontmatter"],
};

async function openRoles(roleLists: Record<string, typeof LIST> = { [PROJECT.dir]: LIST }, opts = {}) {
  const app = renderApp({ roleLists, ...opts });
  await openSettings(app.user, "Roles", "Project");
  await screen.findByRole("list", { name: "Built-in" });
  return app;
}

const rowOf = (name: string) => within(main()).getByRole("button", { name: new RegExp(`^${name}`) });
const editor = (name: string) => screen.getByRole("region", { name });

describe("AC1: Roles lists built-in, custom and provider roles", () => {
  it("is a Project page, after Workflow", async () => {
    const { user } = renderApp();
    await user.click(within(document.getElementById("sidebar")!).getByRole("button", { name: "Settings" }));
    const project = within(
      within(screen.getByRole("navigation", { name: "Settings pages" })).getByRole("list", { name: "Project" }),
    );
    expect(project.getAllByRole("button").map((b) => b.textContent)).toEqual(["Workflow", "Roles"]);
  });

  it("groups the roles by where they came from, each with its tag, model, effort and mode", async () => {
    await openRoles();
    const groups = ["Built-in", "Custom", "Claude agents", "Codex agents"].map((name) =>
      within(screen.getByRole("list", { name }))
        .getAllByRole("button")
        .map((b) => b.textContent),
    );
    expect(groups[0]).toEqual(
      BUILT_IN_ROLES.map((r) => `${r.name}Built-in${r.model} · ${r.effort} · auto · from Claude settings`),
    );
    expect(groups[1]).toEqual(["MineCustomsonnet · medium · Ask"]);
    expect(groups[2]).toEqual(["reviewerClaude · projectsonnet · medium · Ask"]);
    expect(groups[3]).toEqual(["scoutCodex · usersonnet · medium · Ask"]);
  });

  it("shows the chosen role's prompt, model, effort and the mode with where it is set", async () => {
    const { user } = await openRoles();
    await user.click(rowOf("QA"));
    const qa = editor("QA");
    const role = BUILT_IN_ROLES.find((r) => r.id === "qa")!;
    expect(within(qa).getByRole("button", { name: `Prompt: ${role.prompt}` })).toBeTruthy();
    expect(within(qa).getByRole("button", { name: `Model: ${role.model}` })).toBeTruthy();
    expect(within(qa).getByRole("button", { name: /^Effort: / })).toBeTruthy();
    const mode = within(qa).getByText("auto · from Claude settings");
    expect(mode.closest("p")?.getAttribute("title")).toBe("Set in Claude's user settings");
  });

  it("marks a full-access mode and lists the files it couldn't read", async () => {
    const roles = LIST.roles.map((r) => (r.id === "qa" ? { ...r, mode: FULL } : r));
    const { user } = await openRoles({ [PROJECT.dir]: { ...LIST, roles } });
    await user.click(rowOf("QA"));
    expect(within(editor("QA")).getByText("bypassPermissions · from Claude settings").className).toBe("role-full");
    const problems = screen.getByText("Can't read some role files").closest("[role=alert]") as HTMLElement;
    expect(within(problems).getByText(".claude/agents/bad.md: no frontmatter")).toBeTruthy();
  });

  it("follows the files: a pushed list replaces the rows", async () => {
    const { roles } = await openRoles();
    roles.push(PROJECT.dir, { roles: [builtIn("qa"), custom("fresh", "Fresh")], problems: [] });
    expect(within(screen.getByRole("list", { name: "Custom" })).getAllByRole("button")).toHaveLength(1);
    expect(rowOf("Fresh")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Claude agents" })).toBeNull();
    expect(screen.queryByText("Can't read some role files")).toBeNull();
  });

  it("says why it has no roles, and with no project says so", async () => {
    const { user } = renderApp({ roleErrors: { [PROJECT.dir]: "Not an open project." } });
    await openSettings(user, "Roles", "Project");
    expect((await screen.findByText("Not an open project.")).getAttribute("role")).toBe("alert");
    cleanup();
    const none = renderApp({ project: null });
    await openSettings(none.user, "Roles", "Project");
    expect(screen.getByText("No project is open.")).toBeTruthy();
  });
});

describe("AC2: a built-in is edited in the project, and Reset brings it back", () => {
  it("saves the prompt with the role's model and effort", async () => {
    const { user, roles } = await openRoles();
    await user.click(rowOf("QA"));
    const qa = editor("QA");
    const role = BUILT_IN_ROLES.find((r) => r.id === "qa")!;
    await user.click(within(qa).getByRole("button", { name: /^Prompt: / }));
    const box = within(qa).getByRole("textbox", { name: "Prompt" });
    await user.clear(box);
    await user.type(box, "Be picky.");
    await user.tab();
    await expect
      .poll(() => roles.edits)
      .toEqual([
        {
          dir: PROJECT.dir,
          edit: { action: "save", id: "qa", prompt: "Be picky.", model: role.model, effort: role.effort },
        },
      ]);
  });

  it("saves a chosen model and a chosen effort", async () => {
    const { user, roles } = await openRoles();
    await user.click(rowOf("QA"));
    const qa = editor("QA");
    await user.click(within(qa).getByRole("button", { name: /^Model: / }));
    await user.click(screen.getByRole("option", { name: "haiku" }));
    await user.click(within(qa).getByRole("button", { name: /^Effort: / }));
    await user.click(screen.getByRole("option", { name: "Max" }));
    const [first, second] = roles.edits.map((e) => e.edit);
    expect(first).toMatchObject({ action: "save", id: "qa", model: "haiku" });
    expect(second).toMatchObject({ action: "save", id: "qa", effort: "max" });
  });

  it("offers Reset only for an edited built-in, and Reset asks the server to delete the override", async () => {
    const edited = {
      ...LIST,
      roles: LIST.roles.map((r) => (r.id === "qa" ? builtIn("qa", { source: { kind: "built-in", edited: true } }) : r)),
    };
    const { user, roles } = await openRoles({ [PROJECT.dir]: edited });
    await user.click(rowOf("Developer"));
    expect(within(editor("Developer")).queryByRole("button", { name: "Reset" })).toBeNull();
    await user.click(rowOf("QA"));
    expect(within(editor("QA")).getByText("Built-in · edited")).toBeTruthy();
    await user.click(within(editor("QA")).getByRole("button", { name: "Reset" }));
    expect(roles.edits).toEqual([{ dir: PROJECT.dir, edit: { action: "reset", id: "qa" } }]);
  });

  it("shows a refusal in the editor and keeps what was typed", async () => {
    const { user } = await openRoles(
      { [PROJECT.dir]: LIST },
      { editResult: () => ({ ok: false, error: "Disk is full." }) },
    );
    await user.click(rowOf("QA"));
    await user.click(within(editor("QA")).getByRole("button", { name: /^Prompt: / }));
    await user.type(within(editor("QA")).getByRole("textbox", { name: "Prompt" }), " more");
    await user.tab();
    expect((await within(editor("QA")).findByRole("alert")).textContent).toMatch(/^Disk is full\.Now: You are QA/);
    expect(within(editor("QA")).getByRole("textbox", { name: "Prompt" })).toHaveProperty(
      "value",
      expect.stringContaining("more"),
    );
  });
});

describe("AC3: custom roles are created, duplicated, renamed and deleted", () => {
  it("creates a role by name, and shows the one it made once the list arrives", async () => {
    const { user, roles } = await openRoles(
      { [PROJECT.dir]: LIST },
      { editResult: () => ({ ok: true, id: "tester" }) },
    );
    await user.click(screen.getByRole("button", { name: "New role" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Tester");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(roles.edits).toEqual([{ dir: PROJECT.dir, edit: { action: "create", name: "Tester" } }]);
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    roles.push(PROJECT.dir, { ...LIST, roles: [...LIST.roles, custom("tester", "Tester")] });
    expect(editor("Tester")).toBeTruthy();
  });

  it("keeps the name field open with the refusal, and Escape or Cancel closes it", async () => {
    const { user } = await openRoles(
      { [PROJECT.dir]: LIST },
      { editResult: () => ({ ok: false, error: "A role is already called that." }) },
    );
    await user.click(screen.getByRole("button", { name: "New role" }));
    expect(screen.getByRole("button", { name: "Create" })).toHaveProperty("disabled", true);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "QA");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect((await screen.findByText("A role is already called that.")).getAttribute("role")).toBe("alert");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "New role" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("duplicates a built-in or a custom role, but a provider's role offers Customize instead", async () => {
    const { user, roles } = await openRoles();
    await user.click(rowOf("Developer"));
    await user.click(within(editor("Developer")).getByRole("button", { name: "Duplicate" }));
    await user.click(rowOf("Mine"));
    await user.click(within(editor("Mine")).getByRole("button", { name: "Duplicate" }));
    expect(roles.edits.map((e) => e.edit)).toEqual([
      { action: "duplicate", id: "developer" },
      { action: "duplicate", id: "mine" },
    ]);
    await user.click(rowOf("reviewer"));
    expect(within(editor("reviewer")).queryByRole("button", { name: "Duplicate" })).toBeNull();
  });

  it("renames a custom role in place and shows a refused name with the name now", async () => {
    const { user, roles } = await openRoles(
      { [PROJECT.dir]: LIST },
      {
        editResult: (e: { action: string }) =>
          e.action === "rename" ? { ok: false, error: "A role is already called that." } : { ok: true, id: "mine" },
      },
    );
    await user.click(rowOf("Mine"));
    await user.click(within(editor("Mine")).getByRole("button", { name: "Name: Mine" }));
    const field = within(editor("Mine")).getByRole("textbox", { name: "Name" });
    await user.clear(field);
    await user.type(field, "QA");
    await user.keyboard("{Enter}");
    expect(roles.edits.at(-1)?.edit).toEqual({ action: "rename", id: "mine", name: "QA" });
    expect((await within(editor("Mine")).findByRole("alert")).textContent).toBe(
      "A role is already called that.Now: Mine",
    );
  });

  it("does not offer Rename or Delete on a built-in", async () => {
    const { user } = await openRoles();
    await user.click(rowOf("QA"));
    const qa = editor("QA");
    expect(within(qa).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(qa).queryByRole("button", { name: /^Name: / })).toBeNull();
    expect(within(qa).getByRole("heading", { name: "QA" })).toBeTruthy();
  });

  it("deletes a custom role only after it is confirmed", async () => {
    const { user, roles } = await openRoles();
    await user.click(rowOf("Mine"));
    const mine = editor("Mine");
    await user.click(within(mine).getByRole("button", { name: "Delete" }));
    await user.click(
      within(within(mine).getByRole("group", { name: "Confirm delete" })).getByRole("button", { name: "Cancel" }),
    );
    expect(roles.edits).toEqual([]);
    await user.click(within(mine).getByRole("button", { name: "Delete" }));
    await user.click(
      within(within(mine).getByRole("group", { name: "Confirm delete" })).getByRole("button", { name: "Delete" }),
    );
    expect(roles.edits).toEqual([{ dir: PROJECT.dir, edit: { action: "delete", id: "mine" } }]);
    expect(screen.queryByRole("region", { name: "Mine" })).toBeNull();
  });
});

describe("AC4: provider roles show their source, are read-only, and Customize copies them", () => {
  it("shows a Claude and a Codex agent tagged with the source, and no way to edit them", async () => {
    const { user } = await openRoles();
    await user.click(rowOf("scout"));
    const scout = editor("scout");
    expect(within(scout).getByText("Codex · user")).toBeTruthy();
    expect(within(scout).getByText("Reviews code")).toBeTruthy();
    expect(within(scout).queryByRole("button", { name: /^Prompt/ })).toBeNull();
    expect(within(scout).getByText("You review.")).toBeTruthy();
    expect(within(scout).queryByRole("button", { name: /^Model: / })).toBeNull();
    expect(within(scout).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(scout).getByText("Customize copies it into the project, where it can be edited.")).toBeTruthy();
  });

  it("Customize asks for a copy, then shows the new custom role", async () => {
    const { user, roles } = await openRoles(
      { [PROJECT.dir]: LIST },
      { editResult: () => ({ ok: true, id: "reviewer-2" }) },
    );
    await user.click(rowOf("reviewer"));
    await user.click(within(editor("reviewer")).getByRole("button", { name: "Customize" }));
    expect(roles.edits).toEqual([{ dir: PROJECT.dir, edit: { action: "customize", id: "claude:project:reviewer" } }]);
    roles.push(PROJECT.dir, { ...LIST, roles: [...LIST.roles, custom("reviewer-2", "reviewer 2")] });
    expect(within(editor("reviewer 2")).getByText("Custom")).toBeTruthy();
  });

  it("shows a note about how the role was adjusted", async () => {
    const note = "Claude doesn't have the model \"gpt-5\": using Claude's default.";
    const roles = LIST.roles.map((r) => (r.id === "codex:user:scout" ? { ...r, note } : r));
    const { user } = await openRoles({ [PROJECT.dir]: { ...LIST, roles } });
    await user.click(rowOf("scout"));
    expect(within(editor("scout")).getByText(note)).toBeTruthy();
  });
});
