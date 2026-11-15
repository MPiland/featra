/** BUG-25 AC2: a feature the user opened stays open, and one they left closed stays closed, through the real App. */
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROJECT, renderApp } from "../harness.tsx";
import { PLAN, workList } from "../work-fixtures.ts";

afterEach(cleanup);

const region = () => screen.findByRole("region", { name: "Work list" });
const toggle = (name: string) => screen.getByRole("button", { name });
const expanded = (name: string) => toggle(name).getAttribute("aria-expanded");
const work = { [PROJECT.dir]: workList(PLAN) };

describe("a feature's open state (BUG-25 AC2)", () => {
  it("lasts through an update that blanks the list for a moment, with a problem", async () => {
    const { user, pushWork } = renderApp({ work });
    await region();
    await user.click(toggle("Cards and the feature list"));
    pushWork(PROJECT.dir, { ...workList([]), problems: ["Can't read the cards: git rev-parse failed"] });
    expect(await screen.findByText("No cards yet.")).toBeTruthy();
    pushWork(PROJECT.dir, workList(PLAN));
    expect(await screen.findByText("Home feature list")).toBeTruthy();
    expect(expanded("Cards and the feature list")).toBe("true");
    expect(expanded("Provider spike")).toBe("false");
  });

  it("lasts through a filter chip and back", async () => {
    const { user } = renderApp({ work });
    await region();
    await user.click(toggle("Cards and the feature list"));
    await user.click(screen.getByRole("button", { name: /^In progress/ }));
    expect(expanded("Cards and the feature list")).toBe("true");
    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(expanded("Cards and the feature list")).toBe("true");
    expect(screen.getByText("Home feature list")).toBeTruthy();
    expect(expanded("Provider spike")).toBe("false");
  });

  it("stays closed when the user closed it, through an update", async () => {
    const { user, pushWork } = renderApp({ work });
    await region();
    await user.click(toggle("Cards and the feature list"));
    await user.click(toggle("Cards and the feature list"));
    expect(toggle("Burn-up")).toBeTruthy();
    pushWork(PROJECT.dir, workList(PLAN.filter((c) => c.id !== "FEAT-3" && c.parent !== "FEAT-3")));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Burn-up" })).toBeNull());
    expect(expanded("Cards and the feature list")).toBe("false");
    expect(screen.queryByText("Home feature list")).toBeNull();
  });
});
