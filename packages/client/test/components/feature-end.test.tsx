/**
 * STORY-14 (the user's side): a feature's card offers Accept once every story under it is finished, then Merge to main,
 * off with the reason beside it until the server finds nothing stops it; its checks and Create PR act on the feature.
 * The real App over a fake host: the card server applies work-format's Accept rule and makes the feature Done on merge
 * (the PR, the checks, the merge commit and main taking the cards over are proved by the server's tests).
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
type Host = Parameters<typeof renderApp>[0];
type App = ReturnType<typeof renderApp>;

const feature = (app: App) => app.cardsIn(PROJECT.dir).find((c) => c.id === ID) as Card;
const accept = (scope: HTMLElement) => within(scope).queryByRole("button", { name: FEATURE_END_COPY.acceptOf(ID) });
const merge = (scope: HTMLElement) =>
  within(scope).queryByRole<HTMLButtonElement>("button", { name: FEATURE_END_COPY.mergeOf(ID, "main") });

/** The Work list with the feature's cards, and its card opened from its row. */
async function openFeature(cards: Card[] = ready(), host: Host = {}) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards }, ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(await screen.findByRole("button", { name: `Open ${ID}` }));
  const pane = await screen.findByRole("complementary", { name: `${ID} card` });
  return { ...app, pane };
}

/** The feature's cards with the user's Accept recorded on it, by work-format's rule. */
const acceptedCards = (): Card[] =>
  ready().map((c) => (c.id === ID ? withFeatureAccepted(c, "user", "2026-11-12T10:00:00Z") : c));

describe("AC1: Accept on a feature", () => {
  it("is on its card once every story under it is Done or Cancelled, and records the user's Accept", async () => {
    const app = await openFeature();
    const { pane } = app;
    const button = await waitFor(() => accept(pane) as HTMLElement);
    expect(merge(pane)).toBeNull();
    await app.user.click(button);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(app.calls).toContain(`acceptFeature:${PROJECT.dir}:${ID}`));
    expect(evidenceState(feature(app)).accepted).toBe(true);
    await waitFor(() => expect(accept(pane)).toBeNull());
    expect(merge(pane)).toBeTruthy();
  });

  it("isn't offered, and the feature's card can't be opened from its row, while a story is unfinished", async () => {
    const cards = [...ready(), cardOf({ id: "STORY-7", type: "story", parent: ID, status: "In Progress" })];
    renderApp({ cards: { [PROJECT.dir]: cards } });
    await screen.findByRole("region", { name: "Work list" });
    expect(screen.queryByRole("button", { name: `Open ${ID}` })).toBeNull();
  });

  it("shows a refusal in one sentence", async () => {
    const error = FEATURE_END_MESSAGES.unfinished(ID, 1);
    const { pane, user } = await openFeature(ready(), {
      review: { acceptFeature: async () => ({ ok: false, error }) },
    });
    await user.click(await waitFor(() => accept(pane) as HTMLElement));
    expect((await within(pane).findByRole("alert")).textContent).toBe(error);
  });
});

describe("AC3, AC4: Merge to main", () => {
  it("is off with the reason beside it until the server finds nothing stops it", async () => {
    const waiting: FeatureMergeState = { mergeable: false, blocked: FEATURE_END_MESSAGES.behind("main") };
    const { pane } = await openFeature(acceptedCards(), { cardMerges: { [ID]: waiting } });
    const button = await waitFor(() => merge(pane) as HTMLButtonElement);
    expect(button.disabled).toBe(true);
    expect(within(pane).getByText(FEATURE_END_MESSAGES.behind("main"))).toBeTruthy();
    // The reason is the disabled button's description too (review nit).
    const described = button.getAttribute("aria-describedby");
    expect(described && document.getElementById(described)?.textContent).toBe(FEATURE_END_MESSAGES.behind("main"));
  });

  it("waits with a reason before the server's first read of it", async () => {
    const { pane } = await openFeature(acceptedCards());
    const button = await waitFor(() => merge(pane) as HTMLButtonElement);
    expect(button.disabled).toBe(true);
    expect(within(pane).getByText(FEATURE_END_MESSAGES.checking)).toBeTruthy();
  });

  it("merges with no confirmation once on, the feature is Done, and what stays to do is said (AC5)", async () => {
    const remains = ["feature/2-delegation is checked out at /wt/f2."];
    const { pane, user, calls } = await openFeature(acceptedCards(), {
      cardMerges: { [ID]: { mergeable: true, blocked: null } },
      review: { mergeFeature: async () => ({ ok: true, remains }) },
    });
    const button = await waitFor(() => merge(pane) as HTMLButtonElement);
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(calls).toContain(`mergeFeature:${PROJECT.dir}:${ID}`));
    expect((await within(pane).findByRole("status")).textContent).toBe(remains[0]);
  });

  it("makes the feature Done, by the fake server's rule, and the card stops offering it", async () => {
    const app = await openFeature(acceptedCards(), { cardMerges: { [ID]: { mergeable: true, blocked: null } } });
    await app.user.click(await waitFor(() => merge(app.pane) as HTMLButtonElement));
    await waitFor(() => expect(feature(app).status).toBe("done"));
    await waitFor(() => expect(merge(app.pane)).toBeNull());
  });
});

describe("AC2: the feature's PR and checks on its card", () => {
  it("Create PR opens the feature's PR, not a story's", async () => {
    const pr: CardPr = { status: null, create: true, opening: false, note: null };
    const { pane, user, calls } = await openFeature(acceptedCards(), { cardPrs: { [ID]: pr } });
    const section = await within(pane).findByRole("region", { name: "PR" });
    await user.click(within(section).getByRole("button", { name: "Create PR" }));
    await waitFor(() => expect(calls).toContain(`createFeaturePr:${PROJECT.dir}:${ID}`));
    expect(calls.some((c) => c.startsWith("createPr:"))).toBe(false);
  });

  it("Re-run runs the feature's checks", async () => {
    const checks: CardChecks = { running: false, idle: null, last: null, failedAcs: [], note: null };
    const { pane, user, calls } = await openFeature(acceptedCards(), { cardChecks: { [ID]: checks } });
    const section = await within(pane).findByRole("region", { name: "Checks" });
    await user.click(within(section).getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(calls).toContain(`rerunFeatureChecks:${PROJECT.dir}:${ID}`));
  });
});
