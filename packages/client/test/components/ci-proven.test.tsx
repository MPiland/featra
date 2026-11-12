/**
 * STORY-57 (the card pane's side): what CI's test report proved shows on each criterion, and what it didn't prove, and
 * why, shows in the PR section. The real App over a fake host whose server hands the pane the PR's state (reading the
 * report through gh is proved by the server's tests).
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { provenEvent, recordEvidence, type Card, type CardPr } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const STORY = "STORY-2";
const URL = "https://github.com/acme/app/pull/14";
const written = (c: Card): Card =>
  recordEvidence(
    {
      ...c,
      status: "In Review",
      pr: URL,
      acs: [
        { text: "Opens the folder", done: false, test: "test/open.test.ts::open > opens" },
        { text: "Saves it", done: false, test: "test/open.test.ts::open > saves" },
        { text: "Closes it", done: false, test: "test/open.test.ts::open > closes" },
        { text: "Looks right", done: false, test: null },
      ],
    },
    provenEvent(1),
    "system",
    "2026-11-12T10:00:00Z",
  );
const REPORTED: CardPr = {
  status: { state: "open", checks: "failing" },
  create: false,
  opening: false,
  note: null,
  report: {
    failedAcs: [2],
    missingAcs: [3],
    reasons: ['AC 2: "open saves" failed.', 'AC 3: No test named "open closes" ran.'],
    note: null,
  },
};

async function openStory(state: CardPr) {
  const cards = PLAN.map(cardOf).map((c) => (c.id === STORY ? written(c) : c));
  const app = renderApp({ cards: { [PROJECT.dir]: cards }, cardPrs: { [STORY]: state } });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
  const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
  await within(pane).findByRole("region", { name: "Acceptance criteria" });
  return { ...app, pane };
}
const proofOf = (pane: HTMLElement, text: string) =>
  (within(pane).getByText(text).closest("li") as HTMLElement).textContent;

describe("AC2, AC3: the card shows what CI's report proved", () => {
  it("marks each criterion passed, failed or not in the report, and says why in the PR section", async () => {
    const { pane } = await openStory(REPORTED);
    expect(proofOf(pane, "Opens the folder")).toContain("Test passed");
    expect(proofOf(pane, "Saves it")).toContain("Test failed");
    expect(proofOf(pane, "Closes it")).toContain("Not in the report");
    expect(proofOf(pane, "Looks right")).toContain("No test yet");
    const pr = within(pane).getByRole("region", { name: "PR" });
    const report = within(pr).getByRole("group", { name: "Test report" });
    expect(
      within(report)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(REPORTED.report?.reasons);
  });

  it("shows why there was no report to read", async () => {
    const note = "CI uploaded no test report for this commit matching the one set in Project settings.";
    const { pane } = await openStory({
      ...REPORTED,
      report: { failedAcs: [], missingAcs: [2, 3], reasons: [], note },
    });
    const report = within(within(pane).getByRole("region", { name: "PR" })).getByRole("group", { name: "Test report" });
    expect(report.textContent).toBe(note);
  });

  it("shows nothing of a report before one is read", async () => {
    const { pane } = await openStory({ ...REPORTED, report: undefined });
    expect(within(pane).queryByRole("group", { name: "Test report" })).toBeNull();
    expect(proofOf(pane, "Closes it")).toContain("No result yet");
  });
});
