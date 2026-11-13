/**
 * STORY-13 (the user's side): the Dev Lead's `report_bug` card, Work's New bug, the bug icon and the project bug list.
 * The real App over a fake host: the Work list is built from cards by work-format, and the server's proposal and
 * filing answers are the host's (the server's tests prove what it proposes and writes).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BUG_COPY, type BugPlacements } from "@featra/work-format/bug-copy";
import { CHAT_COPY } from "../../src/chats.ts";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const PLACEMENTS: BugPlacements = {
  proposed: "task:STORY-5",
  choices: [
    { key: "feature:FEAT-2", label: BUG_COPY.feature("FEAT-2", "Delegation") },
    { key: "task:STORY-5", label: BUG_COPY.task("STORY-5", "Spawn five") },
    { key: "project", label: BUG_COPY.project },
  ],
};
const cards = () => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "In Progress", title: "Spawn five" }),
    cardOf({ id: "BUG-3", type: "bug", parent: "FEAT-2", title: "Saves twice" }),
    cardOf({ id: "BUG-1", type: "bug", title: "Crash on start" }),
  ],
});

/** A Dev Lead chat, and the `report_bug` card its agent put in front of the user. */
async function asked() {
  const app = renderApp();
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Dev Lead/ }));
  await screen.findByRole("region", { name: "Dev Lead" });
  app.chats.emit("chat-1", {
    type: "approval",
    id: "bug-1",
    name: "report_bug",
    input: { title: "Spawn hangs", description: "It never returns.", cause: "STORY-5", ...PLACEMENTS },
    forChat: false,
    subject: 'Bug "Spawn hangs"',
  });
  const log = screen.getByRole("log", { name: CHAT_COPY.transcript });
  const card = await within(log).findByRole("group", { name: BUG_COPY.ask("Spawn hangs") });
  return { app, card };
}

describe("AC1, AC3: the Dev Lead's report_bug card", () => {
  it("shows the bug, its suspected cause and Featra's proposed place, with Create and Cancel", async () => {
    const { card } = await asked();
    expect(within(card).getByText(BUG_COPY.asked)).toBeTruthy();
    expect(within(card).getByText("It never returns.")).toBeTruthy();
    expect(within(card).getByText(BUG_COPY.causedBy("STORY-5"))).toBeTruthy();
    const place = within(card).getByRole("combobox", { name: BUG_COPY.placement }) as HTMLSelectElement;
    expect(place.value).toBe("task:STORY-5");
    expect(place.selectedOptions[0]?.textContent).toBe(`${BUG_COPY.task("STORY-5", "Spawn five")} (Proposed)`);
    expect(
      within(card)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([BUG_COPY.create, BUG_COPY.cancel]);
  });

  it("creates it where the user placed it, or cancels it", async () => {
    const { app, card } = await asked();
    await app.user.selectOptions(within(card).getByRole("combobox", { name: BUG_COPY.placement }), "project");
    await app.user.click(within(card).getByRole("button", { name: BUG_COPY.create }));
    expect(app.calls).toContain("chat.approve:chat-1:bug-1:allow:project");
    cleanup();
    const second = await asked();
    await second.app.user.click(within(second.card).getByRole("button", { name: BUG_COPY.cancel }));
    expect(second.app.calls).toContain("chat.approve:chat-1:bug-1:deny");
  });

  it("keeps the proposal when the user doesn't change it", async () => {
    const { app, card } = await asked();
    await app.user.click(within(card).getByRole("button", { name: BUG_COPY.create }));
    expect(app.calls).toContain("chat.approve:chat-1:bug-1:allow:task:STORY-5");
  });
});

/** Work, with New bug open. */
async function newBug(host: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ cards: cards(), bugPlacements: { "": PLACEMENTS }, ...host });
  const region = await screen.findByRole("region", { name: "Work list" });
  await app.user.click(within(region).getByRole("button", { name: BUG_COPY.newBug }));
  const form = await within(region).findByRole("form", { name: BUG_COPY.newBug });
  return { app, region, form };
}

describe("AC1, AC3: New bug in Work", () => {
  it("proposes a place again when the suspected cause changes, and files where the user confirmed", async () => {
    const forFeature: BugPlacements = { ...PLACEMENTS, proposed: "feature:FEAT-2" };
    const { app, region, form } = await newBug({ bugPlacements: { "": PLACEMENTS, "FEAT-2": forFeature } });
    const place = () => within(form).getByRole<HTMLSelectElement>("combobox", { name: BUG_COPY.placement });
    await waitFor(() => expect(place().value).toBe("task:STORY-5"));
    await app.user.type(within(form).getByRole("textbox", { name: BUG_COPY.title }), "Lost focus");
    await app.user.type(within(form).getByRole("textbox", { name: BUG_COPY.description }), "Tab skips the field.");
    const cause = within(form).getByRole("combobox", { name: BUG_COPY.cause });
    // Features, then each feature's stories and bugs in the Work list's order, then the project bugs.
    expect(
      within(cause)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      BUG_COPY.noCause,
      "FEAT-2 Delegation",
      "BUG-3 Saves twice",
      "STORY-5 Spawn five",
      "BUG-1 Crash on start",
    ]);
    await app.user.selectOptions(cause, "FEAT-2");
    expect(app.calls).toContain(`proposeBug:${PROJECT.dir}:FEAT-2`);
    await waitFor(() => expect(place().value).toBe("feature:FEAT-2"));
    await app.user.click(within(form).getByRole("button", { name: BUG_COPY.create }));
    expect(app.calls).toContain(
      `fileBug:${PROJECT.dir}:${JSON.stringify({ title: "Lost focus", description: "Tab skips the field.", cause: "FEAT-2" })}:feature:FEAT-2`,
    );
    expect((await within(region).findByRole("status")).textContent).toBe(BUG_COPY.filedCard("BUG-1"));
    expect(within(region).queryByRole("form", { name: BUG_COPY.newBug })).toBeNull();
  });

  it("says a task was added when the bug went on a story", async () => {
    const { app, region, form } = await newBug({ filedBug: { ok: true, kind: "task", id: "STORY-5" } });
    await app.user.type(within(form).getByRole("textbox", { name: BUG_COPY.title }), "Lost focus");
    await app.user.click(within(form).getByRole("button", { name: BUG_COPY.create }));
    expect((await within(region).findByRole("status")).textContent).toBe(BUG_COPY.filedTask("STORY-5"));
  });

  it("can't be created without a title, and shows why the server refused, keeping what was typed", async () => {
    const { app, form } = await newBug({ filedBug: { ok: false, error: "STORY-5 can't take this bug now." } });
    const create = within(form).getByRole("button", { name: BUG_COPY.create }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    const title = within(form).getByRole("textbox", { name: BUG_COPY.title }) as HTMLInputElement;
    await app.user.type(title, "Lost focus");
    await app.user.click(create);
    expect((await within(form).findByRole("alert")).textContent).toBe("STORY-5 can't take this bug now.");
    expect(title.value).toBe("Lost focus");
  });

  it("writes nothing when cancelled", async () => {
    const { app, region, form } = await newBug();
    await app.user.type(within(form).getByRole("textbox", { name: BUG_COPY.title }), "Lost focus");
    await app.user.click(within(form).getByRole("button", { name: BUG_COPY.cancel }));
    expect(within(region).queryByRole("form", { name: BUG_COPY.newBug })).toBeNull();
    expect(app.calls.some((c) => c.startsWith("fileBug:"))).toBe(false);
  });
});

/** New bug's Place it select, or null when there are no places to pick from. */
const place = (form: HTMLElement) =>
  within(form).queryByRole<HTMLSelectElement>("combobox", { name: BUG_COPY.placement });

describe("New bug's proposal and focus (STORY-13 review)", () => {
  const unread = { ok: false as const, error: "Can't read the cards." };

  it("asks for the places again with no earlier error or places left over (ruling 4)", async () => {
    const { app, form } = await newBug({ bugPlacements: { "": [unread, PLACEMENTS], "FEAT-2": unread } });
    expect((await within(form).findByRole("alert")).textContent).toBe(unread.error);
    const cause = within(form).getByRole("combobox", { name: BUG_COPY.cause });
    await app.user.selectOptions(cause, "FEAT-2");
    await app.user.selectOptions(cause, "");
    await waitFor(() => expect(place(form)?.value).toBe("task:STORY-5"));
    expect(within(form).queryByRole("alert")).toBeNull();
    // A cause the server can't place leaves no earlier places to pick from.
    await app.user.selectOptions(cause, "FEAT-2");
    expect((await within(form).findByRole("alert")).textContent).toBe(unread.error);
    expect(place(form)).toBeNull();
    expect(within(form).getByRole<HTMLButtonElement>("button", { name: BUG_COPY.create }).disabled).toBe(true);
  });

  it("asks for the places again after the server refuses one, keeping why (ruling 4)", async () => {
    const gone = "STORY-5 can't take this bug now. Pick another place.";
    const now: BugPlacements = { proposed: "project", choices: [{ key: "project", label: BUG_COPY.project }] };
    const { app, form } = await newBug({
      bugPlacements: { "": [PLACEMENTS, now] },
      filedBug: [
        { ok: false, error: gone },
        { ok: true, kind: "card", id: "BUG-1" },
      ],
    });
    await waitFor(() => expect(place(form)?.value).toBe("task:STORY-5"));
    await app.user.type(within(form).getByRole("textbox", { name: BUG_COPY.title }), "Lost focus");
    await app.user.click(within(form).getByRole("button", { name: BUG_COPY.create }));
    expect((await within(form).findByRole("alert")).textContent).toBe(gone);
    await waitFor(() => expect(place(form)?.value).toBe("project"));
    expect(app.calls.filter((c) => c === `proposeBug:${PROJECT.dir}:`)).toHaveLength(2);
    expect(within(form).getByRole("alert").textContent).toBe(gone);
    await app.user.click(within(form).getByRole("button", { name: BUG_COPY.create }));
    expect(app.calls.at(-1)).toMatch(/:project$/);
  });

  it("starts again from the proposal after Cancel, not the place picked before (ruling 4)", async () => {
    const { app, region, form } = await newBug();
    await waitFor(() => expect(place(form)?.value).toBe("task:STORY-5"));
    await app.user.selectOptions(place(form)!, "project");
    await app.user.click(within(form).getByRole("button", { name: BUG_COPY.cancel }));
    await app.user.click(within(region).getByRole("button", { name: BUG_COPY.newBug }));
    const again = await within(region).findByRole("form", { name: BUG_COPY.newBug });
    await waitFor(() => expect(place(again)?.value).toBe("task:STORY-5"));
  });

  it("returns focus to New bug after Create and after Cancel (ruling 12)", async () => {
    const { app, region, form } = await newBug();
    await app.user.type(within(form).getByRole("textbox", { name: BUG_COPY.title }), "Lost focus");
    await app.user.click(within(form).getByRole("button", { name: BUG_COPY.create }));
    const button = await within(region).findByRole("button", { name: BUG_COPY.newBug });
    await waitFor(() => expect(document.activeElement).toBe(button));
    await app.user.click(button);
    const again = await within(region).findByRole("form", { name: BUG_COPY.newBug });
    await app.user.click(within(again).getByRole("button", { name: BUG_COPY.cancel }));
    const back = await within(region).findByRole("button", { name: BUG_COPY.newBug });
    await waitFor(() => expect(document.activeElement).toBe(back));
  });
});

describe("AC4: bug icons and the project bug list", () => {
  it("lists bugs under no feature on the project bug list, each with the bug icon", async () => {
    renderApp({ cards: cards() });
    const list = await screen.findByRole("region", { name: BUG_COPY.projectBugs });
    const row = within(list).getByRole("row", { name: /Crash on start/ });
    expect(within(row).getByRole("img", { name: "Bug" })).toBeTruthy();
    expect(row.getAttribute("data-card")).toBe("BUG-1");
  });

  it("keeps a feature's bug under it, with the bug icon, and no icon on a story", async () => {
    const { user } = renderApp({ cards: cards() });
    await screen.findByRole("region", { name: "Work list" });
    await user.click(screen.getByRole("button", { name: "Delegation" }));
    const bug = await screen.findByRole("row", { name: /Saves twice/ });
    expect(within(bug).getByRole("img", { name: "Bug" })).toBeTruthy();
    const story = screen.getByRole("row", { name: /Spawn five/ });
    expect(within(story).queryByRole("img", { name: "Bug" })).toBeNull();
    const projectBugs = screen.getByRole("region", { name: BUG_COPY.projectBugs });
    expect(within(projectBugs).queryByRole("row", { name: /Saves twice/ })).toBeNull();
  });

  it("says so when the project has no bugs", async () => {
    renderApp({ cards: { [PROJECT.dir]: cards()[PROJECT.dir]!.filter((c) => c.type !== "bug") } });
    const list = await screen.findByRole("region", { name: BUG_COPY.projectBugs });
    expect(within(list).getByText(BUG_COPY.noProjectBugs)).toBeTruthy();
  });
});
