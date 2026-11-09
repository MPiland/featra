/** STORY-47 AC1: the Featra MCP is on for a project unless Settings › Project turns it off. */
import { cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORK_SETTINGS } from "../../../src/bridge.ts";
import { PROJECT, renderApp } from "../../harness.tsx";
import { isOn, openSettings, row, switchFor, WORK } from "./helpers.tsx";

afterEach(cleanup);

describe("AC1: the Featra MCP setting", () => {
  it("is on by default", async () => {
    expect(DEFAULT_WORK_SETTINGS.mcp).toBe(true);
    const { user } = renderApp();
    await openSettings(user, WORK);
    expect(isOn(switchFor("Featra MCP"))).toBe(true);
  });

  it("turning it off in the project writes `mcp: false` to its config and labels it overridden", async () => {
    const { user, projectFiles } = renderApp();
    await openSettings(user, WORK);
    const mcp = switchFor("Featra MCP");
    await user.click(mcp);
    await within(row(mcp)).findByText("Overridden");
    expect(isOn(mcp)).toBe(false);
    expect(projectFiles.get(PROJECT.dir)).toEqual({ mcp: false });
  });

  it("shows a project that has it off as off", async () => {
    const { user } = renderApp({ projectFiles: { [PROJECT.dir]: { mcp: false } } });
    await openSettings(user, WORK);
    expect(isOn(switchFor("Featra MCP"))).toBe(false);
  });
});
