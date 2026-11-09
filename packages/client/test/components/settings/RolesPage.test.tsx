/**
 * STORY-6 Settings > Project > Roles, through the real App (AC1, AC2, AC7). The host's server is faked at the socket
 * (roles-server.ts): it serves the lists and records the edits. Which file an edit writes is proved against the real
 * server in packages/server, and the whole path in the Electron journey.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES } from "@featra/work-format/roles";
import { PROJECT, renderApp } from "../../harness.tsx";
import { openSettings } from "./helpers.tsx";
import { FULL, LIST, builtIn, custom, editor, openRoles, rowOf } from "./roles-fixtures.tsx";

afterEach(cleanup);

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
  it("saves only the prompt the user changed, so the model and effort keep Featra's updates", async () => {
    const { user, roles } = await openRoles();
    await user.click(rowOf("QA"));
    const qa = editor("QA");
    await user.click(within(qa).getByRole("button", { name: /^Prompt: / }));
    const box = within(qa).getByRole("textbox", { name: "Prompt" });
    await user.clear(box);
    await user.type(box, "Be picky.");
    await user.tab();
    await expect
      .poll(() => roles.edits)
      .toEqual([{ dir: PROJECT.dir, edit: { action: "save", id: "qa", prompt: "Be picky." } }]);
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
