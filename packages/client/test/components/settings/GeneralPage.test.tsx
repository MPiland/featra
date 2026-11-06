/** STORY-20 Settings: the Close button (AC6). */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, NO_TRAY_REASON } from "../../../src/bridge.ts";
import { renderApp } from "../../harness.tsx";
import { pageNav, pageTitle, radios, checked, row, description, openSettings } from "./helpers.tsx";

afterEach(cleanup);

describe("AC6: Close button: keep running in the tray or quit", () => {
  it("defaults to Minimize to tray, and saves Quit when chosen", async () => {
    const { user, appSaved } = renderApp();
    await openSettings(user, "General");
    expect(checked("Close button")).toBe("Minimize to tray");
    expect(radios("Close button").map((r) => r.closest("label")!.textContent)).toEqual(["Minimize to tray", "Quit"]);
    // A label and its two choices say it all: no description.
    expect(screen.getByRole("radiogroup", { name: "Close button" }).hasAttribute("aria-describedby")).toBe(false);
    expect(row(screen.getByRole("radiogroup", { name: "Close button" })).querySelector(".setting-help")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Quit" }));
    expect(appSaved()).toEqual([{ ...DEFAULT_APP_SETTINGS, closeButton: "quit" }]);
    expect(checked("Close button")).toBe("Quit");
  });

  it("macOS keeps the app in the Dock", async () => {
    const { user } = renderApp({ platform: "darwin" });
    await openSettings(user, "General");
    expect(checked("Close button")).toBe("Minimize to Dock");
  });

  it("without a tray (Linux with no tray host) shows Quit, disabled, with the reason", async () => {
    const { user, appSaved } = renderApp({
      platform: "linux",
      closeToTray: { available: false, reason: NO_TRAY_REASON },
    });
    await openSettings(user, "General");
    expect(checked("Close button")).toBe("Quit");
    for (const r of radios("Close button")) expect((r as HTMLInputElement).disabled).toBe(true);
    const group = screen.getByRole("radiogroup", { name: "Close button" });
    expect(within(row(group)).getByText(NO_TRAY_REASON)).toBeTruthy();
    expect(NO_TRAY_REASON).toBe("No system tray, so closing quits.");
    expect(group.getAttribute("aria-describedby")).toContain("app-closeButton-status");
    expect(description(group)).toContain(NO_TRAY_REASON);
    await user.click(screen.getByRole("radio", { name: "Minimize to tray" }));
    expect(appSaved()).toEqual([]);
  });

  it("a browser tab has no close button to set: General is left out", async () => {
    const { user } = renderApp({ platform: "web" });
    await openSettings(user);
    expect(within(pageNav()).queryByRole("button", { name: "General" })).toBeNull();
    expect(pageTitle()).toBe("Appearance");
  });
});
