/** STORY-4: the card pane, through the real App over a fake host whose server edits cards with work-format's rules. */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "@featra/work-format";
import { EDIT_AT, PROJECT, renderApp } from "../harness.tsx";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const STORY = "STORY-2";
const STORY_TEXT = "As a builder, I open a folder.";
const written = (c: Card): Card => ({
  ...c,
  description: STORY_TEXT,
  notes: "Start from the folder picker.",
  acs: [
    { text: "Opens the folder", done: true, test: "e2e/open.spec.ts" },
    { text: "Remembers it", done: false, test: null },
  ],
});
const cards = (): Card[] => PLAN.map(cardOf).map((c) => (c.id === STORY ? written(c) : c));

async function openStory() {
  const app = renderApp({ cards: { [PROJECT.dir]: cards() } });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  const row = screen.getByRole("button", { name: "Open a folder" });
  await app.user.click(row);
  const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
  await within(pane).findByRole("button", { name: `User story: ${STORY_TEXT}` });
  return { ...app, row, pane };
}
const owner = (app: { cardsIn: (dir: string) => Card[] }) =>
  app.cardsIn(PROJECT.dir).find((c) => c.id === STORY) as Card;

describe("AC1: a story opens in a docked pane beside the list", () => {
  it("opens beside the list, marks the row, and closes back to the row", async () => {
    const app = await openStory();
    expect(screen.getByRole("region", { name: "Work list" })).toBeTruthy();
    expect(app.pane.closest(".work-split")).toBe(screen.getByRole("region", { name: "Work list" }).parentElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(app.row.getAttribute("aria-expanded")).toBe("true");
    expect(app.row.getAttribute("aria-controls")).toBe(app.pane.id);
    expect(document.activeElement).toBe(app.pane);
    await app.user.click(within(app.pane).getByRole("button", { name: "Close card" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(app.row.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(app.row);
    expect(app.watchingCards()).toBe(0);
  });

  it("opens from the keyboard: Enter on the story moves focus into the pane, Escape closes it back to the row", async () => {
    const app = renderApp({ cards: { [PROJECT.dir]: cards() } });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
    const row = screen.getByRole("button", { name: "Open a folder" });
    row.focus();
    await app.user.keyboard("{Enter}");
    const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
    expect(document.activeElement).toBe(pane);
    await app.user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});

describe("AC2: the pane shows the whole card", () => {
  it("shows the user story, evidence, ACs with their proof, tasks, notes and PR", async () => {
    const { pane } = await openStory();
    const view = within(pane);
    expect(view.getByRole("button", { name: "Title: Open a folder" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Status: In Progress" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Parent: FEAT-2 · Cards and the feature list" })).toBeTruthy();
    expect(view.getByText("Saved to main")).toBeTruthy();
    const marks = within(view.getByRole("list", { name: "Evidence" }))
      .getAllByRole("listitem")
      .map((m) => m.textContent);
    expect(marks).toEqual(["Reported: no", "Verified: no", "Proven: no", "Accepted: no"]);
    const acs = within(view.getByRole("region", { name: "Acceptance criteria" }));
    expect(acs.getByText("1 of 2 done")).toBeTruthy();
    expect(acs.getByRole("button", { name: "AC 1: Opens the folder" })).toBeTruthy();
    expect(acs.getByText("Test not passed yet")).toBeTruthy();
    expect(acs.getByText("e2e/open.spec.ts")).toBeTruthy();
    expect(acs.getByText("No test yet")).toBeTruthy();
    const tasks = within(view.getByRole("region", { name: "Tasks" }));
    expect(tasks.getByText("4 of 6 done")).toBeTruthy();
    expect(tasks.getByRole("button", { name: "Task 1: item 1" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Notes: Start from the folder picker." })).toBeTruthy();
    expect(within(view.getByRole("region", { name: "PR" })).getByText("#15")).toBeTruthy();
  });
});

describe("AC3: text edits in place, saves on leaving the field, and Escape cancels", () => {
  it("saves the user story to the owner copy when the field loses focus", async () => {
    const app = await openStory();
    await app.user.click(within(app.pane).getByRole("button", { name: `User story: ${STORY_TEXT}` }));
    const field = within(app.pane).getByRole("textbox", { name: "User story" });
    await app.user.clear(field);
    await app.user.type(field, "As a builder, I pick a folder.");
    await app.user.click(app.pane);
    expect(owner(app).description).toBe("As a builder, I pick a folder.");
    expect(
      await within(app.pane).findByRole("button", { name: "User story: As a builder, I pick a folder." }),
    ).toBeTruthy();
    expect(app.actions()).toContain(`updateCard:${PROJECT.dir}:${STORY}:description`);
  });

  it("saves a one-line field on Enter; Escape cancels without saving and keeps the pane open", async () => {
    const app = await openStory();
    const ac = within(app.pane).getByRole("button", { name: "AC 2: Remembers it" });
    await app.user.click(ac);
    await app.user.type(within(app.pane).getByRole("textbox", { name: "AC 2" }), " across restarts{Enter}");
    expect(owner(app).acs[1]).toEqual({ text: "Remembers it across restarts", done: false, test: null });
    const saved = within(app.pane).getByRole("button", { name: "AC 2: Remembers it across restarts" });
    expect(document.activeElement).toBe(saved);

    await app.user.keyboard("{Enter}");
    await app.user.type(within(app.pane).getByRole("textbox", { name: "AC 2" }), " never{Escape}");
    expect(owner(app).acs[1]?.text).toBe("Remembers it across restarts");
    expect(app.actions().filter((a) => a.startsWith("updateCard"))).toHaveLength(1);
    expect(screen.getByRole("complementary", { name: `${STORY} card` })).toBeTruthy();
    expect(document.activeElement).toBe(
      within(app.pane).getByRole("button", { name: "AC 2: Remembers it across restarts" }),
    );
  });

  it("reaches each field with Tab and starts editing on Enter", async () => {
    const app = await openStory();
    await app.user.tab();
    await app.user.tab();
    expect(document.activeElement).toBe(within(app.pane).getByRole("button", { name: "Title: Open a folder" }));
    await app.user.keyboard("{Enter}");
    expect(document.activeElement).toBe(within(app.pane).getByRole("textbox", { name: "Title" }));
  });

  it("keeps what the user typed while the card changes outside, then shows the refusal and the value now", async () => {
    const app = await openStory();
    await app.user.click(within(app.pane).getByRole("button", { name: `User story: ${STORY_TEXT}` }));
    const field = within(app.pane).getByRole("textbox", { name: "User story" });
    await app.user.type(field, " Mine.");
    app.pushCard(PROJECT.dir, { ...owner(app), description: "Changed by an agent." });
    expect(field).toHaveProperty("value", `${STORY_TEXT} Mine.`);

    await app.user.click(app.pane);
    const alert = within(app.pane).getByRole("alert");
    expect(alert.textContent).toContain("Changed since you opened it.");
    expect(alert.textContent).toContain("Now: Changed by an agent.");
    expect(within(app.pane).getByRole("textbox", { name: "User story" })).toHaveProperty(
      "value",
      `${STORY_TEXT} Mine.`,
    );
    expect(owner(app).description).toBe("Changed by an agent.");

    // Saving again saves over the value the user has now seen.
    await app.user.click(within(app.pane).getByRole("textbox", { name: "User story" }));
    await app.user.click(app.pane);
    expect(owner(app).description).toBe(`${STORY_TEXT} Mine.`);
    expect(within(app.pane).queryByRole("alert")).toBeNull();
  });
});

describe("AC4: status and parent changes append a history event", () => {
  it("offers only the statuses the rules allow, and a move appends history at the owner", async () => {
    const app = await openStory();
    await app.user.click(within(app.pane).getByRole("button", { name: "Status: In Progress" }));
    const options = within(screen.getByRole("listbox", { name: "Status" }))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["New", "Ready", "In Progress", "In Review", "Acceptance", "Cancelled"]);
    await app.user.click(screen.getByRole("option", { name: "In Review" }));
    expect(owner(app).status).toBe("In Review");
    expect(owner(app).history.at(-1)).toEqual({
      at: EDIT_AT,
      field: "status",
      from: "In Progress",
      to: "In Review",
      by: "user",
    });
    expect(await within(app.pane).findByRole("button", { name: "Status: In Review" })).toBeTruthy();
  });

  it("moves the story under another feature with a history event", async () => {
    const app = await openStory();
    await app.user.click(within(app.pane).getByRole("button", { name: /^Parent: / }));
    await app.user.click(screen.getByRole("option", { name: "FEAT-3 · Burn-up" }));
    expect(owner(app).parent).toBe("FEAT-3");
    expect(owner(app).history.at(-1)).toMatchObject({ field: "parent", from: "FEAT-2", to: "FEAT-3", by: "user" });
  });
});
