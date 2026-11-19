/** STORY-65: Settings shows the app's version, the one the host reports (Electron's `app.getVersion()`). */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../../harness.tsx";
import { navButton, openSettings, pageNav } from "./helpers.tsx";

afterEach(cleanup);

describe("the app's version under Settings (STORY-65)", () => {
  it("is under the page list, on every page, as the host reports it", async () => {
    const { user } = renderApp();
    await openSettings(user);
    expect((await within(pageNav()).findByText("Version 1.2.3")).tagName).toBe("P");
    // After the page lists, at the foot of the navigation.
    expect(pageNav().lastElementChild?.textContent).toBe("Version 1.2.3");
    for (const page of ["Appearance", "Keyboard shortcuts"]) {
      await user.click(navButton(page));
      expect(within(pageNav()).getByText("Version 1.2.3")).toBeTruthy();
    }
  });

  it("is shown once, in a browser tab too, where Settings has no General page", async () => {
    const { user } = renderApp({ platform: "web" });
    await openSettings(user);
    expect(await within(pageNav()).findByText("Version 1.2.3")).toBeTruthy();
    expect(screen.getAllByText(/^Version /).map((p) => p.textContent)).toEqual(["Version 1.2.3"]);
  });
});
