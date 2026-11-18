/** STORY-59 AC4: Auto-merge is a Workflow setting, on by default, with an app default and a project override. */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@featra/work-format";
import { DEFAULT_WORK_SETTINGS } from "../../../src/bridge.ts";
import { PROJECT, renderApp } from "../../harness.tsx";
import { description, isOn, navButton, openSettings, projectLoaded, row, switchFor, WORK } from "./helpers.tsx";

afterEach(cleanup);

const LABEL = "Auto-merge stories";

describe("STORY-59 AC4: the Auto-merge setting", () => {
  it("is on by default, under Progress and review right after Require acceptance", async () => {
    expect(DEFAULT_WORK_SETTINGS.autoMerge).toBe(true);
    expect(DEFAULT_CONFIG.autoMerge).toBe(true);
    const { user } = renderApp();
    await openSettings(user, WORK);
    const group = screen.getByRole("region", { name: "Progress and review" });
    const auto = switchFor(LABEL);
    expect(within(group).getAllByRole("switch")).toEqual([switchFor("Require acceptance before Done"), auto]);
    expect(isOn(auto)).toBe(true);
    expect(description(auto)).toContain("A story merges into its feature once it's Verified and Proven.");
  });

  it("turning it off in the project writes `autoMerge: false` to its config and labels it overridden", async () => {
    const { user, projectFiles } = renderApp();
    await openSettings(user, WORK);
    const auto = switchFor(LABEL);
    await user.click(auto);
    await within(row(auto)).findByText("Overridden");
    expect(isOn(auto)).toBe(false);
    expect(projectFiles.get(PROJECT.dir)).toEqual({ autoMerge: false });
  });

  it("turning off the app default saves it in the app settings, and a project that doesn't set it follows", async () => {
    const { user, appSaved, projectFiles } = renderApp();
    await openSettings(user, WORK, "App");
    await user.click(switchFor(LABEL));
    expect(appSaved().at(-1)!.work).toEqual({ ...DEFAULT_WORK_SETTINGS, autoMerge: false });
    expect(projectFiles.size).toBe(0);
    await user.click(navButton(WORK, "Project"));
    await projectLoaded();
    expect(isOn(switchFor(LABEL))).toBe(false);
    expect(within(row(switchFor(LABEL))).queryByText("Overridden")).toBeNull();
  });
});
