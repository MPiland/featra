/**
 * STORY-60 AC4 (the user's side): a story that didn't merge on its own says so, and why, in its card pane and its
 * session. The real App over a fake host, whose card server builds the card view and the Work list with work-format's
 * own rules from the card's history (the server's tests prove what writes that history).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { checkedEvent, MERGE_COPY, notMergedStory, recordEvidence, setStatus, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const WHY = "Couldn't merge the PR: the base branch policy prohibits the merge.";
const cards = () => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "New", title: "Spawn five", acs: [0, 1] }),
  ],
});
type App = ReturnType<typeof renderApp>;

const rowOf = () => screen.getByRole("row", { name: /Spawn five/ });
const story = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5") as Card;
const shown = (scope: HTMLElement) => within(scope).queryByText(MERGE_COPY.notMerged(WHY));

/** The story started from its row, in review and Verified, and then refused when it tried to merge on its own. */
async function refused() {
  const app = renderApp({ cards: cards() });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  await app.user.click(await screen.findByRole("button", { name: "Start STORY-5" }));
  await within(rowOf()).findByRole("button", { name: "Open the session of STORY-5" });
  let next = setStatus(story(app), "In Review", "session:story-chat-1", "2026-11-16T10:00:00Z");
  next = recordEvidence(next, checkedEvent("abc123"), "system", "2026-11-16T10:01:00Z");
  next = recordEvidence(next, "verified", "system", "2026-11-16T10:01:00Z");
  app.pushCard(PROJECT.dir, notMergedStory(next, "abc123", WHY, "system", "2026-11-16T10:02:00Z"));
  return app;
}

const openPane = async (app: App) => {
  await app.user.click(within(rowOf()).getByRole("button", { name: "Spawn five" }));
  return screen.findByRole("complementary", { name: "STORY-5 card" });
};
const openSession = async (app: App) => {
  await app.user.click(within(rowOf()).getByRole("button", { name: "Open the session of STORY-5" }));
  return screen.findByRole("region", { name: "Developer" });
};

describe("STORY-60 AC4: the card and the session say the merge on its own didn't happen, and why", () => {
  it("shows why in the story's card pane, and keeps Merge for the user", async () => {
    const app = await refused();
    const pane = await openPane(app);
    await waitFor(() => expect(shown(pane)).toBeTruthy());
    expect(within(pane).getByRole("button", { name: "Merge STORY-5" })).toBeTruthy();
  });

  it("shows why in the story's session", async () => {
    const app = await refused();
    const session = await openSession(app);
    await waitFor(() => expect(shown(session)).toBeTruthy());
  });

  it("stops showing it once the story's checks settle on another commit", async () => {
    const app = await refused();
    const pane = await openPane(app);
    await waitFor(() => expect(shown(pane)).toBeTruthy());
    app.pushCard(PROJECT.dir, recordEvidence(story(app), checkedEvent("def456"), "system", "2026-11-16T10:03:00Z"));
    await waitFor(() => expect(shown(pane)).toBeNull());
  });
});
