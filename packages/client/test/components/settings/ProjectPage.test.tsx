/** STORY-20 Settings: project overrides, labelled and reset (AC3). */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@featra/work-format";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORK_SETTINGS, WORK_SETTINGS } from "../../../src/bridge.ts";
import { PROJECT, renderApp, sidebar } from "../../harness.tsx";
import { main, radios, checked, row, WORK, navButton, description, switchFor, isOn, projectLoaded, openSettings } from "./helpers.tsx";

afterEach(cleanup);

describe("AC3: a project value that overrides an app default is labelled and can be reset", () => {
  it("marks an override \"Overridden · Reset\" by its label, the app default in tooltip and description; shows nothing where the project follows the default", async () => {
    const { user } = renderApp({ projectFiles: { [PROJECT.dir]: { progress: "tasks" } } });
    await openSettings(user, WORK);
    const progress = screen.getByRole("radiogroup", { name: "Feature progress" });
    expect(checked("Feature progress")).toBe("Tasks");
    const mark = within(row(progress)).getByText("Overridden");
    expect(mark.getAttribute("title")).toBe("App default: Stories");
    expect(description(progress)).toContain("Overridden. App default: Stories");
    expect(progress.getAttribute("aria-describedby")).toContain("project-progress-status");
    const reset = within(row(progress)).getByRole("button", { name: "Reset Feature progress to the app default" });
    expect(reset.textContent).toBe("Reset");
    expect(reset.getAttribute("title")).toBe("App default: Stories");
    expect(mark.closest(".setting-label")!.textContent).toMatch(/^Feature progressOverridden/);

    const accept = switchFor("Require acceptance before Done");
    expect(within(row(accept)).queryByText(/Overridden|App default/)).toBeNull();
    expect(within(row(accept)).queryByRole("button", { name: /^Reset/ })).toBeNull();
    expect(description(accept)).not.toMatch(/Overridden|App default/);
    expect(within(main()).queryByText(/^App default/)).toBeNull();
  });

  it("changing a project value makes it an override; Reset removes it and the app default applies again", async () => {
    const { user, projectFiles } = renderApp();
    await openSettings(user, WORK);
    const accept = switchFor("Require acceptance before Done");
    await user.click(accept);
    await within(row(accept)).findByText("Overridden");
    expect(projectFiles.get(PROJECT.dir)).toEqual({ requireAccept: false });
    expect(isOn(accept)).toBe(false);
    expect(description(accept)).toContain("App default: On");

    await user.click(screen.getByRole("button", { name: "Reset Require acceptance before Done to the app default" }));
    await waitFor(() => expect(within(row(accept)).queryByText("Overridden")).toBeNull());
    expect(projectFiles.get(PROJECT.dir)).toEqual({});
    expect(isOn(accept)).toBe(true);
    expect(document.activeElement).toBe(accept); // focus stays on the setting when its Reset button goes
  });

  it("a change shows at once, before the config file is written (regression: the choice looked ignored)", async () => {
    const { user, projectFiles, releaseWrites } = renderApp({ slowProjectWrites: true });
    await openSettings(user, WORK);
    const progress = await screen.findByRole("radiogroup", { name: "Feature progress" });
    await user.click(within(progress).getByRole("radio", { name: "Tasks" }));
    expect(checked("Feature progress")).toBe("Tasks");
    expect(within(row(progress)).getByText("Overridden")).toBeTruthy();
    expect(projectFiles.get(PROJECT.dir)).toBeUndefined();
    await releaseWrites();
    expect(projectFiles.get(PROJECT.dir)).toEqual({ progress: "tasks" });
    expect(checked("Feature progress")).toBe("Tasks");
  });

  it("a project that doesn't override a setting follows the app default as it changes", async () => {
    const { user } = renderApp({ settings: { work: { ...DEFAULT_WORK_SETTINGS, knowledge: "read-only" } } });
    await openSettings(user, WORK);
    expect(checked("Agent access to project knowledge")).toBe("Read only");
    expect(within(row(screen.getByRole("radiogroup", { name: "Agent access to project knowledge" }))).queryByText("Overridden")).toBeNull();
  });

  it("changing an app default saves it in the app settings, not the project", async () => {
    const { user, appSaved, projectFiles } = renderApp();
    await openSettings(user, WORK, "App");
    expect(within(main()).getByText(/^Defaults for all projects\.$/)).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Tasks" }));
    expect(appSaved().at(-1)!.work).toEqual({ ...DEFAULT_WORK_SETTINGS, progress: "tasks" });
    expect(projectFiles.size).toBe(0);
    await user.click(navButton(WORK, "Project"));
    await projectLoaded();
    expect(checked("Feature progress")).toBe("Tasks");
    expect(within(main()).queryByText("Overridden")).toBeNull();
  });

  it("a project whose config file can't be read shows why and offers nothing to change", async () => {
    const { user } = renderApp({ brokenProjects: { [PROJECT.dir]: "progress must be \"stories\" or \"tasks\"" } });
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    await user.click(navButton(WORK));
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Can't read project settings: progress must be/);
    for (const r of radios("Feature progress")) expect((r as HTMLInputElement).disabled).toBe(true);
    expect((switchFor("Require acceptance before Done") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Featra's own work defaults are work-format's project defaults", () => {
    for (const def of WORK_SETTINGS) expect(DEFAULT_WORK_SETTINGS[def.key]).toEqual(DEFAULT_CONFIG[def.key]);
    expect(DEFAULT_APP_SETTINGS.work).toEqual(DEFAULT_WORK_SETTINGS);
  });
});
