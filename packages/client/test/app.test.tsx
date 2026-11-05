import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { collapsedState, ENTRIES, isCollapsed, renderApp, sidebar, titleBar, toggle, viewTitle } from "./harness.tsx";

afterEach(cleanup);

describe("AC1: title bar", () => {
  it("shows the menu, sidebar toggle, back and forward, and the current view's title", () => {
    renderApp();
    const bar = within(titleBar());
    for (const name of ["Menu", "Toggle sidebar", "Back", "Forward"]) {
      expect(bar.getByRole("button", { name })).toBeTruthy();
    }
    expect(viewTitle().textContent).toBe("Work");
    expect(document.title).toBe("Featra · Work");
  });

  it("title follows the open view, and back and forward walk the history", async () => {
    const { user } = renderApp();
    const back = within(titleBar()).getByRole("button", { name: "Back" }) as HTMLButtonElement;
    const forward = within(titleBar()).getByRole("button", { name: "Forward" }) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    expect(forward.disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Inbox" }));
    expect(viewTitle().textContent).toBe("Inbox");
    expect(document.title).toBe("Featra · Inbox");

    await user.click(back);
    expect(viewTitle().textContent).toBe("Work");
    expect(forward.disabled).toBe(false);
    await user.click(forward);
    expect(viewTitle().textContent).toBe("Inbox");
  });

  it("draws its own window controls on Windows and Linux, not on macOS", async () => {
    const { user, actions } = renderApp();
    await user.click(screen.getByRole("button", { name: "Minimize" }));
    await user.click(screen.getByRole("button", { name: "Maximize" }));
    await user.click(screen.getByRole("button", { name: "Close window" }));
    expect(actions()).toEqual(["minimize", "toggleMaximize", "close"]);
    cleanup();
    renderApp({ platform: "darwin" });
    expect(screen.queryByRole("button", { name: "Close window" })).toBeNull();
  });
});

describe("AC2: collapsing the sidebar", () => {
  it("the toggle collapses and expands the sidebar and saves each change", async () => {
    const { user, saves } = renderApp();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(isCollapsed()).toBe(false);

    await user.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(isCollapsed()).toBe(true);
    expect(saves).toEqual([collapsedState(true)]);

    await user.click(toggle());
    expect(isCollapsed()).toBe(false);
    expect(saves).toEqual([collapsedState(true), collapsedState(false)]);
  });

  it("Ctrl+B collapses and expands the sidebar and saves each change", async () => {
    const { user, saves } = renderApp();
    await user.keyboard("{Control>}b{/Control}");
    expect(isCollapsed()).toBe(true);
    await user.keyboard("{Control>}b{/Control}");
    expect(isCollapsed()).toBe(false);
    expect(saves).toEqual([collapsedState(true), collapsedState(false)]);
  });

  it("Cmd+B does it on macOS", async () => {
    const { user } = renderApp({ platform: "darwin" });
    await user.keyboard("{Meta>}b{/Meta}");
    expect(isCollapsed()).toBe(true);
  });

  it("starts collapsed when the stored state says so, without re-saving it", () => {
    const { saves } = renderApp({ collapsed: true });
    expect(isCollapsed()).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(saves).toEqual([]);
  });

  it("collapsing with focus in the sidebar moves focus to the toggle", async () => {
    const { user } = renderApp();
    screen.getByRole("button", { name: "Inbox" }).focus();
    await user.keyboard("{Control>}b{/Control}");
    expect(document.activeElement).toBe(toggle());
  });
});

describe("AC3: sidebar entries", () => {
  it("lists Work, Inbox, Artifacts, Plugins and Settings", () => {
    renderApp();
    const names = within(sidebar())
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(ENTRIES);
  });

  it("reaches and opens every entry with Tab and Enter", async () => {
    const { user } = renderApp();
    for (const name of ENTRIES) {
      const entry = within(sidebar()).getByRole("button", { name });
      // Tab forward from the top of the page until the entry has focus.
      (document.activeElement as HTMLElement | null)?.blur();
      let presses = 0;
      while (document.activeElement !== entry && presses++ < 20) await user.tab();
      expect(document.activeElement).toBe(entry);
      await user.keyboard("{Enter}");
      expect(viewTitle().textContent).toBe(name);
      expect(entry.getAttribute("aria-current")).toBe("page");
    }
  });

  it("opens an entry with Space too", async () => {
    const { user } = renderApp();
    within(sidebar()).getByRole("button", { name: "Artifacts" }).focus();
    await user.keyboard(" ");
    expect(viewTitle().textContent).toBe("Artifacts");
  });

  it("shows a placeholder for each view not built yet; Settings shows its pages (STORY-20)", async () => {
    const { user } = renderApp();
    for (const name of ENTRIES.filter((e) => e !== "Settings")) {
      await user.click(within(sidebar()).getByRole("button", { name }));
      expect(within(screen.getByRole("main")).getByText(/will show here/)).toBeTruthy();
    }
    await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
    expect(within(screen.getByRole("main")).queryByText(/will show here/)).toBeNull();
    expect(within(screen.getByRole("main")).getByRole("navigation", { name: "Settings pages" })).toBeTruthy();
  });
});
