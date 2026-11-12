/** STORY-56 (the user's side): Project settings' Checks section chooses where checks run and confirms the commands. */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHECKS_COPY, type ChecksView } from "@featra/work-format";
import { PROJECT, renderApp } from "../../harness.tsx";
import { main, openSettings, WORK } from "./helpers.tsx";

afterEach(cleanup);

const VIEW: ChecksView = {
  where: "local",
  chosen: false,
  reason: CHECKS_COPY.notPublic,
  command: null,
  testCommand: null,
  proposals: [
    { field: "command", value: "pnpm test", source: "package.json" },
    { field: "testCommand", value: "npx vitest run {file} -t {namePattern}", source: "dev-lead" },
  ],
  error: null,
};

async function open(view: ChecksView = VIEW) {
  const app = renderApp({ checks: { [PROJECT.dir]: view } });
  await openSettings(app.user, WORK);
  const section = await within(main()).findByRole("region", { name: "Checks" });
  return { ...app, section };
}
const input = (section: HTMLElement, name: string) => within(section).getByRole<HTMLInputElement>("textbox", { name });

describe("AC1: where checks run", () => {
  it("shows the default and why, and saves the user's choice", async () => {
    const { section, user, calls } = await open();
    expect(within(section).getByText(CHECKS_COPY.notPublic)).toBeTruthy();
    expect(within(section).getByRole<HTMLInputElement>("radio", { name: "This computer" }).checked).toBe(true);
    await user.click(within(section).getByRole("radio", { name: "CI" }));
    await waitFor(() => expect(calls).toContain(`checks.set:${PROJECT.dir}:{"where":"ci"}`));
    expect(within(section).getByRole<HTMLInputElement>("radio", { name: "CI" }).checked).toBe(true);
    expect(within(section).queryByText(CHECKS_COPY.notPublic)).toBeNull();
  });
});

describe("AC2: the user confirms or edits the proposed command", () => {
  it("shows each proposal and its source, fills the field on Use this, and applies nothing until Save", async () => {
    const { section, user, calls } = await open();
    expect(within(section).getByText("Found in package.json:")).toBeTruthy();
    expect(within(section).getByText("Proposed by the Dev Lead:")).toBeTruthy();
    const save = within(section).getByRole<HTMLButtonElement>("button", { name: "Save" });
    expect(save.disabled).toBe(true);
    await user.click(within(section).getAllByRole("button", { name: "Use this" })[0] as HTMLElement);
    expect(input(section, "Check command").value).toBe("pnpm test");
    expect(calls.some((c) => c.startsWith("checks.set"))).toBe(false);
    await user.type(input(section, "Check command"), " --run");
    await user.click(save);
    await waitFor(() => expect(calls).toContain(`checks.set:${PROJECT.dir}:{"command":"pnpm test --run"}`));
    expect(await within(section).findByText("Saved")).toBeTruthy();
    expect(input(section, "Check command").value).toBe("pnpm test --run");
    expect(within(section).queryByText("Found in package.json:")).toBeNull();
    expect(within(section).getByText("Proposed by the Dev Lead:")).toBeTruthy();
  });

  it("saves the linked test command, and an emptied field clears it", async () => {
    const { section, user, calls } = await open({ ...VIEW, testCommand: "npx vitest run {file}", proposals: [] });
    expect(input(section, "Linked test command").value).toBe("npx vitest run {file}");
    await user.clear(input(section, "Linked test command"));
    await user.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls).toContain(`checks.set:${PROJECT.dir}:{"testCommand":null}`));
  });

  it("shows why a save was refused and keeps the page usable", async () => {
    const { section } = await open({ ...VIEW, error: "checkCommand must be one line." });
    expect((await within(section).findByRole("alert")).textContent).toBe("checkCommand must be one line.");
    expect(screen.getByRole("heading", { name: "Checks" })).toBeTruthy();
  });
});
