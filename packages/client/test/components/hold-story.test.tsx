/**
 * STORY-61 (the user's side): Hold on a story, in its Work row and its card pane, and the Held mark. The real App over a
 * fake host: the card server applies work-format's hold rules to the cards (the lane, the owner copy and auto-merge
 * passing it by are proved by the server's tests).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isHeld, MERGE_COPY, mergedStory, recordEvidence, setStatus, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const cards = (status = "In Review") => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status, title: "Spawn five", acs: [0, 1] }),
  ],
});
type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const rowOf = () => screen.getByRole("row", { name: /Spawn five/ });
const story = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5") as Card;
const hold = (scope: HTMLElement) => within(scope).queryByRole("button", { name: MERGE_COPY.holdOf("STORY-5") });
const pressed = (scope: HTMLElement) => hold(scope)?.getAttribute("aria-pressed");

/** STORY-5 started from its row, so its card is in its worktree: Hold applies to a started story. */
async function shown(host: Host = {}) {
  const app = renderApp({ cards: cards("New"), ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  expect(hold(rowOf())).toBeNull();
  await app.user.click(await screen.findByRole("button", { name: "Start STORY-5" }));
  await within(rowOf()).findByRole("button", { name: "Open the session of STORY-5" });
  await waitFor(() => expect(hold(rowOf())).toBeTruthy());
  return app;
}
const openPane = async (app: App) => {
  await app.user.click(within(rowOf()).getByRole("button", { name: "Spawn five" }));
  return screen.findByRole("complementary", { name: "STORY-5 card" });
};

describe("STORY-61 AC1: Hold is a toggle on a story in its Work row and its card pane", () => {
  it("holds from the row with no confirmation, and the user's every turn is in the card's history", async () => {
    const app = await shown();
    expect(pressed(rowOf())).toBe("false");
    await app.user.click(hold(rowOf()) as HTMLElement);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`holdStory:${PROJECT.dir}:STORY-5:true`));
    await waitFor(() => expect(pressed(rowOf())).toBe("true"));
    expect(isHeld(story(app))).toBe(true);
    await app.user.click(hold(rowOf()) as HTMLElement);
    await waitFor(() => expect(pressed(rowOf())).toBe("false"));
    expect(
      story(app)
        .history.filter((e) => e.field === "held")
        .map((e) => [e.to, e.by]),
    ).toEqual([
      ["held", "user"],
      [null, "user"],
    ]);
  });

  it("toggles from the card pane too, which shows it pressed while held", async () => {
    const app = await shown();
    const pane = await openPane(app);
    await app.user.click(hold(pane) as HTMLElement);
    await waitFor(() => expect(pressed(pane)).toBe("true"));
    expect(app.calls).toContain(`holdStory:${PROJECT.dir}:STORY-5:true`);
    await app.user.click(hold(pane) as HTMLElement);
    await waitFor(() => expect(pressed(pane)).toBe("false"));
    expect(app.calls).toContain(`holdStory:${PROJECT.dir}:STORY-5:false`);
  });

  it("isn't offered on a story not started yet, which can't merge", async () => {
    const app = renderApp({ cards: cards() });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Delegation" }));
    await within(rowOf()).findByText("In Review");
    expect(hold(rowOf())).toBeNull();
  });

  it("isn't offered on a merged story", async () => {
    const app = await shown();
    app.pushCard(PROJECT.dir, mergedStory(story(app), "feature/2-delegation", "system", "2026-11-12T10:00:00Z"));
    await within(rowOf()).findByText(`· ${MERGE_COPY.merged}`, { exact: false });
    expect(hold(rowOf())).toBeNull();
  });

  it("shows a refusal in one sentence and keeps the toggle", async () => {
    const error = "Auto-merge is off for this project.";
    const app = await shown({ review: { holdStory: async () => ({ ok: false, error }) } });
    const pane = await openPane(app);
    await app.user.click(hold(pane) as HTMLElement);
    expect((await within(pane).findByRole("alert")).textContent).toBe(error);
    expect((hold(pane) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("STORY-61 AC2: Merge still works on a held story", () => {
  it("offers Merge beside Hold on a held, Verified story, and merges it", async () => {
    const app = await shown();
    await app.user.click(hold(rowOf()) as HTMLElement);
    await waitFor(() => expect(pressed(rowOf())).toBe("true"));
    const next = setStatus(story(app), "In Review", "session:story-chat-1", "2026-11-12T10:00:00Z");
    app.pushCard(PROJECT.dir, recordEvidence(next, "verified", "system", "2026-11-12T10:01:00Z"));
    await app.user.click(await within(rowOf()).findByRole("button", { name: "Merge STORY-5" }));
    await within(rowOf()).findByText(`· ${MERGE_COPY.merged}`, { exact: false });
  });
});

describe("STORY-61 AC4: a held story is easy to spot on its row", () => {
  it("says Held on the row while held, and not once let go", async () => {
    const app = await shown();
    expect(within(rowOf()).queryByText(`· ${MERGE_COPY.held}`, { exact: false })).toBeNull();
    await app.user.click(hold(rowOf()) as HTMLElement);
    await within(rowOf()).findByText(`· ${MERGE_COPY.held}`, { exact: false });
    await app.user.click(hold(rowOf()) as HTMLElement);
    await waitFor(() => expect(within(rowOf()).queryByText(`· ${MERGE_COPY.held}`, { exact: false })).toBeNull());
  });
});

describe("FEAT-8 design review: Held is the row's mark only", () => {
  it("shows Hold pressed in the card pane with no Held mark there", async () => {
    const app = await shown();
    await app.user.click(hold(rowOf()) as HTMLElement);
    await within(rowOf()).findByText(`· ${MERGE_COPY.held}`, { exact: false });
    const pane = await openPane(app);
    await waitFor(() => expect(pressed(pane)).toBe("true"));
    expect(within(pane).queryByText(`· ${MERGE_COPY.held}`, { exact: false })).toBeNull();
  });
});
