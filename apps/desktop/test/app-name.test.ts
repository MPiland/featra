import { describe, expect, it } from "vitest";
import { APP_NAME, nameApp } from "../src/app-name.ts";

/** Electron's `app`, faked: run from source it is named after the package, and userData follows the name until set. */
function fakeElectronApp() {
  let name = "@featra/desktop";
  let userData: string | undefined;
  return {
    getName: () => name,
    setName: (n: string) => {
      name = n;
    },
    getPath: () => userData ?? `/appData/${name}`,
    setPath: (_: "userData", path: string) => {
      userData = path;
    },
  };
}

describe("the app's name (STORY-63)", () => {
  it("is Featra, not the package's name, so the macOS app menu says About Featra and Quit Featra", () => {
    const app = fakeElectronApp();
    nameApp(app);
    expect(APP_NAME).toBe("Featra");
    expect(app.getName()).toBe("Featra");
  });

  it("keeps the userData folder where it was, so an existing profile's projects and settings are still found", () => {
    const app = fakeElectronApp();
    nameApp(app);
    expect(app.getPath()).toBe("/appData/@featra/desktop");
  });
});
