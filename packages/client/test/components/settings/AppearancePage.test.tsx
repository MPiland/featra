/** STORY-20 Settings: the theme (AC8). */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../../../src/bridge.ts";
import { renderApp } from "../../harness.tsx";
import { radios, checked, openSettings } from "./helpers.tsx";

afterEach(cleanup);

describe("AC8: Settings > Appearance > Theme: System, Light, Dark; default System", () => {
  it("defaults to System, and applies and saves the choice at once", async () => {
    const { user, calls, appSaved } = renderApp();
    await openSettings(user, "Appearance");
    expect(radios("Theme").map((r) => r.closest("label")!.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(checked("Theme")).toBe("System");
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(calls.at(-1)).toBe("theme:dark");
    expect(appSaved()).toEqual([{ ...DEFAULT_APP_SETTINGS, theme: "dark" }]);

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(calls.at(-1)).toBe("theme:system");
  });

  it("starts on the stored theme", async () => {
    const { user } = renderApp({ settings: { theme: "light" } });
    expect(document.documentElement.dataset.theme).toBe("light");
    await openSettings(user, "Appearance");
    expect(checked("Theme")).toBe("Light");
  });
});
