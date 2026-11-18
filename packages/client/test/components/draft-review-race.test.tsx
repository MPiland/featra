/**
 * BUG-31: an Approve the card changes under while it runs. The server writes the approved feature before it commits,
 * and puts the draft back when the commit fails, so the pane's draft buttons go and come back while it runs. The real
 * App over the fake host, whose card pushes are the test's to make.
 */
import { cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Card } from "@featra/work-format";
import type { ReviewResult } from "../../src/card-pane.ts";
import { PROJECT } from "../harness.tsx";
import { button, chatWithDraft, FEATURE, gone } from "./draft-fixture.ts";

afterEach(cleanup);

const FAILED = "Couldn't approve FEAT-2; nothing was changed. git add failed: fatal: Unable to create 'index.lock'.";

/** A chat with the draft whose Approve the test answers; the server's card pushes are the test's to make. */
async function approving() {
  const answer = { give: (_r: ReviewResult) => {} };
  const answered = new Promise<ReviewResult>((resolve) => {
    answer.give = resolve;
  });
  const made = await chatWithDraft({ review: { approve: () => answered } });
  const draft = made.app.cardsIn(PROJECT.dir).find((c) => c.id === FEATURE) as Card;
  await made.app.user.click(await within(made.pane).findByRole("button", { name: "Approve" }));
  // The server writes the approved feature before it commits, so the pane sees a card that isn't a draft.
  made.app.pushCard(PROJECT.dir, { ...draft, status: "approved" });
  await waitFor(() => gone(made.pane, "Approve", "Reject"));
  return { ...made, draft, answer };
}

describe("an approve the card changes under while it runs (BUG-31)", () => {
  it("keeps both buttons off while it still runs after the draft comes back, then shows the failure", async () => {
    const { app, pane, draft, answer } = await approving();
    // The commit failed and the server put the draft back.
    app.pushCard(PROJECT.dir, draft);
    await within(pane).findByRole("button", { name: "Approve" });
    expect(button(pane, "Approve").disabled).toBe(true);
    expect(button(pane, "Reject").disabled).toBe(true);
    answer.give({ ok: false, error: FAILED });
    expect((await within(pane).findByRole("alert")).textContent).toBe(FAILED);
    expect(button(pane, "Approve").disabled).toBe(false);
    expect(button(pane, "Reject").disabled).toBe(false);
    // The buttons were mounted again under it, so focus would be lost: it goes to Reject, as for any refusal.
    expect(document.activeElement).toBe(button(pane, "Reject"));
  });

  it("shows the failure in the pane even when the card is still not a draft when it comes, and focuses it", async () => {
    const { pane, answer } = await approving();
    answer.give({ ok: false, error: FAILED });
    const alert = await within(pane).findByRole("alert");
    expect(alert.textContent).toBe(FAILED);
    expect(document.activeElement).toBe(alert);
  });

  it("puts the failure away once the card is edited", async () => {
    const { app, pane, draft, answer } = await approving();
    app.pushCard(PROJECT.dir, draft);
    answer.give({ ok: false, error: FAILED });
    await within(pane).findByRole("alert");
    await app.user.click(button(pane, "Title: Shaping"));
    await app.user.keyboard(" again{Enter}");
    await waitFor(() => expect(within(pane).queryByRole("alert")).toBeNull());
  });

  it("puts the failure away once the draft is sent back", async () => {
    const { app, pane, draft, answer } = await approving();
    app.pushCard(PROJECT.dir, draft);
    answer.give({ ok: false, error: FAILED });
    await within(pane).findByRole("alert");
    await app.user.click(button(pane, "Send back…"));
    await app.user.type(within(pane).getByRole("textbox", { name: "Reason" }), "Split the second story.");
    await app.user.click(button(pane, "Send"));
    await waitFor(() => expect(within(pane).queryByRole("alert")).toBeNull());
  });
});
