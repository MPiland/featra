/**
 * STORY-6 Settings > Project > Roles: custom and provider roles (AC3, AC4), through the real App and the socket-level fake
 * host. The first half of the page is in RolesPage.test.tsx; the shared set-up is in roles-fixtures.tsx.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT } from "../../harness.tsx";
import { LIST, custom, editor, openRoles, rowOf } from "./roles-fixtures.tsx";

afterEach(cleanup);

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
