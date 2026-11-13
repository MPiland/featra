/**
 * STORY-56 (the card pane's side): a story's checks on this computer show their state, the failing output and Re-run;
 * a criterion whose linked test failed says so. The real App over a fake host whose server hands the pane the checks
 * (running them is proved by the server's tests).
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Card, CardChecks } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const STORY = "STORY-2";
const written = (c: Card): Card => ({
  ...c,
  acs: [
    { text: "Opens the folder", done: false, test: "e2e/open.spec.ts" },
    { text: "Remembers it", done: false, test: null },
  ],
});
const cards = (): Card[] => PLAN.map(cardOf).map((c) => (c.id === STORY ? written(c) : c));

const FAILED: CardChecks = {
  running: false,
  idle: null,
  last: {
    passed: false,
    command: "pnpm test",
    at: "2026-11-12T10:00:00Z",
    output: "FAIL open.spec.ts\nexpected 1 to be 2",
  },
  failedAcs: [1],
  note: "Linked tests need a command in Project settings.",
};

async function openStory(checks?: CardChecks) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards() }, ...(checks ? { cardChecks: { [STORY]: checks } } : {}) });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
  const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
  await within(pane).findByRole("region", { name: "Acceptance criteria" });
  return { ...app, pane };
}

describe("AC3, AC4: the card shows the checks", () => {
  it("shows the failing output, the command and the failed criterion after a failing run", async () => {
    const { pane } = await openStory(FAILED);
    const section = within(pane).getByRole("region", { name: "Checks" });
    expect(within(section).getByRole("status").textContent).toContain("Checks failed");
    expect(within(section).getByRole("status").textContent).toContain("pnpm test");
    expect(within(section).getByLabelText("Failing output").textContent).toBe("FAIL open.spec.ts\nexpected 1 to be 2");
    expect(within(section).getByText(FAILED.note as string)).toBeTruthy();
    const ac = within(pane).getByText("Opens the folder").closest("li") as HTMLElement;
    expect(within(ac).getByText("Test failed")).toBeTruthy();
  });

  it("shows a passing run without output, and a running one as running", async () => {
    const passed = {
      ...FAILED,
      last: { ...(FAILED.last as NonNullable<CardChecks["last"]>), passed: true },
      failedAcs: [],
      note: null,
    };
    const first = await openStory(passed);
    const section = within(first.pane).getByRole("region", { name: "Checks" });
    expect(within(section).getByRole("status").textContent).toContain("Checks passed");
    expect(within(section).queryByLabelText("Failing output")).toBeNull();
    cleanup();
    const second = await openStory({ ...FAILED, running: true });
    const running = within(second.pane).getByRole("region", { name: "Checks" });
    expect(within(running).getByRole("status").textContent).toContain("Checks running");
    expect(within(running).getByRole<HTMLButtonElement>("button", { name: "Re-run" }).disabled).toBe(true);
  });

  it("says why nothing ran when there is no check command", async () => {
    const { pane } = await openStory({
      running: false,
      idle: "No check command yet.",
      last: null,
      failedAcs: [],
      note: null,
    });
    expect(within(within(pane).getByRole("region", { name: "Checks" })).getByRole("status").textContent).toBe(
      "No check command yet.",
    );
  });

  it("has Re-run, which asks the server to run the checks again", async () => {
    const app = await openStory(FAILED);
    await app.user.click(within(app.pane).getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(app.calls).toContain(`rerunChecks:${PROJECT.dir}:${STORY}`));
  });

  it("shows no Checks section where CI runs the checks", async () => {
    const { pane } = await openStory();
    expect(within(pane).queryByRole("region", { name: "Checks" })).toBeNull();
  });
});
