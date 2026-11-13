/**
 * STORY-58 (the user's side): Abandon in a story's card pane. The real App over a fake host whose card server applies
 * work-format's abandon rules to the cards; the session, the PR and git are proved by the server's tests.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ABANDON_COPY, ABANDON_MESSAGES, CANCELLED, type AbandonWarning } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const cards = (status = "In Progress") => ({
  [PROJECT.dir]: [
    cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
    cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status, title: "Spawn five", acs: [0, 1] }),
  ],
});

const RISKY: AbandonWarning = {
  files: ["notes.txt"],
  unpushed: ["abc1234 Add a"],
  pr: "https://github.com/o/r/pull/12",
  branch: "featra/story-5-x",
  remotes: ["origin"],
  token: "t1",
};

const story = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === "STORY-5");
const abandonButton = (pane: HTMLElement) => within(pane).queryByRole("button", { name: "Abandon STORY-5" });

async function openPane(host: Host = {}, status?: string) {
  const app = renderApp({ cards: cards(status), ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  await app.user.click(screen.getByRole("button", { name: "Spawn five" }));
  return { app, pane: await screen.findByRole("complementary", { name: "STORY-5 card" }) };
}

async function ask(host: Host = {}) {
  const opened = await openPane(host);
  await opened.app.user.click(abandonButton(opened.pane)!);
  const dialog = await screen.findByRole("alertdialog", { name: ABANDON_COPY.abandon });
  return { ...opened, dialog };
}

describe("the warning (AC1)", () => {
  it("names what would be lost and asks to confirm, focus on Cancel", async () => {
    const { app, dialog } = await ask({ review: { abandonCheck: async () => ({ ok: true, warning: RISKY }) } });
    expect(app.calls).toContain(`abandonCheck:${PROJECT.dir}:STORY-5`);
    expect(within(dialog).getByText(ABANDON_COPY.ask("STORY-5"))).toBeTruthy();
    expect(within(dialog).getByText(ABANDON_COPY.loses)).toBeTruthy();
    const risks = within(dialog)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(risks).toEqual(["1 uncommitted file: notes.txt", "1 commit not pushed: abc1234 Add a", "PR #12 is closed"]);
    expect(within(dialog).getByText(ABANDON_COPY.removes("featra/story-5-x", ["origin"]))).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: ABANDON_COPY.cancel }));
  });

  it("is a plain question when nothing would be lost; Escape closes it, focus back on Abandon", async () => {
    const { app, pane, dialog } = await ask();
    expect(within(dialog).queryByText(ABANDON_COPY.loses)).toBeNull();
    await app.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(abandonButton(pane)));
    expect(app.calls.some((c) => c.startsWith("abandonStory"))).toBe(false);
  });

  it("isn't offered on a done story", async () => {
    const { pane } = await openPane({}, "Done");
    expect(abandonButton(pane)).toBeNull();
  });
});

describe("the choice (AC2)", () => {
  it("keeps the card as Cancelled with the warning's token, and says what stayed", async () => {
    const { app, dialog } = await ask({ review: { abandonCheck: async () => ({ ok: true, warning: RISKY }) } });
    await app.user.click(within(dialog).getByRole("button", { name: ABANDON_COPY.keep }));
    await waitFor(() => expect(app.calls).toContain(`abandonStory:${PROJECT.dir}:STORY-5:true:t1`));
    await waitFor(() => expect(story(app)?.status).toBe(CANCELLED));
    expect(story(app)?.history.at(-1)).toMatchObject({ to: CANCELLED, by: "user" });
  });

  it("discards the card and closes its pane", async () => {
    const { app, dialog } = await ask();
    await app.user.click(within(dialog).getByRole("button", { name: ABANDON_COPY.discard }));
    await waitFor(() => expect(story(app)).toBeUndefined());
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "STORY-5 card" })).toBeNull());
  });

  it("shows what couldn't be removed after keeping it", async () => {
    const note = "The remote branch featra/story-5-x has commits that aren't here, so it's still there.";
    const { dialog, pane, app } = await ask({ review: { abandonStory: async () => ({ ok: true, remains: [note] }) } });
    await app.user.click(within(dialog).getByRole("button", { name: ABANDON_COPY.keep }));
    expect((await within(pane).findByRole("status")).textContent).toBe(note);
  });

  it("says why it was refused, and puts focus back on Abandon", async () => {
    const why = ABANDON_MESSAGES.changed("STORY-5");
    const { app, pane, dialog } = await ask({ review: { abandonStory: async () => ({ ok: false, error: why }) } });
    await app.user.click(within(dialog).getByRole("button", { name: ABANDON_COPY.discard }));
    expect((await within(pane).findByRole("alert")).textContent).toBe(why);
    await waitFor(() => expect(document.activeElement).toBe(abandonButton(pane)));
    expect(story(app)?.status).toBe("In Progress");
  });
});
