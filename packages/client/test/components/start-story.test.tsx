/**
 * STORY-9 AC4 and AC5 (the user's side): Start on a story row and in its card pane, what the row then shows (agent,
 * model, a link to the session), Queued, a refusal in one sentence, and where the session sits in the sidebar. The real
 * App over a fake host: the card server applies work-format's rules for starting a story and the chat server lists the
 * session as the server does; the worktree, the git and the queue are proved against real code by the server's tests.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const cards = (feature = "active", story = "New") => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: feature, title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: story, title: "Spawn five" }),
  ],
});

type Host = Parameters<typeof renderApp>[0];
async function opened(host: Host = {}) {
  const app = renderApp({ cards: cards(), ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  return app;
}
const startButton = () => screen.findByRole<HTMLButtonElement>("button", { name: "Start STORY-5" });

describe("AC4: Start on a story row", () => {
  it("starts the story with no confirmation, and the row then shows its agent, model and a link that opens the session", async () => {
    const app = await opened();
    await app.user.click(await startButton());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`startStory:${PROJECT.dir}:STORY-5`));
    const row = screen.getByRole("row", { name: /Spawn five/ });
    await waitFor(() => expect(within(row).getByText(/developer · opus/)).toBeTruthy());
    expect(within(row).queryByRole("button", { name: "Start STORY-5" })).toBeNull();
    await app.user.click(await within(row).findByRole("button", { name: "Open the session of STORY-5" }));
    await screen.findByRole("textbox", { name: "Message" });
  });

  it("is a button of the keyboard's, in the row of a Ready story too", async () => {
    const app = await opened({ cards: cards("active", "Ready") });
    (await startButton()).focus();
    await app.user.keyboard("{Enter}");
    await waitFor(() => expect(app.calls).toContain(`startStory:${PROJECT.dir}:STORY-5`));
  });

  it("is in the story's card pane as well", async () => {
    const app = await opened();
    await app.user.click(screen.getByRole("button", { name: "Spawn five" }));
    const pane = await screen.findByRole("complementary", { name: "STORY-5 card" });
    await app.user.click(await within(pane).findByRole("button", { name: "Start STORY-5" }));
    await waitFor(() => expect(app.calls).toContain(`startStory:${PROJECT.dir}:STORY-5`));
    await waitFor(() => expect(within(pane).queryByRole("button", { name: "Start STORY-5" })).toBeNull());
  });

  it("is not offered on a story already started, or on a story of a feature that isn't started", async () => {
    for (const [feature, story] of [
      ["active", "In Progress"],
      ["approved", "New"],
    ] as const) {
      renderApp({ cards: cards(feature, story) });
      await screen.findByRole("region", { name: "Work list" });
      screen.getByRole("button", { name: "Delegation" }).click();
      await screen.findByRole("button", { name: "Spawn five" });
      expect(screen.queryByRole("button", { name: "Start STORY-5" })).toBeNull();
      cleanup();
    }
  });

  it("shows the server's refusal in one sentence under the button and keeps the button", async () => {
    const app = await opened({
      review: { startStory: async () => ({ ok: false, error: "FEAT-2 isn't started yet. Start it first." }) },
    });
    await app.user.click(await startButton());
    expect((await screen.findByRole("alert")).textContent).toBe("FEAT-2 isn't started yet. Start it first.");
    expect((await startButton()).disabled).toBe(false);
  });
});

describe("AC4 and AC5: where the session is, and Queued", () => {
  it("nests the session in the sidebar under the Dev Lead's chat", async () => {
    const app = await opened();
    await app.chats.bridge.start(PROJECT.dir, "dev-lead");
    await app.user.click(await startButton());
    const children = await screen.findByRole("list", { name: /^Story sessions of / });
    expect(within(children).getByRole("button", { name: /STORY-5 Spawn five/ })).toBeTruthy();
  });

  it("puts the session under a group named after the feature when no Dev Lead chat is listed", async () => {
    const app = await opened();
    await app.user.click(await startButton());
    const group = await screen.findByRole("group", { name: "Delegation" });
    expect(within(group).getByRole("button", { name: /STORY-5 Spawn five/ })).toBeTruthy();
  });

  it("says Queued on the row and in the sidebar when the project is at its limit, and offers no Start", async () => {
    const app = await opened({ queueStories: true });
    await app.user.click(await startButton());
    const row = screen.getByRole("row", { name: /Spawn five/ });
    await waitFor(() => expect(within(row).getByText("Queued")).toBeTruthy());
    expect(within(row).queryByRole("button", { name: "Start STORY-5" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "Delegation" })).getByText("Queued")).toBeTruthy();
  });
});
