/**
 * STORY-10 AC2 (the client's part): a story an agent has reported on shows "Reported" on its row, through the real App
 * over a fake host whose server sends lists built by work-format from a card the real `applyReport` changed.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { applyReport, DEFAULT_CONFIG } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, PLAN, workList } from "../work-fixtures.ts";

afterEach(cleanup);

const AT = "2026-11-03T00:00:00Z";
const story = () =>
  cardOf({ id: "STORY-2", type: "story", parent: "FEAT-2", status: "In Progress", title: "Open a folder" });

function reportedBy(by: string) {
  const done = applyReport(story(), { note: "Working on it." }, { config: DEFAULT_CONFIG }, by, AT, "Developer chat");
  if (!done.ok) throw new Error(done.error);
  return done.card;
}

const listWith = (card: ReturnType<typeof story>) =>
  workList(
    PLAN.filter((s) => s.id !== "STORY-2"),
    [],
    [],
    [card],
  );

const rowText = async (name: string) => {
  await screen.findByRole("region", { name: "Work list" });
  const feature = screen.getByRole("button", { name: "Cards and the feature list" });
  if (feature.getAttribute("aria-expanded") === "false") feature.click();
  return (await screen.findByText(name)).closest("[role=row]") as HTMLElement;
};

describe("the Reported mark", () => {
  it("marks a story an agent reported on", async () => {
    renderApp({ work: { [PROJECT.dir]: listWith(reportedBy("session:chat-1")) } });
    expect(within(await rowText("Open a folder")).getByText(/Reported/)).toBeTruthy();
  });

  it("does not mark a story the user changed, or one nobody reported on", async () => {
    renderApp({ work: { [PROJECT.dir]: listWith(reportedBy("user")) } });
    expect(within(await rowText("Open a folder")).queryByText(/Reported/)).toBeNull();
    expect(within(await rowText("Home feature list")).queryByText(/Reported/)).toBeNull();
  });
});
