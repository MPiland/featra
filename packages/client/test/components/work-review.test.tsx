/** STORY-8 AC2: a feature an agent drafted shows in Work as a Draft with a Review badge. Real App; lists built by work-format. */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { workList } from "../work-fixtures.ts";

afterEach(cleanup);

const list = workList([
  { id: "FEAT-1", type: "feature", status: "active", title: "Built" },
  { id: "FEAT-2", type: "feature", status: "draft", title: "Shaping", draftedBy: "chat-1" },
  { id: "FEAT-3", type: "feature", status: "draft", title: "By hand" },
  { id: "STORY-1", type: "story", parent: "FEAT-2", title: "Draft it" },
]);

const row = (id: string) => document.querySelector(`[data-card="${id}"]`) as HTMLElement;

describe("AC2: the Draft feature shows in Work with a Review badge", () => {
  it("marks the drafted feature as Draft with a Review badge, and no other row", async () => {
    renderApp({ work: { [PROJECT.dir]: list } });
    await screen.findByRole("region", { name: "Work list" });
    expect(within(row("FEAT-2")).getByText("Review")).toBeTruthy();
    expect(within(row("FEAT-2")).getByText("Draft")).toBeTruthy();
    expect(within(row("FEAT-1")).queryByText("Review")).toBeNull();
    expect(within(row("FEAT-3")).queryByText("Review")).toBeNull();
  });

  it("counts the drafted feature under Needs review", async () => {
    const { user } = renderApp({ work: { [PROJECT.dir]: list } });
    await screen.findByRole("region", { name: "Work list" });
    await user.click(screen.getByRole("button", { name: /Needs review/ }));
    expect(screen.getByRole("button", { name: "Shaping" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Built" })).toBeNull();
  });
});
