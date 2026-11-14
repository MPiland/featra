/**
 * STORY-24: where focus goes when the feature progress pane, or a card opened from it, closes; and the feature row's
 * button closing the pane it opened. The real App over a fake host, as in feature-progress.test.tsx.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../harness.tsx";
import { cards, findPane, fromWork, pane, startChat } from "../progress-fixtures.tsx";

afterEach(cleanup);

describe("a feature row's progress button", () => {
  it("closes the pane on a second click, as the chat's button does", async () => {
    const app = renderApp({ cards: cards(null) });
    await fromWork(app);
    const button = screen.getByRole("button", { name: "Feature progress of FEAT-2" });
    await app.user.click(button);
    expect(pane()).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });
});

describe("closing a card opened from the progress pane", () => {
  it("in a chat, puts focus back on Feature progress", async () => {
    const app = await startChat({ cards: cards() });
    await app.user.click(await screen.findByRole("button", { name: "Feature progress" }));
    const found = await findPane();
    await app.user.click(within(found).getByRole("button", { name: "STORY-6 Report back" }));
    const card = await screen.findByRole("complementary", { name: "STORY-6 card" });
    expect(document.activeElement).toBe(card);
    await app.user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "STORY-6 card" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Feature progress" })));
  });

  it("in Work, puts focus on the feature's progress button when the story's row is collapsed", async () => {
    const app = renderApp({ cards: cards(null) });
    const found = await fromWork(app);
    // The feature row is collapsed: its stories have no rows to take focus back.
    expect(screen.queryByRole("row", { name: /Report back/ })).toBeNull();
    await app.user.click(within(found).getByRole("button", { name: "STORY-6 Report back" }));
    await screen.findByRole("complementary", { name: "STORY-6 card" });
    await app.user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "STORY-6 card" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Feature progress of FEAT-2" }));
  });
});
