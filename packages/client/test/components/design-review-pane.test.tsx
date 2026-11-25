/**
 * STORY-73 (the user's side): a story's card pane shows where its design review stands, with the Dev Lead's findings
 * while they're open; when the Dev Lead chat that started the story is gone, it says so and lets the user clear the
 * review or send the story back. The real App over a fake host; the server's design review is the test's.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DESIGN_REVIEW_COPY, type DesignReviewView } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import type { HostOptions } from "../harness-options.ts";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const STORY = "STORY-2";
const SHOTS = [".featra/evidence/FEAT-1/STORY-2/ac1-page.png"];

async function openPane(review: DesignReviewView | undefined, host: HostOptions = {}) {
  const app = renderApp({
    cards: { [PROJECT.dir]: PLAN.map(cardOf) },
    cardProof: review ? { [STORY]: { designReview: review } } : {},
    ...host,
  });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
  const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
  return { ...app, pane };
}

const group = (pane: HTMLElement) => within(pane).getByRole("group", { name: DESIGN_REVIEW_COPY.label });

describe("AC1 and AC2: the card shows where the design review stands", () => {
  it("says it waits for the Dev Lead, with nothing to do here", async () => {
    const { pane } = await openPane({ status: "waiting", shots: SHOTS });
    expect(within(group(pane)).getByText("Design review: waiting")).toBeTruthy();
    expect(within(pane).queryByRole("button", { name: DESIGN_REVIEW_COPY.clear })).toBeNull();
  });

  it("shows the findings sent to the story's session", async () => {
    const findings = "The Save button overlaps the footer at 1280 px.";
    const { pane } = await openPane({ status: "findings", shots: SHOTS, findings });
    expect(within(group(pane)).getByText("Design review: findings sent")).toBeTruthy();
    expect(within(group(pane)).getByText(findings)).toBeTruthy();
  });

  it("says it's cleared", async () => {
    const { pane } = await openPane({ status: "cleared", shots: SHOTS });
    expect(within(group(pane)).getByText("Design review: cleared")).toBeTruthy();
  });
});

describe("AC3: a story with no design review shows none", () => {
  it("has no design review on its card", async () => {
    const { pane } = await openPane(undefined);
    expect(within(pane).queryByRole("group", { name: DESIGN_REVIEW_COPY.label })).toBeNull();
  });
});

describe("when the Dev Lead chat that started the story is gone", () => {
  const gone: DesignReviewView = { status: "waiting", shots: SHOTS, leadGone: true };

  it("says so, and the user clears the review", async () => {
    const { pane, user, calls } = await openPane(gone);
    expect(within(group(pane)).getByText(DESIGN_REVIEW_COPY.leadGone(STORY))).toBeTruthy();
    await user.click(within(group(pane)).getByRole("button", { name: DESIGN_REVIEW_COPY.clear }));
    await waitFor(() => expect(calls).toContain(`clearDesignReview:${PROJECT.dir}:${STORY}`));
  });

  it("shows why a clear was refused", async () => {
    const why = `${STORY} has no design review waiting.`;
    const { pane, user } = await openPane(gone, {
      review: { clearDesignReview: async () => ({ ok: false, error: why }) },
    });
    await user.click(within(group(pane)).getByRole("button", { name: DESIGN_REVIEW_COPY.clear }));
    expect((await within(group(pane)).findByRole("alert")).textContent).toBe(why);
  });

  it("lets the user send the story back with a reason", async () => {
    const { pane, user, calls } = await openPane(gone, {
      review: { sendBackStory: async () => ({ ok: true, recorded: true }) },
    });
    await user.click(within(group(pane)).getByRole("button", { name: `Send back ${STORY}` }));
    await user.type(within(pane).getByRole("textbox", { name: "Reason" }), "The header is cut off.");
    await user.click(within(pane).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls).toContain(`sendBackStory:${PROJECT.dir}:${STORY}:The header is cut off.:false`));
  });

  it("offers nothing once the review is cleared", async () => {
    const { pane } = await openPane({ ...gone, status: "cleared" });
    expect(within(pane).queryByText(DESIGN_REVIEW_COPY.leadGone(STORY))).toBeNull();
    expect(within(pane).queryByRole("button", { name: DESIGN_REVIEW_COPY.clear })).toBeNull();
  });
});
