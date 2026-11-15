/**
 * STORY-15 (the user's side): a bar says what it stands for on hover or focus, and a feature's Scope says where its
 * added items came from. The real App over a fake host whose server sends lists built by work-format.
 */
import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newCard, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { PLAN, workList } from "../work-fixtures.ts";

afterEach(cleanup);

/** Items that join FEAT-2 after it went in progress (the fixtures start it at 2026-11-01). */
const later = (id: string, type: "story" | "bug"): Card =>
  newCard(
    { id, type, title: id, status: "New", parent: "FEAT-2", origin: type === "bug" ? "bug" : "added" },
    "user",
    "2026-11-05T00:00:00Z",
  );
const ADDED = [later("STORY-7", "story"), later("STORY-8", "story"), later("BUG-4", "bug")];

const rowOf = (name: string) => screen.getByRole("button", { name }).closest("[role=row]") as HTMLElement;
const tip = () => document.querySelector(".pbar-tip");

describe("AC1: a bar shows its breakdown on hover or focus", () => {
  it("names a feature's bar by its stories' stages and shows it while hovered", async () => {
    const { user } = renderApp({ work: { [PROJECT.dir]: workList(PLAN) } });
    await screen.findByRole("region", { name: "Work list" });
    const bar = within(rowOf("Cards and the feature list")).getByRole("img", {
      name: "1 in review · 1 in progress",
    });
    expect(tip()).toBeNull();
    await user.hover(bar);
    expect(tip()?.textContent).toBe("1 in review · 1 in progress");
    await user.unhover(bar);
    expect(tip()).toBeNull();
  });

  it("is reached with Tab, shows the breakdown on focus, and Escape hides it", async () => {
    const { user } = renderApp({ work: { [PROJECT.dir]: workList(PLAN) } });
    await screen.findByRole("region", { name: "Work list" });
    const bar = within(rowOf("Provider spike")).getByRole("img", { name: "1 done" });
    expect(bar.tabIndex).toBe(0);
    act(() => bar.focus());
    expect(tip()?.textContent).toBe("1 done");
    await user.keyboard("{Escape}");
    expect(tip()).toBeNull();
    expect(document.activeElement).toBe(bar);
  });

  it("keeps the tooltip while focused when the mouse leaves, and shows it again on hover after Escape", async () => {
    const { user } = renderApp({ work: { [PROJECT.dir]: workList(PLAN) } });
    await screen.findByRole("region", { name: "Work list" });
    const bar = within(rowOf("Provider spike")).getByRole("img", { name: "1 done" });
    act(() => bar.focus());
    await user.hover(bar);
    await user.unhover(bar);
    expect(tip()?.textContent).toBe("1 done");
    await user.keyboard("{Escape}");
    expect(tip()).toBeNull();
    await user.hover(bar);
    expect(tip()?.textContent).toBe("1 done");
  });

  it("names an epic's bar by its features' statuses", async () => {
    const { user } = renderApp({ work: { [PROJECT.dir]: workList(PLAN) } });
    const epic = await screen.findByRole("region", { name: "Prove the core" });
    const header = epic.querySelector(".epich") as HTMLElement;
    const bar = within(header).getByRole("img", { name: "1 done · 1 in progress · 1 draft" });
    await user.hover(bar);
    expect(tip()?.textContent).toBe("1 done · 1 in progress · 1 draft");
  });

  it("leaves a bar with nothing under it out of the accessibility tree", async () => {
    renderApp({ work: { [PROJECT.dir]: workList([{ id: "FEAT-5", type: "feature", title: "Empty" }]) } });
    await screen.findByRole("region", { name: "Work list" });
    expect(within(rowOf("Empty")).queryByRole("img")).toBeNull();
  });
});

describe("AC4: a feature's Scope says where added items came from", () => {
  it("counts added stories and bugs apart", async () => {
    const { user } = renderApp({ work: { [PROJECT.dir]: workList(PLAN, [], [], ADDED) } });
    await screen.findByRole("region", { name: "Work list" });
    const cells = within(rowOf("Cards and the feature list")).getAllByRole("cell");
    expect(cells.at(-1)?.textContent).toBe("+3 added: 2 stories · 1 bug · 1 open bug");
    await user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
    expect(within(rowOf("STORY-7")).getByText(/added/)).toBeTruthy();
  });
});
