import { describe, expect, it } from "vitest";
import { canGoBack, canGoForward, currentView, goBack, goForward, initialNav, navigate } from "../src/navigation.ts";

describe("view history", () => {
  it("starts on Work with nowhere to go", () => {
    const nav = initialNav();
    expect(currentView(nav)).toBe("work");
    expect(canGoBack(nav)).toBe(false);
    expect(canGoForward(nav)).toBe(false);
  });

  it("goes back and forward through opened views", () => {
    let nav = navigate(navigate(initialNav(), "inbox"), "settings");
    nav = goBack(nav);
    expect(currentView(nav)).toBe("inbox");
    expect(canGoForward(nav)).toBe(true);
    nav = goBack(nav);
    expect(currentView(nav)).toBe("work");
    expect(canGoBack(nav)).toBe(false);
    nav = goForward(goForward(nav));
    expect(currentView(nav)).toBe("settings");
    expect(canGoForward(nav)).toBe(false);
  });

  it("drops forward entries when a new view is opened after going back", () => {
    let nav = navigate(navigate(initialNav(), "inbox"), "settings");
    nav = navigate(goBack(nav), "plugins");
    expect(nav.entries).toEqual(["work", "inbox", "plugins"]);
    expect(canGoForward(nav)).toBe(false);
  });

  it("does not add an entry when the current view is opened again", () => {
    const nav = navigate(initialNav(), "inbox");
    expect(navigate(nav, "inbox")).toBe(nav);
  });

  it("ignores back at the start and forward at the end", () => {
    const nav = initialNav();
    expect(goBack(nav)).toBe(nav);
    expect(goForward(nav)).toBe(nav);
  });
});
