/** STORY-8 AC2: a feature an agent drafted shows in Work as a Draft with a Review badge. Real App; lists built by work-format. */
import { cleanup, screen, within } from "@testing-library/react";
import { DEFAULT_CONFIG, planDraft } from "@featra/work-format";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, workList, type CardSpec } from "../work-fixtures.ts";

afterEach(cleanup);

const before: CardSpec[] = [
  { id: "FEAT-1", type: "feature", status: "active", title: "Built" },
  { id: "FEAT-3", type: "feature", status: "draft", title: "By hand" },
];

/** FEAT-4, a draft the real planner made for chat-1: nothing here sets how it is marked. */
const drafted = (() => {
  const planned = planDraft(
    {
      feature: { title: "Shaping", description: "Talk a feature through." },
      stories: [
        { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It shows"], tasks: ["Build"] },
      ],
    },
    { cards: before.map(cardOf), config: DEFAULT_CONFIG, chat: "chat-1", at: "2026-11-10T09:00:00Z" },
  );
  if (!planned.ok) throw new Error(planned.error);
  return planned.value;
})();
const list = workList(
  before,
  [],
  [],
  drafted.writes.map((w) => w.card),
);
const feature = drafted.result.feature;

const row = (id: string) => document.querySelector(`[data-card="${id}"]`) as HTMLElement;

describe("AC2: the Draft feature shows in Work with a Review badge", () => {
  it("marks the drafted feature as Draft with a Review badge, and no other row", async () => {
    renderApp({ work: { [PROJECT.dir]: list } });
    await screen.findByRole("region", { name: "Work list" });
    expect(within(row(feature)).getByText("Review")).toBeTruthy();
    expect(within(row(feature)).getByText("Draft")).toBeTruthy();
    expect(within(row("FEAT-1")).queryByText("Review")).toBeNull();
    expect(within(row("FEAT-3")).queryByText("Review")).toBeNull();
  });

  it("names the badge for its feature, so a screen reader hears which draft needs review", async () => {
    renderApp({ work: { [PROJECT.dir]: list } });
    await screen.findByRole("region", { name: "Work list" });
    expect(within(row(feature)).getByLabelText(`${feature} draft, needs review`).textContent).toBe("Review");
    expect(screen.getAllByLabelText(/needs review/)).toHaveLength(1);
  });

  it("counts the drafted feature under Needs review", async () => {
    const { user } = renderApp({ work: { [PROJECT.dir]: list } });
    await screen.findByRole("region", { name: "Work list" });
    await user.click(screen.getByRole("button", { name: /Needs review/ }));
    expect(screen.getByRole("button", { name: "Shaping" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Built" })).toBeNull();
  });
});
