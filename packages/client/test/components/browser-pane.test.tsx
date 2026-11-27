/**
 * STORY-74 (the user's side): the Browser pane docks beside a story's card or chat, starts the story's dev server and
 * shows it, takes any web address, shows the page as a device as Chrome's device toolbar does (remembered per
 * project), and stops the dev server when it closes. The real App over a fake host: the dev server and the page's view
 * are the platform's (the server's and the desktop's tests prove them); the fake records each call.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BROWSER_COPY } from "../../src/browser.ts";
import { PROJECT, renderApp } from "../harness.tsx";
import {
  STORY,
  WEBSITE,
  browserPane,
  cardFromWork,
  cards,
  device,
  key,
  lastSaved,
  openBrowser,
  projectCards,
  rowOf,
} from "./browser-steps.tsx";

afterEach(cleanup);
describe("AC1: the Browser pane docks beside the card or chat, and resizes and closes like the other panes", () => {
  it("opens from a story's card pane, beside it", async () => {
    const app = await openBrowser();
    // The card pane stays open; the Browser pane is at its right.
    expect(app.card.isConnected).toBe(true);
    expect(app.card.compareDocumentPosition(app.pane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const opener = within(app.card).getByRole("button", { name: BROWSER_COPY.open });
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(opener.getAttribute("aria-controls")).toBe(app.pane.id);
    expect(app.pane.className).toContain("card-pane");
  });

  it("opens from a story's chat", async () => {
    // A story not yet started: Start opens its chat.
    const app = renderApp({ cards: cards("New"), cardProof: { [STORY]: { browser: true } } });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(await screen.findByRole("button", { name: "Delegation" }));
    await app.user.click(await screen.findByRole("button", { name: `Start ${STORY}` }));
    await app.user.click(await within(rowOf()).findByRole("button", { name: `Open the session of ${STORY}` }));
    await screen.findByRole("region", { name: "Developer" });
    const opener = screen.getByRole("button", { name: BROWSER_COPY.open });
    await app.user.click(opener);
    const pane = await browserPane();
    expect(opener.getAttribute("aria-controls")).toBe(pane.id);
    await waitFor(() => expect(app.calls).toContain(`browserStart:${PROJECT.dir}:${STORY}`));
  });

  it("isn't offered on a card with nothing to serve", async () => {
    const app = renderApp({ cards: cards() });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(await screen.findByRole("button", { name: "Delegation" }));
    await app.user.click(within(rowOf()).getByRole("button", { name: "Spawn five" }));
    const card = await screen.findByRole("complementary", { name: `${STORY} card` });
    expect(within(card).queryByRole("button", { name: BROWSER_COPY.open })).toBeNull();
  });

  it("resizes by its handle, and the width is kept", async () => {
    const app = await openBrowser();
    const handle = screen.getByRole("separator", { name: BROWSER_COPY.resize });
    const before = Number(handle.getAttribute("aria-valuenow"));
    handle.focus();
    await app.user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(lastSaved(app)?.browserPaneWidth).toBe(before + 16));
    expect(app.pane.style.width).toBe(`${before + 16}px`);
  });

  it("closes by Close, stopping its dev server and its view, and focus goes back to Browser", async () => {
    const app = await openBrowser();
    const k = key(app);
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.close }));
    expect(screen.queryByRole("complementary", { name: BROWSER_COPY.pane(STORY) })).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`browserStop:${PROJECT.dir}:${STORY}`));
    expect(app.browser.log).toContain(`close:${k}`);
    expect(document.activeElement).toBe(within(app.card).getByRole("button", { name: BROWSER_COPY.open }));
  });

  it("closes by Escape, and by Browser again", async () => {
    const app = await openBrowser();
    fireEvent.keyDown(app.pane, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: BROWSER_COPY.pane(STORY) })).toBeNull();
    await app.user.click(within(app.card).getByRole("button", { name: BROWSER_COPY.open }));
    await browserPane();
    await app.user.click(within(app.card).getByRole("button", { name: BROWSER_COPY.open }));
    expect(screen.queryByRole("complementary", { name: BROWSER_COPY.pane(STORY) })).toBeNull();
    await waitFor(() => expect(app.calls.filter((c) => c.startsWith("browserStop:"))).toHaveLength(2));
  });
});

describe("AC2: it starts the story's dev server and shows it", () => {
  it("asks the server to start it, then loads its URL in the pane's view and lays it out", async () => {
    const app = await openBrowser();
    await waitFor(() => expect(app.browser.log).toContain(`navigate:${key(app)}:http://localhost:5173/`));
    expect(app.calls).toContain(`browserStart:${PROJECT.dir}:${STORY}`);
    expect(app.browser.log[0]).toBe(`open:${key(app)}`);
    await waitFor(() => expect(app.browser.layout()?.bounds).not.toBeNull());
    expect(app.browser.layout()?.device).toBeNull();
  });

  it("says why when the dev server doesn't start, and loads nothing", async () => {
    const why = "Error: Cannot find module 'vite'";
    const app = await openBrowser({ browserStart: async () => ({ ok: false, error: why }) });
    expect((await within(app.pane).findByRole("alert")).textContent).toBe(why);
    expect(app.browser.log.some((c) => c.startsWith("navigate:"))).toBe(false);
    expect(app.browser.layout()?.bounds).toBeNull();
  });

  it("says Starting while the dev server starts, with the view hidden", async () => {
    let up: (() => void) | undefined;
    const started = new Promise<void>((r) => (up = r));
    const app = await openBrowser({
      browserStart: async () => {
        await started;
        return { ok: true, url: "http://localhost:5173/" };
      },
    });
    expect(within(app.pane).getByText(BROWSER_COPY.starting)).toBeTruthy();
    expect(app.browser.layout()?.bounds ?? null).toBeNull();
    await act(async () => up?.());
    await waitFor(() => expect(within(app.pane).queryByText(BROWSER_COPY.starting)).toBeNull());
  });
});

describe("AC3: the address bar, back, forward and reload", () => {
  it("shows the page's address and loads any web address typed", async () => {
    const app = await openBrowser();
    await app.browser.push({ url: "http://localhost:5173/", title: "Fixture" });
    const address = within(app.pane).getByRole("textbox", { name: BROWSER_COPY.address });
    expect((address as HTMLInputElement).value).toBe("http://localhost:5173/");
    await app.user.clear(address);
    await app.user.type(address, "example.com/docs{Enter}");
    expect(app.browser.log).toContain(`navigate:${key(app)}:https://example.com/docs`);
  });

  it("refuses what isn't a web address, and Escape puts the page's address back", async () => {
    const app = await openBrowser();
    await app.browser.push({ url: "http://localhost:5173/" });
    const address = within(app.pane).getByRole("textbox", { name: BROWSER_COPY.address }) as HTMLInputElement;
    await app.user.clear(address);
    await app.user.type(address, "file:///etc/passwd{Enter}");
    expect(within(app.pane).getByRole("alert").textContent).toBe(BROWSER_COPY.badAddress);
    expect(address.getAttribute("aria-invalid")).toBe("true");
    expect(app.browser.log.filter((c) => c.startsWith("navigate:"))).toHaveLength(1);
    await app.user.keyboard("{Escape}");
    expect(address.value).toBe("http://localhost:5173/");
    // Escape in the address doesn't close the pane.
    expect(app.pane.isConnected).toBe(true);
  });

  it("goes back, forward and reloads, each when the page can", async () => {
    const app = await openBrowser();
    const back = within(app.pane).getByRole("button", { name: BROWSER_COPY.back }) as HTMLButtonElement;
    const forward = within(app.pane).getByRole("button", { name: BROWSER_COPY.forward }) as HTMLButtonElement;
    const reload = within(app.pane).getByRole("button", { name: BROWSER_COPY.reload }) as HTMLButtonElement;
    expect([back.disabled, forward.disabled, reload.disabled]).toEqual([true, true, true]);
    await app.browser.push({ url: "http://localhost:5173/b", canGoBack: true });
    expect([back.disabled, forward.disabled, reload.disabled]).toEqual([false, true, false]);
    await app.user.click(back);
    await app.user.click(reload);
    await app.browser.push({ url: "http://localhost:5173/", canGoForward: true });
    await app.user.click(forward);
    const k = key(app);
    expect(app.browser.log.slice(-3)).toEqual([`back:${k}`, `reload:${k}`, `forward:${k}`]);
  });

  it("says why a page didn't load", async () => {
    const app = await openBrowser();
    await app.browser.push({ url: "https://nowhere.invalid/", failed: "ERR_NAME_NOT_RESOLVED" });
    expect(within(app.pane).getByRole("alert").textContent).toBe(BROWSER_COPY.failed("ERR_NAME_NOT_RESOLVED"));
  });
});

describe("AC4: the device toolbar", () => {
  it("shows the page as a preset device: its size, pixel ratio and touch", async () => {
    const app = await openBrowser();
    await app.user.selectOptions(device(app.pane), "iPhone SE");
    await waitFor(() =>
      expect(app.browser.layout()?.device).toMatchObject({ width: 375, height: 667, dpr: 2, mobile: true }),
    );
    expect(within(app.pane).getByText("375 × 667")).toBeTruthy();
  });

  it("Responsive takes a width and height by its fields and its handles", async () => {
    const app = await openBrowser();
    await app.user.selectOptions(device(app.pane), BROWSER_COPY.responsive);
    const width = within(app.pane).getByRole("spinbutton", { name: BROWSER_COPY.width });
    await app.user.clear(width);
    await app.user.type(width, "500{Enter}");
    await waitFor(() => expect(app.browser.layout()?.device).toMatchObject({ width: 500, height: 800, mobile: false }));
    const handle = within(app.pane).getByRole("separator", { name: BROWSER_COPY.resizeHeight });
    handle.focus();
    await app.user.keyboard("{ArrowDown}");
    await waitFor(() => expect(app.browser.layout()?.device).toMatchObject({ width: 500, height: 810 }));
    expect(within(app.pane).getByRole("separator", { name: BROWSER_COPY.resizeWidth })).toBeTruthy();
  });

  it("adds a device, which is chosen, and removes it", async () => {
    const app = await openBrowser();
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.addDevice }));
    const form = within(app.pane).getByRole("form", { name: BROWSER_COPY.addDevice });
    await app.user.type(within(form).getByRole("textbox", { name: BROWSER_COPY.name }), "Kiosk");
    const width = within(form).getByRole("spinbutton", { name: BROWSER_COPY.width });
    const height = within(form).getByRole("spinbutton", { name: BROWSER_COPY.height });
    await app.user.clear(width);
    await app.user.type(width, "1080");
    await app.user.clear(height);
    await app.user.type(height, "1920");
    await app.user.click(within(form).getByRole("button", { name: BROWSER_COPY.add }));
    await waitFor(() => expect(app.browser.layout()?.device).toMatchObject({ width: 1080, height: 1920 }));
    expect((device(app.pane) as HTMLSelectElement).value).toBe("device:Kiosk");
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.removeDevice }));
    await waitFor(() => expect(app.browser.layout()?.device).toBeNull());
    expect(within(device(app.pane)).queryByRole("option", { name: "Kiosk" })).toBeNull();
  });

  it("remembers the choice and the added devices per project", async () => {
    const app = await openBrowser();
    await app.user.selectOptions(device(app.pane), "Pixel 8");
    await waitFor(() => expect(lastSaved(app)?.browserDevices?.[PROJECT.dir]?.choice).toEqual({ device: "Pixel 8" }));
    const saved = lastSaved(app)!;
    cleanup();
    const again = await openBrowser({ state: saved });
    expect((device(again.pane) as HTMLSelectElement).value).toBe("device:Pixel 8");
    await waitFor(() => expect(again.browser.layout()?.device).toMatchObject({ width: 412, height: 915 }));
  });

  it("starts another project at Fit, and keeps the first project's choice", async () => {
    const first = await openBrowser();
    await first.user.selectOptions(device(first.pane), "Pixel 8");
    await waitFor(() => expect(lastSaved(first)?.browserDevices?.[PROJECT.dir]?.choice).toEqual({ device: "Pixel 8" }));
    const saved = lastSaved(first)!;
    cleanup();
    const app = renderApp({
      projects: [PROJECT, WEBSITE],
      cards: { [PROJECT.dir]: projectCards(), [WEBSITE.dir]: projectCards() },
      cardProof: { [STORY]: { browser: true } },
      state: saved,
    });
    await app.user.click(await screen.findByRole("button", { name: /^Switch project: / }));
    await app.user.click(screen.getByRole("menuitemradio", { name: "website" }));
    await screen.findByRole("button", { name: /^Switch project: website/ });
    await app.user.click(await screen.findByRole("button", { name: "Work" }));
    const card = await cardFromWork(app);
    await app.user.click(within(card).getByRole("button", { name: BROWSER_COPY.open }));
    const pane = await browserPane();
    expect((device(pane) as HTMLSelectElement).value).toBe("fit");
    await waitFor(() => expect(app.browser.layout()?.device).toBeNull());
    expect(app.calls).toContain(`browserStart:${WEBSITE.dir}:${STORY}`);
    expect(
      lastSaved(app)?.browserDevices?.[PROJECT.dir]?.choice ?? saved.browserDevices?.[PROJECT.dir]?.choice,
    ).toEqual({
      device: "Pixel 8",
    });
  });
});

describe("AC5: closing the pane stops the dev server it started", () => {
  it("stops it when the pane goes away with its view", async () => {
    const app = await openBrowser();
    await waitFor(() => expect(app.browser.log.some((c) => c.startsWith("navigate:"))).toBe(true));
    const k = key(app);
    // Work's card pane closes; the Browser pane stays.
    await app.user.click(within(app.card).getByRole("button", { name: "Close card" }));
    expect((await browserPane()).isConnected).toBe(true);
    expect(app.calls.some((c) => c.startsWith("browserStop:"))).toBe(false);
    await app.user.click(within(await browserPane()).getByRole("button", { name: BROWSER_COPY.close }));
    await waitFor(() => expect(app.calls).toContain(`browserStop:${PROJECT.dir}:${STORY}`));
    expect(app.browser.open.has(k)).toBe(false);
  });
});
