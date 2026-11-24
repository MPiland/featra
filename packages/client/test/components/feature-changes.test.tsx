/**
 * STORY-71 (the user's side): "Not yet" beside Approve on a feature's review screen takes a reason, and the screen shows
 * "Changes asked" with it until the Dev Lead marks the changes handled (its reply shows) or the user dismisses them.
 * Approve stays as it was throughout. The real App over a fake host: the history and what the screen reads from it are
 * work-format's own rules; sending the reason to the Dev Lead's chat and the MCP call are proved by the server's tests.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHANGES_COPY,
  CHANGES_REFUSALS,
  changesOf,
  FEATURE_END_COPY,
  recordChangesAsked,
  recordChangesHandled,
  type Card,
  type FeatureMergeState,
} from "@featra/work-format";
import { EDIT_AT, PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const ID = "FEAT-2";
const AT = "2026-11-12T10:00:00Z";
const ready = (feature?: (c: Card) => Card) => [
  ((c: Card) => (feature ? feature(c) : c))(cardOf({ id: ID, type: "feature", status: "active", title: "Delegation" })),
  cardOf({ id: "STORY-5", type: "story", parent: ID, status: "Done", title: "Spawn five" }),
];
const CLEAR: FeatureMergeState = { mergeable: true, blocked: null };
type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const feature = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === ID) as Card;
const approve = (scope: HTMLElement) =>
  within(scope).getByRole<HTMLButtonElement>("button", { name: FEATURE_END_COPY.approveOf(ID) });
const asked = (scope: HTMLElement) => within(scope).queryByRole("region", { name: CHANGES_COPY.asked });

/** The feature's review screen, opened from its Work row, with nothing stopping Approve. */
async function openReview(cards: Card[] = ready(), host: Host = {}) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards }, cardMerges: { [ID]: CLEAR }, ...host });
  await app.user.click(screen.getByRole("button", { name: "Work" }));
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(await screen.findByRole("button", { name: `Review ${ID}` }));
  const shown = await screen.findByRole("region", { name: `Review ${ID}` });
  await waitFor(() => approve(shown));
  return { ...app, shown };
}

/** Opens "Not yet" and types `text` as the reason. */
async function notYet(app: App & { shown: HTMLElement }, text: string) {
  await app.user.click(within(app.shown).getByRole("button", { name: CHANGES_COPY.notYet }));
  const form = await within(app.shown).findByRole("form", { name: CHANGES_COPY.notYet });
  if (text) await app.user.type(within(form).getByRole("textbox", { name: CHANGES_COPY.reason }), text);
  return form;
}

describe("AC1, AC2: Not yet takes a reason, and the screen shows Changes asked with it", () => {
  it("sits beside Approve and can't be sent without a reason", async () => {
    const app = await openReview();
    const form = await notYet(app, "   ");
    const send = within(form).getByRole<HTMLButtonElement>("button", { name: CHANGES_COPY.send });
    expect(send.disabled).toBe(true);
    await app.user.type(within(form).getByRole("textbox", { name: CHANGES_COPY.reason }), "{Enter}");
    expect(app.calls.some((c) => c.startsWith("askChanges:"))).toBe(false);
    expect(changesOf(feature(app))).toBeNull();
  });

  it("sends the reason, logs it in the feature's history, and shows Changes asked with it", async () => {
    const app = await openReview();
    const form = await notYet(app, "Rename Save to Keep.");
    await app.user.click(within(form).getByRole("button", { name: CHANGES_COPY.send }));
    expect(app.calls).toContain(`askChanges:${PROJECT.dir}:${ID}:Rename Save to Keep.`);
    const section = await waitFor(() => asked(app.shown) as HTMLElement);
    expect(within(section).getByRole("status").textContent).toBe(CHANGES_COPY.asked);
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Rename Save to Keep."]);
    expect(feature(app).history.at(-1)).toMatchObject({
      field: "changes-asked",
      to: "Rename Save to Keep.",
      by: "user",
    });
    expect(within(app.shown).queryByRole("form", { name: CHANGES_COPY.notYet })).toBeNull();
  });

  it("lists every reason asked in the round", async () => {
    const app = await openReview(ready((c) => recordChangesAsked(c, "First.", "user", AT)));
    const form = await notYet(app, "Second.");
    await app.user.click(within(form).getByRole("button", { name: CHANGES_COPY.send }));
    await waitFor(() =>
      expect(
        within(asked(app.shown) as HTMLElement)
          .getAllByRole("listitem")
          .map((li) => li.textContent),
      ).toEqual(["First.", "Second."]),
    );
  });

  it("shows the server's refusal with the reason kept, and logs nothing", async () => {
    const app = await openReview(ready(), { askChangesRefusal: CHANGES_REFUSALS.noLead });
    const form = await notYet(app, "Rename it.");
    await app.user.click(within(form).getByRole("button", { name: CHANGES_COPY.send }));
    expect((await within(form).findByRole("alert")).textContent).toBe(CHANGES_REFUSALS.noLead);
    expect(within(form).getByRole<HTMLTextAreaElement>("textbox", { name: CHANGES_COPY.reason }).value).toBe(
      "Rename it.",
    );
    expect(asked(app.shown)).toBeNull();
  });
});

describe("AC3: the Dev Lead's reply", () => {
  it("shows the reply once the Dev Lead marks the changes handled, and Changes asked clears", async () => {
    const app = await openReview(ready((c) => recordChangesAsked(c, "Rename Save to Keep.", "user", AT)));
    await waitFor(() => expect(asked(app.shown)).not.toBeNull());
    app.pushCard(PROJECT.dir, recordChangesHandled(feature(app), "Renamed it to Keep.", "session:chat-1", EDIT_AT));
    const made = await within(app.shown).findByRole("region", { name: CHANGES_COPY.handled });
    expect(within(made).getByText("Renamed it to Keep.")).toBeTruthy();
    expect(within(made).getByText(CHANGES_COPY.byLead)).toBeTruthy();
    expect(asked(app.shown)).toBeNull();
    expect(within(app.shown).queryByRole("status", { name: CHANGES_COPY.asked })).toBeNull();
  });
});

describe("AC4: Dismiss", () => {
  it("clears Changes asked and logs the Dismiss", async () => {
    const app = await openReview(ready((c) => recordChangesAsked(c, "Rename Save to Keep.", "user", AT)));
    const section = await waitFor(() => asked(app.shown) as HTMLElement);
    await app.user.click(within(section).getByRole("button", { name: CHANGES_COPY.dismiss }));
    await waitFor(() => expect(asked(app.shown)).toBeNull());
    expect(app.calls).toContain(`dismissChanges:${PROJECT.dir}:${ID}`);
    expect(feature(app).history.at(-1)).toMatchObject({ field: "changes-dismissed", by: "user" });
    expect(changesOf(feature(app))).toBeNull();
  });
});

describe("AC5: Approve stays available while changes are asked", () => {
  it("leaves Approve enabled beside Changes asked, and approving still works", async () => {
    const app = await openReview(ready((c) => recordChangesAsked(c, "Rename Save to Keep.", "user", AT)));
    await waitFor(() => expect(asked(app.shown)).not.toBeNull());
    const button = approve(app.shown);
    expect(button.disabled).toBe(false);
    await app.user.click(button);
    await waitFor(() => expect(feature(app).status).toBe("done"));
  });
});
