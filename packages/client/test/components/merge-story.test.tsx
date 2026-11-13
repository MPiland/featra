/**
 * STORY-12 (the user's side): Merge on a Verified story, in its Work row, its card pane and its session, and the Dev
 * Lead's `request_merge` card. The real App over a fake host: the card server applies work-format's merge rules to the
 * cards (the merge commit, the PR, the conflict and the clean-up are proved by the server's tests).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isMerged, MERGE_COPY, recordEvidence, setStatus, type Card } from "@featra/work-format";
import { CHAT_COPY } from "../../src/chats.ts";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const cards = () => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "New", title: "Spawn five", acs: [0, 1] }),
  ],
});
type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const rowOf = () => screen.getByRole("row", { name: /Spawn five/ });
const story = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5") as Card;
const merge = (scope: HTMLElement) => within(scope).queryByRole("button", { name: "Merge STORY-5" });

/** Starts the story from its row, and it reaches `status`, Verified unless asked otherwise. */
async function reviewed(host: Host = {}, status = "In Review", verified = true) {
  const app = renderApp({ cards: cards(), ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  await app.user.click(await screen.findByRole("button", { name: "Start STORY-5" }));
  await within(rowOf()).findByRole("button", { name: "Open the session of STORY-5" });
  let next = setStatus(story(app), status, "session:story-chat-1", "2026-11-12T10:00:00Z");
  if (verified) next = recordEvidence(next, "verified", "system", "2026-11-12T10:01:00Z");
  app.pushCard(PROJECT.dir, next);
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

describe("AC1: Merge on a Verified story", () => {
  it("is in its Work row, its card pane and its session, before the story is accepted", async () => {
    const app = await reviewed();
    await waitFor(() => expect(merge(rowOf())).toBeTruthy());
    expect(within(rowOf()).queryByRole("button", { name: "Accept STORY-5" })).toBeNull();
    expect(merge(await openPane(app))).toBeTruthy();
    expect(merge(await openSession(app))).toBeTruthy();
  });

  it("is beside Accept for a Verified story in Acceptance", async () => {
    await reviewed({}, "Acceptance");
    await waitFor(() => expect(merge(rowOf())).toBeTruthy());
    expect(within(rowOf()).getByRole("button", { name: "Accept STORY-5" })).toBeTruthy();
  });

  it("is not offered on a story that isn't Verified, or isn't in review", async () => {
    const app = await reviewed({}, "In Review", false);
    await within(rowOf()).findByText("In Review");
    expect(merge(rowOf())).toBeNull();
    expect(merge(await openPane(app))).toBeNull();
    cleanup();
    await reviewed({}, "In Progress", true);
    await within(rowOf()).findByText("In Progress");
    expect(merge(rowOf())).toBeNull();
  });
});

describe("Merging (AC2, AC5)", () => {
  it("merges with no confirmation; the row then says Merged and offers neither Merge nor Resume", async () => {
    const app = await reviewed();
    await app.user.click(await within(rowOf()).findByRole("button", { name: "Merge STORY-5" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`mergeStory:${PROJECT.dir}:STORY-5`));
    expect(isMerged(story(app))).toBe(true);
    await within(rowOf()).findByText(`· ${MERGE_COPY.merged}`, { exact: false });
    expect(merge(rowOf())).toBeNull();
    expect(within(rowOf()).queryByRole("button", { name: "Resume STORY-5" })).toBeNull();
    // Status after the merge is unchanged.
    expect(story(app).status).toBe("In Review");
  });

  it("says what a merge left behind in place of the button", async () => {
    const remains = ["The worktree /wt/story-5 is still there."];
    const app = await reviewed({ review: { mergeStory: async () => ({ ok: true, remains }) } });
    const session = await openSession(app);
    await app.user.click(await within(session).findByRole("button", { name: "Merge STORY-5" }));
    expect((await within(session).findByRole("status")).textContent).toBe(remains[0]);
  });

  it("shows a refusal or conflict in one sentence and keeps the button (AC4)", async () => {
    const conflict =
      "Nothing was merged: work.txt conflict. STORY-5 is back in In Progress, and its session has the files.";
    const app = await reviewed({ review: { mergeStory: async () => ({ ok: false, error: conflict }) } });
    const pane = await openPane(app);
    await app.user.click(await within(pane).findByRole("button", { name: "Merge STORY-5" }));
    expect((await within(pane).findByRole("alert")).textContent).toBe(conflict);
    expect((merge(pane) as HTMLButtonElement).disabled).toBe(false);
  });
});

/** A Dev Lead chat, and the `request_merge` card its agent put in front of the user. */
async function asked() {
  const app = renderApp();
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Dev Lead/ }));
  await screen.findByRole("region", { name: "Dev Lead" });
  app.chats.emit("chat-1", {
    type: "approval",
    id: "merge-1",
    name: "request_merge",
    input: { story: "STORY-5", into: "feature/2-delegation" },
    forChat: false,
    story: "STORY-5",
  });
  const log = screen.getByRole("log", { name: CHAT_COPY.transcript });
  const card = await within(log).findByRole("group", { name: MERGE_COPY.ask("STORY-5", "feature/2-delegation") });
  return { app, card };
}

describe("AC3: the Dev Lead's request_merge card", () => {
  it("asks the user to merge the story into its feature, with Merge and Decline only", async () => {
    const { card } = await asked();
    expect(within(card).getByText(MERGE_COPY.asked)).toBeTruthy();
    expect(
      within(card)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([MERGE_COPY.merge, MERGE_COPY.decline]);
  });

  it("approves with Merge and declines with Decline", async () => {
    const { app, card } = await asked();
    await app.user.click(within(card).getByRole("button", { name: MERGE_COPY.merge }));
    expect(app.calls).toContain("chat.approve:chat-1:merge-1:allow");
    cleanup();
    const second = await asked();
    await second.app.user.click(within(second.card).getByRole("button", { name: MERGE_COPY.decline }));
    expect(second.app.calls).toContain("chat.approve:chat-1:merge-1:deny");
  });
});
