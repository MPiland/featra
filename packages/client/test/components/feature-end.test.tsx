/**
 * STORY-70 (the user's side; it replaces STORY-14's Accept and Merge on the card pane): a feature's review screen offers
 * Approve, which records the user's Accept and merges the feature to main in one click. It is off with the first reason
 * beside it until every story is finished and nothing stops the merge. An Accept whose merge failed offers Merge to main
 * as the retry. Once merged, the screen says so. The feature's card pane keeps only Review, its link to that screen.
 * The real App over a fake host: the review is built by work-format's own builder and Approve rule (the PR, the checks,
 * the merge commit and main taking the cards over are proved by the server's tests).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  evidenceState,
  FEATURE_END_COPY,
  FEATURE_END_MESSAGES,
  type Card,
  type CardChecks,
  type CardPr,
  type FeatureMergeState,
  withFeatureAccepted,
} from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const ID = "FEAT-2";
const ready = () => [
  cardOf({ id: ID, type: "feature", status: "active", title: "Delegation" }),
  cardOf({ id: "STORY-5", type: "story", parent: ID, status: "Done", title: "Spawn five" }),
  cardOf({ id: "STORY-6", type: "story", parent: ID, status: "Cancelled", title: "Spawn six" }),
];
const CLEAR: FeatureMergeState = { mergeable: true, blocked: null };
type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const feature = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === ID) as Card;
const approve = (scope: HTMLElement) =>
  within(scope).queryByRole<HTMLButtonElement>("button", { name: FEATURE_END_COPY.approveOf(ID) });
const merge = (scope: HTMLElement) =>
  within(scope).queryByRole<HTMLButtonElement>("button", { name: FEATURE_END_COPY.mergeOf(ID, "main") });
const describedBy = (button: HTMLElement) => {
  const id = button.getAttribute("aria-describedby");
  return id ? document.getElementById(id)?.textContent : undefined;
};

/** The feature's review screen, opened from its Work row. */
async function openReview(cards: Card[] = ready(), host: Host = {}) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards }, ...host });
  await app.user.click(screen.getByRole("button", { name: "Work" }));
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(await screen.findByRole("button", { name: `Review ${ID}` }));
  const shown = await screen.findByRole("region", { name: `Review ${ID}` });
  return { ...app, shown };
}

/** The feature's cards with the user's Accept recorded on it (a merge that failed after Approve), by work-format's rule. */
const acceptedCards = (): Card[] =>
  ready().map((c) => (c.id === ID ? withFeatureAccepted(c, "user", "2026-11-12T10:00:00Z") : c));

describe("AC1, AC5: Approve on the review screen", () => {
  it("records the user's Accept and merges in one click, then shows the feature merged and Done", async () => {
    const app = await openReview(ready(), { cardMerges: { [ID]: CLEAR } });
    const button = await waitFor(() => approve(app.shown) as HTMLButtonElement);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Approve");
    await app.user.click(button);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`approveFeature:${PROJECT.dir}:${ID}`));
    expect(app.calls.filter((c) => c.startsWith("mergeFeature:"))).toEqual([]);
    await waitFor(() => expect(feature(app).status).toBe("done"));
    expect(evidenceState(feature(app)).accepted).toBe(true);
    const merged = await within(app.shown).findByText(FEATURE_END_COPY.merged("main"));
    expect(merged.getAttribute("role")).toBe("status");
    expect(approve(app.shown)).toBeNull();
    expect(merge(app.shown)).toBeNull();
  });

  it("says what stays to do after the merge", async () => {
    const remains = ["feature/2-delegation is checked out at /wt/f2."];
    const app = await openReview(ready(), {
      cardMerges: { [ID]: CLEAR },
      review: { approveFeature: async () => ({ ok: true, remains }) },
    });
    await app.user.click(await waitFor(() => approve(app.shown) as HTMLButtonElement));
    expect(await within(app.shown).findByText(remains[0] as string)).toBeTruthy();
  });
});

describe("AC2: Approve waits, with the reason beside it", () => {
  it("is off while a story is unfinished, with that reason first even when the merge is blocked too", async () => {
    const cards = [...ready(), cardOf({ id: "STORY-7", type: "story", parent: ID, status: "In Progress" })];
    const waiting: FeatureMergeState = { mergeable: false, blocked: FEATURE_END_MESSAGES.behind("main") };
    const { shown } = await openReview(cards, { cardMerges: { [ID]: waiting } });
    const button = await waitFor(() => approve(shown) as HTMLButtonElement);
    expect(button.disabled).toBe(true);
    expect(describedBy(button)).toBe(FEATURE_END_MESSAGES.unfinished(ID, 1));
    expect(within(shown).getByText(FEATURE_END_MESSAGES.unfinished(ID, 1))).toBeTruthy();
  });

  it("is off with the merge's reason once the stories are finished", async () => {
    const waiting: FeatureMergeState = { mergeable: false, blocked: FEATURE_END_MESSAGES.behind("main") };
    const { shown } = await openReview(ready(), { cardMerges: { [ID]: waiting } });
    const button = await waitFor(() => approve(shown) as HTMLButtonElement);
    expect(button.disabled).toBe(true);
    expect(describedBy(button)).toBe(FEATURE_END_MESSAGES.behind("main"));
  });

  it("says a PR merged on GitHub waits for Approve, which is on to finish it", async () => {
    const landed: FeatureMergeState = { ...CLEAR, landed: true };
    const { shown } = await openReview(ready(), { cardMerges: { [ID]: landed } });
    const button = await waitFor(() => approve(shown) as HTMLButtonElement);
    expect(button.disabled).toBe(false);
    expect(describedBy(button)).toBe(FEATURE_END_MESSAGES.landed);
  });

  it("waits with a reason before the server's first read of the merge", async () => {
    const { shown } = await openReview();
    const button = await waitFor(() => approve(shown) as HTMLButtonElement);
    expect(button.disabled).toBe(true);
    expect(describedBy(button)).toBe(FEATURE_END_MESSAGES.checking);
  });
});

describe("AC4: a merge that fails after the Accept", () => {
  it("says why in one sentence", async () => {
    const error = "Main moved on; the Dev Lead was asked to merge it in.";
    const { shown, user } = await openReview(ready(), {
      cardMerges: { [ID]: CLEAR },
      review: { approveFeature: async () => ({ ok: false, error }) },
    });
    await user.click(await waitFor(() => approve(shown) as HTMLButtonElement));
    expect((await within(shown).findByRole("alert")).textContent).toBe(error);
  });

  it("turns a failed Approve into Merge to main once the server records the Accept", async () => {
    const error = FEATURE_END_MESSAGES.behind("main");
    const app = await openReview(ready(), {
      cardMerges: { [ID]: CLEAR },
      review: { approveFeature: async () => ({ ok: false, error }) },
    });
    await app.user.click(await waitFor(() => approve(app.shown) as HTMLButtonElement));
    expect((await within(app.shown).findByRole("alert")).textContent).toBe(error);
    // The server records the user's Accept on the feature's branch when the merge fails, and pushes the card.
    app.pushCard(PROJECT.dir, acceptedCards()[0] as Card);
    const retry = await waitFor(() => merge(app.shown) as HTMLButtonElement);
    expect(approve(app.shown)).toBeNull();
    expect(retry.disabled).toBe(false);
    await app.user.click(retry);
    await waitFor(() => expect(app.calls).toContain(`mergeFeature:${PROJECT.dir}:${ID}`));
    expect(await within(app.shown).findByText(FEATURE_END_COPY.merged("main"))).toBeTruthy();
  });

  it("offers Merge to main as the retry once accepted, which merges with no confirmation", async () => {
    const app = await openReview(acceptedCards(), { cardMerges: { [ID]: CLEAR } });
    expect(approve(app.shown)).toBeNull();
    const button = await waitFor(() => merge(app.shown) as HTMLButtonElement);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Merge to main");
    await app.user.click(button);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`mergeFeature:${PROJECT.dir}:${ID}`));
    await waitFor(() => expect(feature(app).status).toBe("done"));
    expect(await within(app.shown).findByText(FEATURE_END_COPY.merged("main"))).toBeTruthy();
  });

  it("keeps the retry off with the merge's reason beside it", async () => {
    const waiting: FeatureMergeState = { mergeable: false, blocked: FEATURE_END_MESSAGES.behind("main") };
    const { shown } = await openReview(acceptedCards(), { cardMerges: { [ID]: waiting } });
    const button = await waitFor(() => merge(shown) as HTMLButtonElement);
    expect(button.disabled).toBe(true);
    expect(describedBy(button)).toBe(FEATURE_END_MESSAGES.behind("main"));
  });
});

/** The Work list with the feature's cards, and its card opened from its row. */
async function openCard(cards: Card[] = ready(), host: Host = {}) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards }, ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(await screen.findByRole("button", { name: `Open ${ID}` }));
  const pane = await screen.findByRole("complementary", { name: `${ID} card` });
  return { ...app, pane };
}

describe("AC3: the feature's card pane", () => {
  it("has no Accept or Merge, only Review, its link to the approval screen", async () => {
    const app = await openCard(acceptedCards(), { cardMerges: { [ID]: CLEAR } });
    const review = await within(app.pane).findByRole("button", { name: `Review ${ID}` });
    expect(within(app.pane).queryByRole("button", { name: /^Accept/ })).toBeNull();
    expect(merge(app.pane)).toBeNull();
    expect(approve(app.pane)).toBeNull();
    await app.user.click(review);
    const shown = await screen.findByRole("region", { name: `Review ${ID}` });
    expect(await waitFor(() => merge(shown) as HTMLButtonElement)).toBeTruthy();
  });

  it("can't be opened from the feature's row while a story is unfinished", async () => {
    const cards = [...ready(), cardOf({ id: "STORY-7", type: "story", parent: ID, status: "In Progress" })];
    renderApp({ cards: { [PROJECT.dir]: cards } });
    await screen.findByRole("region", { name: "Work list" });
    expect(screen.queryByRole("button", { name: `Open ${ID}` })).toBeNull();
  });

  it("Create PR opens the feature's PR, not a story's", async () => {
    const pr: CardPr = { status: null, create: true, opening: false, note: null };
    const { pane, user, calls } = await openCard(acceptedCards(), { cardPrs: { [ID]: pr } });
    const section = await within(pane).findByRole("region", { name: "PR" });
    await user.click(within(section).getByRole("button", { name: "Create PR" }));
    await waitFor(() => expect(calls).toContain(`createFeaturePr:${PROJECT.dir}:${ID}`));
    expect(calls.some((c) => c.startsWith("createPr:"))).toBe(false);
  });

  it("Re-run runs the feature's checks", async () => {
    const checks: CardChecks = { running: false, idle: null, last: null, failedAcs: [], note: null };
    const { pane, user, calls } = await openCard(acceptedCards(), { cardChecks: { [ID]: checks } });
    const section = await within(pane).findByRole("region", { name: "Checks" });
    await user.click(within(section).getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(calls).toContain(`rerunFeatureChecks:${PROJECT.dir}:${ID}`));
  });
});

describe("the review screen's PR and checks (from the screenshot review)", () => {
  const PR = "https://github.com/acme/app/pull/1";
  const withPr = () => ready().map((c) => (c.id === ID ? Object.assign(c, { pr: PR }) : c));
  const read: CardPr = { status: { state: "open", checks: "passing" }, create: false, opening: false, note: null };

  it("doesn't say no checks ran beside the PR's own checks: the PR carries them", async () => {
    const { shown } = await openReview(withPr(), { cardMerges: { [ID]: CLEAR }, cardPrs: { [ID]: read } });
    const pr = await within(shown).findByRole("region", { name: "PR" });
    expect(pr.textContent).toContain("Checks passing");
    expect(within(shown).queryByRole("region", { name: "Checks" })).toBeNull();
    expect(shown.textContent).not.toContain("No checks run yet");
  });

  it("says the PR merged once Approve merged the feature, as it says Open before", async () => {
    const app = await openReview(withPr(), { cardMerges: { [ID]: CLEAR }, cardPrs: { [ID]: read } });
    const pr = await within(app.shown).findByRole("region", { name: "PR" });
    expect(within(pr).getByText("Open")).toBeTruthy();
    await app.user.click(await waitFor(() => approve(app.shown) as HTMLButtonElement));
    await within(app.shown).findByText(FEATURE_END_COPY.merged("main"));
    const after = within(app.shown).getByRole("region", { name: "PR" });
    expect(within(after).getByText("Merged")).toBeTruthy();
    expect(within(after).queryByText("Open")).toBeNull();
  });
});
