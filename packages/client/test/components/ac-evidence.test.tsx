/**
 * STORY-72: a criterion's attached evidence, in the real App over a fake host. The card pane and the review screen
 * show it through the same component; what the server reads from disk is the test's to give (`evidence-server.ts`).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "@featra/work-format";
import type { EvidenceFile } from "@featra/work-format/evidence-link";
import { PROJECT, renderApp } from "../harness.tsx";
import { OPEN_COPY } from "../evidence-server.ts";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const STORY = "STORY-2";
const STORY_TEXT = "As a builder, I open a folder.";
const FOLDER = `.featra/evidence/FEAT-1/${STORY}/`;
const SHOT = `${FOLDER}open.png`;
const NOTES = `${FOLDER}notes.txt`;
const GONE = `${FOLDER}gone.png`;
const BROKEN = `${FOLDER}broken.png`;
const PNG = "iVBORw0KGgo=";

const files: Record<string, EvidenceFile> = {
  [SHOT]: { ok: true, kind: "image", name: "open.png", mime: "image/png", data: PNG },
  [NOTES]: { ok: true, kind: "file", name: "notes.txt" },
  [BROKEN]: { ok: false, problem: "unreadable" },
};

const ACS = ["Opens the folder", "Logs the open", "Remembers it", "Shows the folder", "Has no evidence"] as const;
const withEvidence = (c: Card): Card => ({
  ...c,
  description: STORY_TEXT,
  acs: [
    { text: ACS[0], done: true, test: null, evidence: SHOT },
    { text: ACS[1], done: true, test: null, evidence: NOTES },
    { text: ACS[2], done: false, test: null, evidence: GONE },
    { text: ACS[3], done: false, test: null, evidence: BROKEN },
    { text: ACS[4], done: false, test: null },
  ],
});
const cards = (): Card[] => PLAN.map(cardOf).map((c) => (c.id === STORY ? withEvidence(c) : c));

/** Opens the story's card; `disk` is what the server finds, read each time it is asked. */
async function openPane(disk: Record<string, EvidenceFile> = files) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards() }, evidence: disk });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
  const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
  await within(pane).findByRole("button", { name: "Open open.png" });
  return { ...app, pane };
}

/** The criterion's list item, found by its text. */
const criterion = (scope: HTMLElement, text: string) => {
  const items = [...scope.querySelectorAll<HTMLElement>("li.ac, li.ac.todo")];
  const found = items.find((li) => li.textContent?.includes(text));
  if (!found) throw new Error(`No criterion "${text}"`);
  return found;
};

describe("a screenshot shows as a thumbnail next to its criterion (STORY-72 AC1)", () => {
  it("in the card pane, read from the story's own evidence through the server", async () => {
    const app = await openPane();
    const shot = within(criterion(app.pane, ACS[0])).getByRole("button", { name: "Open open.png" });
    expect(shot.querySelector("img")?.getAttribute("src")).toBe(`data:image/png;base64,${PNG}`);
    expect(shot.getAttribute("title")).toBe(SHOT);
    expect(app.calls).toContain(`readEvidence:${PROJECT.dir}:${STORY}:${SHOT}`);
    // A criterion without evidence shows nothing for it, and asks the server nothing.
    expect(criterion(app.pane, ACS[4]).querySelector(".ac-evidence")).toBeNull();
    expect(app.calls.filter((c) => c.startsWith("readEvidence:"))).toHaveLength(4);
  });
});

describe("a thumbnail opens full size, and Escape closes it (STORY-72 AC2)", () => {
  it("opens the screenshot over the app; Escape closes it, returns focus, and leaves the card open", async () => {
    const app = await openPane();
    const shot = within(criterion(app.pane, ACS[0])).getByRole("button", { name: "Open open.png" });
    await app.user.click(shot);
    const viewer = screen.getByRole("dialog", { name: "Screenshot open.png" });
    const full = within(viewer).getByRole("img", { name: "open.png" });
    expect(full.getAttribute("src")).toBe(`data:image/png;base64,${PNG}`);
    expect(document.activeElement).toBe(within(viewer).getByRole("button", { name: "Close" }));
    await app.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(shot);
    expect(screen.getByRole("complementary", { name: `${STORY} card` })).toBe(app.pane);
  });

  it("closes with its Close button too", async () => {
    const app = await openPane();
    const shot = within(criterion(app.pane, ACS[0])).getByRole("button", { name: "Open open.png" });
    await app.user.click(shot);
    await app.user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(shot);
  });
});

describe("another file shows as a link that opens it (STORY-72 AC3)", () => {
  it("opens the server's copy of the file with the OS", async () => {
    const app = await openPane();
    const link = within(criterion(app.pane, ACS[1])).getByRole("link", { name: "notes.txt" });
    expect(link.getAttribute("title")).toBe(NOTES);
    await app.user.click(link);
    await waitFor(() => expect(app.calls).toContain(`openFile:${OPEN_COPY}/notes.txt`));
    expect(app.calls).toContain(`openEvidence:${PROJECT.dir}:${STORY}:${NOTES}`);
    expect(app.calls.indexOf(`openEvidence:${PROJECT.dir}:${STORY}:${NOTES}`)).toBeLessThan(
      app.calls.indexOf(`openFile:${OPEN_COPY}/notes.txt`),
    );
  });
});

describe("evidence that is missing or unreadable says so (STORY-72 AC4)", () => {
  it("shows a short note, and the criterion's text and the rest of the card still show", async () => {
    const app = await openPane();
    const gone = criterion(app.pane, ACS[2]);
    expect(await within(gone).findByText("Evidence missing")).toBeTruthy();
    expect(within(gone).getByRole("button", { name: "AC 3: Remembers it" })).toBeTruthy();
    const broken = criterion(app.pane, ACS[3]);
    expect(within(broken).getByText("Can't open evidence")).toBeTruthy();
    expect(within(broken).getByRole("button", { name: "AC 4: Shows the folder" })).toBeTruthy();
    expect(within(gone).queryByRole("img")).toBeNull();
    expect(within(app.pane).getByRole("button", { name: `User story: ${STORY_TEXT}` })).toBeTruthy();
  });

  it("says so beside a link whose file can't be opened any more", async () => {
    const disk = { ...files };
    const app = await openPane(disk);
    const row = criterion(app.pane, ACS[1]);
    const link = await within(row).findByRole("link", { name: "notes.txt" });
    // The file was there when read; the server now finds it gone.
    delete disk[NOTES];
    await app.user.click(link);
    expect(await within(row).findByText("Evidence missing")).toBeTruthy();
    expect(app.calls.some((c) => c.startsWith("openFile:"))).toBe(false);
  });
});

describe("the review screen shows the same evidence (STORY-72 AC1, AC2, AC3, AC4)", () => {
  const FEATURE = cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Folders" });
  const story = withEvidence(cardOf({ id: STORY, type: "story", parent: "FEAT-2", status: "In Progress" }));

  it("shows the thumbnail, the link and the notes beside each criterion", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: [FEATURE, story] }, evidence: files });
    await app.user.click(screen.getByRole("button", { name: "Work" }));
    await app.user.click(await screen.findByRole("button", { name: "Review FEAT-2" }));
    const shown = await screen.findByRole("region", { name: "Review FEAT-2" });
    const item = shown.querySelector(`[data-card="${STORY}"]`) as HTMLElement;
    const shot = await within(criterion(item, ACS[0])).findByRole("button", { name: "Open open.png" });
    expect(within(criterion(item, ACS[1])).getByRole("link", { name: "notes.txt" })).toBeTruthy();
    expect(within(criterion(item, ACS[2])).getByText("Evidence missing")).toBeTruthy();
    expect(within(criterion(item, ACS[3])).getByText("Can't open evidence")).toBeTruthy();
    expect(within(criterion(item, ACS[2])).getByText(ACS[2])).toBeTruthy();
    await app.user.click(shot);
    expect(screen.getByRole("dialog", { name: "Screenshot open.png" })).toBeTruthy();
    await app.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(shot);
    // Escape closed only the screenshot: the review screen is still open.
    expect(screen.getByRole("region", { name: "Review FEAT-2" })).toBe(shown);
  });
});
