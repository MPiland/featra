/**
 * STORY-75 (the user's side): Annotate in the Browser pane. The toggle turns it on and off; each annotation is listed,
 * numbered as its marker, and opens to take a comment, with its screenshot and what it captured shown as text; a
 * marker's annotation edits or deletes; closing the pane with unsent annotations asks first; and none of it asks the
 * server, so it costs no tokens. The real App over a fake host: the page, its overlay and the annotations' owner are
 * the main process's (the desktop's tests prove them); the fake records each ask and pushes what main says.
 */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ANNOTATE_COPY, type Annotation, type AnnotationsState } from "../../src/annotations.ts";
import { BROWSER_COPY } from "../../src/browser.ts";
import { PROJECT } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";
import { STORY, browserPane, key, openBrowser, projectCards } from "./browser-steps.tsx";

afterEach(cleanup);

const SHOT = "data:image/png;base64,iVBORw0KGgo=";
const annotation = (over: Partial<Annotation> = {}): Annotation => ({
  id: "a1",
  comment: "",
  kind: "elements",
  elements: [
    {
      selector: "#save",
      tag: "button",
      snippet: '<button id="save" onclick="steal()">Save</button>',
      styles: { color: "rgb(255, 0, 0)", "font-size": "14px" },
    },
  ],
  region: null,
  url: "http://localhost:5173/settings",
  viewport: { width: 800, height: 600, dpr: 2, device: "iPhone 15" },
  screenshot: SHOT,
  consoleErrors: ["Boom (http://localhost:5173/app.js:3)"],
  source: null,
  ...over,
});
const state = (
  list: Annotation[],
  editing: string | null = null,
  annotating = true,
  capturing = false,
): AnnotationsState => ({ annotating, list, editing, capturing });

/** The Browser pane open on STORY-5, its page served. */
async function openAnnotate() {
  const app = await openBrowser();
  const toggle = within(app.pane).getByRole("button", { name: ANNOTATE_COPY.annotate });
  return { ...app, toggle, k: key(app) };
}
const panel = (pane: HTMLElement) => within(pane).getByRole("region", { name: ANNOTATE_COPY.list });
const ask = () => screen.queryByRole("alertdialog", { name: BROWSER_COPY.close });
const paneGone = () => screen.queryByRole("complementary", { name: BROWSER_COPY.pane(STORY) }) === null;

describe("AC1: Annotate is turned on and off from the pane, and Escape leaves it", () => {
  it("asks the page to annotate, and shows it on as the main process says", async () => {
    const app = await openAnnotate();
    expect(app.toggle.getAttribute("aria-pressed")).toBe("false");
    await app.user.click(app.toggle);
    expect(app.browser.log).toContain(`annotate:${app.k}:true`);
    await app.browser.annotations(state([]));
    expect(app.toggle.getAttribute("aria-pressed")).toBe("true");
    expect(within(app.pane).getByText(ANNOTATE_COPY.annotateHint)).toBeTruthy();
    await app.user.click(app.toggle);
    expect(app.browser.log).toContain(`annotate:${app.k}:false`);
  });

  it("is off until the page shows", async () => {
    let up: (() => void) | undefined;
    const started = new Promise<void>((r) => (up = r));
    const app = await openBrowser({
      browserStart: async () => {
        await started;
        return { ok: true, url: "http://localhost:5173/" };
      },
    });
    const toggle = within(app.pane).getByRole("button", { name: ANNOTATE_COPY.annotate }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    up?.();
    await within(app.pane).findByRole("button", { name: ANNOTATE_COPY.annotate, pressed: false });
    expect(toggle.disabled).toBe(false);
  });

  it("is left by Escape in the pane, which then stays open", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([]));
    fireEvent.keyDown(app.pane, { key: "Escape" });
    expect(app.browser.log).toContain(`annotate:${app.k}:false`);
    expect(paneGone()).toBe(false);
  });
});

describe("AC2: each annotation takes a comment and shows what it captured", () => {
  it("lists it numbered as its marker, open to take a comment, sent as it is typed", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([annotation()], "a1"));
    const row = within(panel(app.pane)).getByRole("button", {
      name: `${ANNOTATE_COPY.marker(1)}: ${ANNOTATE_COPY.noComment}`,
    });
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const field = within(app.pane).getByRole("textbox", { name: ANNOTATE_COPY.comment });
    expect(document.activeElement).toBe(field);
    await app.user.type(field, "Red");
    expect(app.browser.log).toContain(`comment:${app.k}:a1:Red`);
  });

  it("shows its screenshot, elements, viewport, address and console errors, as text", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([annotation()], "a1"));
    const img = within(app.pane).getByRole("img", { name: ANNOTATE_COPY.screenshot(1) });
    expect(img.getAttribute("src")).toBe(SHOT);
    const details = within(app.pane).getByText(ANNOTATE_COPY.details).closest("details")!;
    const text = details.textContent ?? "";
    expect(text).toContain("#save");
    expect(text).toContain('<button id="save" onclick="steal()">Save</button>');
    expect(text).toContain("color: rgb(255, 0, 0);");
    expect(text).toContain("800 × 600 · iPhone 15 · 2x");
    expect(text).toContain("http://localhost:5173/settings");
    expect(text).toContain("Boom (http://localhost:5173/app.js:3)");
    // The page's markup is the page's text: shown, never made into elements.
    expect(details.querySelector("button#save")).toBeNull();
    expect(within(details).queryByText(ANNOTATE_COPY.source)).toBeNull();
  });

  it("shows a region's place and size, and None when the console had no errors", async () => {
    const app = await openAnnotate();
    const region = annotation({ kind: "region", region: { x: 10, y: 320, width: 50, height: 40 }, consoleErrors: [] });
    await app.browser.annotations(state([region], "a1"));
    const text = within(app.pane).getByText(ANNOTATE_COPY.details).closest("details")!.textContent ?? "";
    expect(text).toContain(`${ANNOTATE_COPY.region}10, 320 · 50 × 40`);
    expect(text).toContain(`${ANNOTATE_COPY.consoleErrors}${ANNOTATE_COPY.noErrors}`);
  });
});

describe("AC3: the source-file hint shows when the dev build gave one", () => {
  it("shows the file, line and column", async () => {
    const app = await openAnnotate();
    const source = { file: "src/Button.tsx", line: 8, column: 5 };
    await app.browser.annotations(state([annotation({ source })], "a1"));
    const details = within(app.pane).getByText(ANNOTATE_COPY.details).closest("details")!;
    expect(within(details).getByText(ANNOTATE_COPY.source)).toBeTruthy();
    expect(within(details).getByText("src/Button.tsx:8:5")).toBeTruthy();
  });
});

describe("AC4: a marker's annotation edits or deletes", () => {
  it("opens from its row, and closes by Done or Escape, with the pane still open", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([annotation({ comment: "Red" }), annotation({ id: "a2", comment: "Bigger" })]));
    await app.user.click(within(panel(app.pane)).getByRole("button", { name: `${ANNOTATE_COPY.marker(2)}: Bigger` }));
    expect(app.browser.log).toContain(`edit:${app.k}:a2`);
    await app.browser.annotations(
      state([annotation({ comment: "Red" }), annotation({ id: "a2", comment: "Bigger" })], "a2"),
    );
    const field = within(app.pane).getByRole("textbox", { name: ANNOTATE_COPY.comment }) as HTMLTextAreaElement;
    expect(field.value).toBe("Bigger");
    await app.user.click(within(app.pane).getByRole("button", { name: ANNOTATE_COPY.done }));
    expect(app.browser.log.at(-1)).toBe(`edit:${app.k}:null`);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(app.browser.log.at(-1)).toBe(`edit:${app.k}:null`);
    expect(paneGone()).toBe(false);
  });

  it("opens when the main process says its marker was clicked", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([annotation({ comment: "Red" })]));
    expect(within(app.pane).queryByRole("textbox", { name: ANNOTATE_COPY.comment })).toBeNull();
    await app.browser.annotations(state([annotation({ comment: "Red" })], "a1"));
    expect(document.activeElement).toBe(within(app.pane).getByRole("textbox", { name: ANNOTATE_COPY.comment }));
  });

  it("deletes, and the list closes up", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(
      state([annotation({ comment: "Red" }), annotation({ id: "a2", comment: "Bigger" })], "a1"),
    );
    await app.user.click(within(app.pane).getByRole("button", { name: ANNOTATE_COPY.delete }));
    expect(app.browser.log.at(-1)).toBe(`remove:${app.k}:a1`);
    await app.browser.annotations(state([annotation({ id: "a2", comment: "Bigger" })]));
    expect(within(panel(app.pane)).getByRole("button", { name: `${ANNOTATE_COPY.marker(1)}: Bigger` })).toBeTruthy();
    await app.browser.annotations(state([]));
    expect(within(app.pane).queryByRole("region", { name: ANNOTATE_COPY.list })).toBeNull();
  });
});

describe("AC5: closing the pane with unsent annotations asks first", () => {
  it("asks on Close; Cancel keeps the pane and its annotations, and Close and discard closes it", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([annotation(), annotation({ id: "a2" })]));
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.close }));
    expect(ask()?.textContent).toContain(ANNOTATE_COPY.closeAsk(2));
    expect(paneGone()).toBe(false);
    await app.user.click(within(ask()!).getByRole("button", { name: ANNOTATE_COPY.keep }));
    expect(ask()).toBeNull();
    expect(paneGone()).toBe(false);
    expect(app.browser.log.some((c) => c.startsWith("close:"))).toBe(false);
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.close }));
    await app.user.click(within(ask()!).getByRole("button", { name: ANNOTATE_COPY.closeAnyway }));
    expect(paneGone()).toBe(true);
    expect(app.browser.log).toContain(`close:${app.k}`);
  });

  it("asks on Escape in the pane or its page, once Annotate is off", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([annotation()], null, false));
    fireEvent.keyDown(app.pane, { key: "Escape" });
    expect(ask()?.textContent).toContain(ANNOTATE_COPY.closeAsk(1));
    await app.user.click(within(ask()!).getByRole("button", { name: ANNOTATE_COPY.keep }));
    await app.browser.escape();
    expect(ask()).not.toBeNull();
    expect(paneGone()).toBe(false);
  });

  it("asks on Browser again, and before another card's Browser replaces it", async () => {
    const other = cardOf({ id: "STORY-6", type: "story", parent: "FEAT-2", status: "In Progress", title: "Spawn six" });
    const app = await openBrowser({
      cards: { [PROJECT.dir]: [...projectCards(), other] },
      cardProof: { [STORY]: { browser: true }, "STORY-6": { browser: true } },
    });
    await app.browser.annotations(state([annotation()], null, false));
    await app.user.click(within(app.card).getByRole("button", { name: BROWSER_COPY.open }));
    expect(ask()).not.toBeNull();
    await app.user.click(within(ask()!).getByRole("button", { name: ANNOTATE_COPY.keep }));
    await app.user.click(screen.getByRole("button", { name: "Spawn six" }));
    const card6 = await screen.findByRole("complementary", { name: "STORY-6 card" });
    await app.user.click(within(card6).getByRole("button", { name: BROWSER_COPY.open }));
    expect(ask()).not.toBeNull();
    await app.user.click(within(ask()!).getByRole("button", { name: ANNOTATE_COPY.closeAnyway }));
    expect(await browserPane("STORY-6")).toBeTruthy();
  });

  // Review fix 7: a pick still being captured is an annotation in a moment.
  it("asks while a pick is still being captured", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([], null, true, true));
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.close }));
    expect(ask()?.textContent).toContain(ANNOTATE_COPY.closeAsk(1));
    expect(paneGone()).toBe(false);
  });

  // Visual review A: discarding looks like what it is, and Enter keeps the pane.
  it("shows Close and discard as a danger, with Cancel focused so Enter keeps the pane", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([annotation()]));
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.close }));
    const discard = within(ask()!).getByRole("button", { name: ANNOTATE_COPY.closeAnyway });
    expect(discard.classList.contains("danger")).toBe(true);
    expect(document.activeElement).toBe(within(ask()!).getByRole("button", { name: ANNOTATE_COPY.keep }));
    await app.user.keyboard("{Enter}");
    expect(ask()).toBeNull();
    expect(paneGone()).toBe(false);
  });

  it("doesn't ask with no annotations", async () => {
    const app = await openAnnotate();
    await app.browser.annotations(state([], null, false));
    await app.user.click(within(app.pane).getByRole("button", { name: BROWSER_COPY.close }));
    expect(ask()).toBeNull();
    expect(paneGone()).toBe(true);
  });
});

describe("AC6: capturing costs no tokens", () => {
  it("asks nothing of the server while annotating, commenting, editing and deleting", async () => {
    const app = await openAnnotate();
    const before = [...app.calls];
    await app.user.click(app.toggle);
    await app.browser.annotations(state([annotation()], "a1"));
    await app.user.type(within(app.pane).getByRole("textbox", { name: ANNOTATE_COPY.comment }), "Red");
    await app.user.click(within(app.pane).getByRole("button", { name: ANNOTATE_COPY.delete }));
    await app.browser.annotations(state([]));
    expect(app.calls).toEqual(before);
  });
});
