/**
 * STORY-74 (the user's side, from its review): the Browser pane names what it shows, waits for a feature's checkout to
 * install, gives an address the user typed the page, hides its page under the app's menus, shows the scale a device is
 * drawn at, and passes the keyboard to and from the page. It opens from a feature's card and from the Dev Lead's chat.
 * The real App over a fake host (browser-fake.ts): the dev server and the view are the platform's.
 */
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BROWSER_COPY } from "../../src/browser.ts";
import { PROJECT, renderApp } from "../harness.tsx";
import { cards as led, fromWork, startChat } from "../progress-fixtures.tsx";
import { STORY, browserPane, cards, device, key, openBrowser, rowOf } from "./browser-steps.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const URL = "http://localhost:5173/";
const navigations = (app: Awaited<ReturnType<typeof openBrowser>>) =>
  app.browser.log.filter((c) => c.startsWith("navigate:"));
/** A start the test lets answer. */
function held<T>() {
  let answer: ((value: T) => void) | undefined;
  const promise = new Promise<T>((r) => (answer = r));
  return { promise, answer: (value: T) => act(async () => answer?.(value)) };
}
/** Lets the fake host's answers land. */
const settled = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

describe("the pane's header", () => {
  it("says it is the Browser, and what it shows", async () => {
    const app = await openBrowser();
    expect(within(app.pane).getByText("Browser · STORY-5")).toBeTruthy();
  });
});

describe("a feature's fresh checkout installs its dependencies first", () => {
  it("says Installing while they install, then shows the dev server", async () => {
    const installed = held<void>();
    let starts = 0;
    const app = await openBrowser({
      browserStart: async () => {
        if (++starts === 1) return { ok: true, installing: true };
        await installed.promise;
        return { ok: true, url: URL };
      },
    });
    expect(await within(app.pane).findByText(BROWSER_COPY.installing)).toBeTruthy();
    expect(app.browser.layout()?.bounds ?? null).toBeNull();
    await installed.answer();
    await waitFor(() => expect(app.browser.log).toContain(`navigate:${key(app)}:${URL}`));
    expect(within(app.pane).queryByText(BROWSER_COPY.installing)).toBeNull();
    expect(app.calls.filter((c) => c === `browserStart:${PROJECT.dir}:${STORY}`)).toHaveLength(2);
  });

  it("says why when the install fails", async () => {
    const why = "Install didn't finish\nnpm ERR! 404";
    let starts = 0;
    const app = await openBrowser({
      browserStart: async () => (++starts === 1 ? { ok: true, installing: true } : { ok: false, error: why }),
    });
    expect((await within(app.pane).findByRole("alert")).textContent).toBe(why);
    expect(within(app.pane).queryByText(BROWSER_COPY.installing)).toBeNull();
  });
});

describe("an address the user goes to is theirs", () => {
  it("shows the page while the dev server still starts, and the server coming up doesn't take it back", async () => {
    const up = held<{ ok: true; url: string }>();
    const app = await openBrowser({ browserStart: () => up.promise });
    const address = within(app.pane).getByRole("textbox", { name: BROWSER_COPY.address });
    await app.user.type(address, "example.com{Enter}");
    await waitFor(() => expect(app.browser.layout()?.bounds).not.toBeNull());
    expect(within(app.pane).queryByText(BROWSER_COPY.starting)).toBeNull();
    await up.answer({ ok: true, url: URL });
    await settled();
    expect(navigations(app)).toEqual([`navigate:${key(app)}:https://example.com/`]);
  });

  it("shows the page when the dev server didn't start", async () => {
    const app = await openBrowser({ browserStart: async () => ({ ok: false, error: "No dev server command." }) });
    await within(app.pane).findByRole("alert");
    expect(app.browser.layout()?.bounds ?? null).toBeNull();
    await app.user.type(within(app.pane).getByRole("textbox", { name: BROWSER_COPY.address }), "localhost:3000{Enter}");
    await waitFor(() => expect(app.browser.layout()?.bounds).not.toBeNull());
    expect(navigations(app)).toEqual([`navigate:${key(app)}:http://localhost:3000/`]);
  });
});

describe("the page hides under what covers the app", () => {
  it("hides while a menu is open, and shows again when it closes", async () => {
    const app = await openBrowser();
    await waitFor(() => expect(app.browser.layout()?.bounds).not.toBeNull());
    await app.user.click(screen.getByRole("button", { name: /^Switch project: / }));
    expect(screen.getByRole("menu")).toBeTruthy();
    await waitFor(() => expect(app.browser.layout()?.bounds).toBeNull());
    await app.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(app.browser.layout()?.bounds).not.toBeNull());
  });
});

/** The pane's viewport, laid out 400 by 600 px; jsdom lays nothing out (every other box is empty, as in jsdom). */
const viewport = () =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("browser-viewport") ? new DOMRect(0, 0, 400, 600) : new DOMRect();
  });

describe("a device scaled to fit", () => {
  it("shows the scale next to its size, as Chrome does, and none when the page fits the pane", async () => {
    viewport();
    const app = await openBrowser();
    expect(within(app.pane).queryByText(/^\d+%$/)).toBeNull();
    await app.user.selectOptions(device(app.pane), "iPhone SE");
    // 568 px of room for its 667 px height, the handles' gutters taken off.
    const shown = await within(app.pane).findByText("85%");
    expect(shown.getAttribute("title")).toBe(BROWSER_COPY.scale(568 / 667));
    expect(app.browser.layout()?.device?.scale).toBeCloseTo(568 / 667);
  });
});

describe("the keyboard", () => {
  it("goes to the page when its place in the pane is focused", async () => {
    const app = await openBrowser();
    await waitFor(() => expect(app.browser.layout()?.bounds).not.toBeNull());
    act(() => within(app.pane).getByRole("group", { name: BROWSER_COPY.page }).focus());
    expect(app.browser.log).toContain(`focus:${key(app)}`);
  });

  it("closes the pane on Escape in the page, stopping its dev server", async () => {
    const app = await openBrowser();
    await app.browser.escape();
    expect(screen.queryByRole("complementary", { name: BROWSER_COPY.pane(STORY) })).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`browserStop:${PROJECT.dir}:${STORY}`));
  });

  it("applies a typed width on Enter or leaving the field, not on each key", async () => {
    const app = await openBrowser();
    await app.user.selectOptions(device(app.pane), BROWSER_COPY.responsive);
    await waitFor(() => expect(app.browser.layout()?.device).not.toBeNull());
    const before = app.browser.layout()!.device!.width;
    const width = within(app.pane).getByRole("spinbutton", { name: BROWSER_COPY.width });
    await app.user.clear(width);
    await app.user.type(width, "640");
    expect(app.browser.layout()?.device?.width).toBe(before);
    await app.user.tab();
    await waitFor(() => expect(app.browser.layout()?.device?.width).toBe(640));
  });
});

describe("each pane's key", () => {
  it("is this page load's own, and new for each pane opened", async () => {
    const app = await openBrowser();
    const first = key(app);
    expect(first).toMatch(/^browser-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+$/);
    expect(app.browser.keys).toEqual([first]);
    expect(app.browser.targets.get(first)).toEqual({ dir: PROJECT.dir, id: STORY });
    const opener = screen.getAllByRole("button", { name: BROWSER_COPY.open })[0]!;
    await app.user.click(opener);
    await app.user.click(opener);
    await browserPane();
    const second = key(app);
    expect(second).not.toBe(first);
    expect(second.slice(0, second.lastIndexOf("-"))).toBe(first.slice(0, first.lastIndexOf("-")));
    await waitFor(() => expect(app.browser.keys).toEqual([first, first, second]));
  });
});

describe("AC1: it opens from a feature's card pane and from the Dev Lead's chat", () => {
  it("opens from a feature's card pane, on the feature", async () => {
    const app = renderApp({ cards: led(null), cardProof: { "FEAT-2": { browser: true } } });
    // An active feature's card opens from its progress.
    await app.user.click(within(await fromWork(app)).getByRole("button", { name: "FEAT-2 card" }));
    const card = await screen.findByRole("complementary", { name: "FEAT-2 card" });
    await app.user.click(await within(card).findByRole("button", { name: BROWSER_COPY.open }));
    const pane = await browserPane("FEAT-2");
    expect(within(pane).getByText("Browser · FEAT-2")).toBeTruthy();
    await waitFor(() => expect(app.calls).toContain(`browserStart:${PROJECT.dir}:FEAT-2`));
  });

  it("opens from the Dev Lead's chat, on the feature it leads", async () => {
    const app = await startChat({ cards: led(), cardProof: { "FEAT-2": { browser: true } } });
    const chat = screen.getByRole("region", { name: "Dev Lead" });
    const opener = await within(chat).findByRole("button", { name: BROWSER_COPY.open });
    await app.user.click(opener);
    const pane = await browserPane("FEAT-2");
    expect(opener.getAttribute("aria-controls")).toBe(pane.id);
    await waitFor(() => expect(app.calls).toContain(`browserStart:${PROJECT.dir}:FEAT-2`));
  });

  it("isn't offered in a chat whose card has nothing to serve", async () => {
    await startChat({ cards: led() });
    await screen.findByRole("button", { name: "Feature progress" });
    await settled();
    expect(
      within(screen.getByRole("region", { name: "Dev Lead" })).queryByRole("button", { name: BROWSER_COPY.open }),
    ).toBeNull();
  });

  it("isn't offered in a story's chat whose card has nothing to serve", async () => {
    const app = renderApp({ cards: cards("New") });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(await screen.findByRole("button", { name: "Delegation" }));
    await app.user.click(await screen.findByRole("button", { name: `Start ${STORY}` }));
    await app.user.click(await within(rowOf()).findByRole("button", { name: `Open the session of ${STORY}` }));
    await screen.findByRole("region", { name: "Developer" });
    await settled();
    expect(screen.queryByRole("button", { name: BROWSER_COPY.open })).toBeNull();
  });
});
