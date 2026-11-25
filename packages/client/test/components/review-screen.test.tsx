/**
 * STORY-69: the review screen in the real App over a fake host. The review is built by work-format's own builder from
 * the fake server's cards (`review-server.ts`); only git's diff stats are given by the test.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  provenEvent,
  ranEvent,
  recordEvidence,
  setStatus,
  withSummary,
  type Card,
  type CardChecks,
} from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

afterEach(cleanup);

const CI_RUN = "https://github.com/acme/app/actions/runs/42";
const AT = "2026-11-06T00:00:00Z";

const proven = (card: Card, ac: number, run: string) =>
  recordEvidence(recordEvidence(card, provenEvent(ac), "system", AT), ranEvent(ac, run), "system", AT);

const FEATURE = cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" });
const DONE = proven(
  {
    ...cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "Done", title: "Spawn five", acs: [2, 2] }),
    description: "As a lead, I want five agents.",
    pr: "https://github.com/acme/app/pull/7",
  },
  1,
  CI_RUN,
);
const DOING = proven(
  {
    ...cardOf({
      id: "STORY-6",
      type: "story",
      parent: "FEAT-2",
      status: "In Progress",
      title: "Report back",
      acs: [0, 1],
    }),
    description: "As a lead, I want reports.",
  },
  1,
  "local",
);
const cards = (feature: Card = FEATURE) => ({
  [PROJECT.dir]: [
    feature,
    DONE,
    DOING,
    cardOf({ id: "FEAT-3", type: "feature", status: "approved", title: "Burn-up" }),
  ],
});
const reviewDiffs = {
  "STORY-5": { files: 3, added: 40, removed: 2 },
  "STORY-6": { files: 1, added: 5, removed: 0 },
  "FEAT-2": { files: 4, added: 45, removed: 2 },
};

/** A shipped stylesheet: jsdom does no cascade, so looks CSS decides are checked by their rules. */
const css = (f: string) => readFileSync(join(import.meta.dirname, "../../src/styles", f), "utf8");
const ruleOf = (file: string, selector: string) =>
  new RegExp(`(^|\\n)${selector.replaceAll(".", "\\.")}\\s*\\{[^}]*\\}`).exec(css(file))?.[0] ?? "";

const screenOf = () => screen.findByRole("region", { name: "Review FEAT-2" });
const item = (scope: HTMLElement, id: string) => scope.querySelector(`[data-card="${id}"]`) as HTMLElement;

async function toWork(app: ReturnType<typeof renderApp>) {
  await app.user.click(screen.getByRole("button", { name: "Work" }));
  await screen.findByRole("region", { name: "Work list" });
}

describe("Review on an active feature (STORY-69 AC1)", () => {
  it("is on the feature's Work row, not on a feature not started, and Back returns to the row", async () => {
    const app = renderApp({ cards: cards(), reviewDiffs });
    await toWork(app);
    expect(screen.queryByRole("button", { name: "Review FEAT-3" })).toBeNull();
    const button = await screen.findByRole("button", { name: "Review FEAT-2" });
    await app.user.click(button);
    const shown = await screenOf();
    expect(within(shown).getByRole("heading", { name: "Review FEAT-2: Delegation" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Work list" })).toBeNull();
    await app.user.click(within(shown).getByRole("button", { name: "Back" }));
    await screen.findByRole("region", { name: "Work list" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Review FEAT-2" })));
  });

  it("is on the feature's card pane too", async () => {
    const app = renderApp({ cards: cards(), reviewDiffs });
    await toWork(app);
    await app.user.click(await screen.findByRole("button", { name: "Feature progress of FEAT-2" }));
    const progress = await screen.findByRole("complementary", { name: "FEAT-2 progress" });
    await app.user.click(within(progress).getByRole("button", { name: "FEAT-2 card" }));
    const pane = await screen.findByRole("complementary", { name: "FEAT-2 card" });
    await app.user.click(within(pane).getByRole("button", { name: "Review FEAT-2" }));
    expect(await screenOf()).toBeTruthy();
  });
});

describe("the review screen (STORY-69 AC2, AC3, AC5)", () => {
  it("shows each story's user story, stage, changes and criteria with their proof and run", async () => {
    const app = renderApp({ cards: cards(), reviewDiffs });
    await toWork(app);
    await app.user.click(await screen.findByRole("button", { name: "Review FEAT-2" }));
    const shown = await screenOf();
    expect(within(shown).getByText("4 files · +45 −2")).toBeTruthy();
    const done = item(shown, "STORY-5");
    expect(within(done).getByRole("heading", { name: "Spawn five" })).toBeTruthy();
    expect(within(done).getByText("Done")).toBeTruthy();
    expect(within(done).getByText("As a lead, I want five agents.")).toBeTruthy();
    expect(within(done).getByText("3 files · +40 −2")).toBeTruthy();
    const ci = within(done).getByRole("link", { name: "CI run" });
    expect(ci.getAttribute("href")).toBe(CI_RUN);
    await app.user.click(ci);
    expect(app.calls).toContain(`openExternal:${CI_RUN}`);
    await app.user.click(within(done).getByRole("link", { name: "Files changed: STORY-5" }));
    expect(app.calls).toContain("openExternal:https://github.com/acme/app/pull/7/files");
    const doing = item(shown, "STORY-6");
    expect(within(doing).getByText("In Progress")).toBeTruthy();
    expect(within(doing).getByText("Local run")).toBeTruthy();
    expect(within(doing).queryByRole("link", { name: "Local run" })).toBeNull();
    expect(within(doing).queryByRole("link", { name: /Files changed/ })).toBeNull();
    // The feature's own checks: none before it is accepted. No summary was written, so no heading for one.
    expect(within(shown).getByRole("region", { name: "Checks" }).textContent).toContain("No checks run yet");
    expect(within(shown).queryByRole("region", { name: "Summary" })).toBeNull();
  });
});

describe("the feature's checks on the review screen (STORY-69 AC5)", () => {
  it("shows the feature's last run, its failing output and Re-run, once its checks have run", async () => {
    const checks: CardChecks = {
      running: false,
      idle: null,
      last: { passed: false, command: "pnpm check", at: AT, output: "FAIL review.test.ts" },
      failedAcs: [],
      note: null,
    };
    const app = renderApp({ cards: cards(), reviewDiffs, cardChecks: { "FEAT-2": checks } });
    await toWork(app);
    await app.user.click(await screen.findByRole("button", { name: "Review FEAT-2" }));
    const section = within(await screenOf()).getByRole("region", { name: "Checks" });
    expect(within(section).getByRole("status").textContent).toContain("Checks failed");
    expect(within(section).getByRole("status").textContent).toContain("pnpm check");
    expect(within(section).getByLabelText("Failing output").textContent).toBe("FAIL review.test.ts");
    expect(section.textContent).not.toContain("No checks run yet");
    await app.user.click(within(section).getByRole("button", { name: "Re-run" }));
    await waitFor(() => expect(app.calls).toContain(`rerunFeatureChecks:${PROJECT.dir}:FEAT-2`));
  });
});

describe("the review screen, live (STORY-69 AC6, AC7)", () => {
  it("shows the Dev Lead's summary once written, a story's new stage and new proof, without reopening", async () => {
    const app = renderApp({ cards: cards(), reviewDiffs });
    await toWork(app);
    await app.user.click(await screen.findByRole("button", { name: "Review FEAT-2" }));
    const shown = await screenOf();
    app.pushCard(PROJECT.dir, withSummary(FEATURE, "Both stories are built.", "session:chat-1", AT));
    const summary = await within(shown).findByRole("region", { name: "Summary" });
    expect(within(summary).getByText("Written by the Dev Lead")).toBeTruthy();
    expect(within(summary).getByText("Both stories are built.")).toBeTruthy();
    app.pushCard(PROJECT.dir, setStatus(DOING, "Done", "session:chat-2", AT));
    await waitFor(() => expect(within(item(shown, "STORY-6")).getByText("Done")).toBeTruthy());
    // Proof arriving for STORY-5's second criterion, from a local run, shows beside it.
    expect(within(item(shown, "STORY-5")).queryByText("Local run")).toBeNull();
    app.pushCard(PROJECT.dir, proven(DONE, 2, "local"));
    await waitFor(() => expect(within(item(shown, "STORY-5")).getByText("Local run")).toBeTruthy());
    expect(within(item(shown, "STORY-5")).getByRole("link", { name: "CI run" })).toBeTruthy();
  });
});

describe("the review screen's header (STORY-69, from the screenshot review)", () => {
  it("says the stories done once, and beside it only the stages not done", async () => {
    const app = renderApp({ cards: cards(), reviewDiffs });
    await toWork(app);
    await app.user.click(await screen.findByRole("button", { name: "Review FEAT-2" }));
    const facts = (await screenOf()).querySelector(".rv-facts") as HTMLElement;
    const parts = [...facts.children].map((c) => c.textContent);
    expect(parts).toContain("1 of 2 stories done");
    expect(parts).toContain("1 in progress");
    expect(facts.textContent).not.toMatch(/\b1 done\b/);
  });

  it("marks the summary as the Dev Lead's in plain secondary text, not as a link", async () => {
    const app = renderApp({ cards: cards(withSummary(FEATURE, "Built.", "session:chat-1", AT)), reviewDiffs });
    await toWork(app);
    await app.user.click(await screen.findByRole("button", { name: "Review FEAT-2" }));
    const summary = within(await screenOf()).getByRole("region", { name: "Summary" });
    const by = within(summary).getByText("Written by the Dev Lead");
    expect(by.closest("a, [role=link], button")).toBeNull();
    expect(within(summary).queryByRole("link")).toBeNull();
    expect(ruleOf("review.css", ".rv-by")).toMatch(/color: var\(--tx2\)/);
  });

  it("lines Back up with the title and content: the action button's own left margin doesn't apply", async () => {
    const app = renderApp({ cards: cards(), reviewDiffs });
    await toWork(app);
    await app.user.click(await screen.findByRole("button", { name: "Review FEAT-2" }));
    const back = within(await screenOf()).getByRole("button", { name: "Back" });
    expect(back.classList.contains("review-draft")).toBe(true);
    expect(ruleOf("card-review.css", ".review-draft")).toMatch(/margin-left: 8px/);
    expect(back.parentElement?.classList.contains("rv-top")).toBe(true);
    expect(ruleOf("review.css", ".rv-top .review-draft")).toMatch(/margin-left: 0/);
  });
});
