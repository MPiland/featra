/**
 * STORY-11 (the window's side): a story's PR chip on its card and its Work row, labelled with the PR number, linking to
 * the PR with its state and checks, the full URL on hover; the card's Create PR and why opening failed; and a read of
 * the open PRs asked for when the window regains focus. The real App over a fake host whose server hands the window
 * the PR's state (reading it through gh is proved by the server's tests).
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Card, CardPr } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const STORY = "STORY-2";
const URL = "https://github.com/acme/app/pull/14";
const cards = (pr: string | null): Card[] =>
  PLAN.map((spec) =>
    spec.id === STORY ? Object.assign(cardOf(Object.assign({}, spec, { status: "In Review" })), { pr }) : cardOf(spec),
  );
const OPEN_FAILING: CardPr = {
  status: { state: "open", checks: "failing" },
  create: false,
  opening: false,
  note: null,
};

async function workRow(pr: string | null, state?: CardPr) {
  const app = renderApp({
    cards: { [PROJECT.dir]: cards(pr) },
    ...(state ? { cardPrs: { [STORY]: state } } : {}),
  });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  const row = screen.getByRole("button", { name: "Open a folder" }).closest('[role="row"]') as HTMLElement;
  return { ...app, row };
}

async function openCard(pr: string | null, state?: CardPr) {
  const app = await workRow(pr, state);
  await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
  const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
  const section = await within(pane).findByRole("region", { name: "PR" });
  return { ...app, pane, section };
}

describe("AC3: the PR chip", () => {
  it("on the card is the PR number linking to the PR, with its state, its checks and the URL on hover", async () => {
    const { section, user, calls } = await openCard(URL, OPEN_FAILING);
    const link = within(section).getByRole("link", { name: "#14" });
    expect(link.getAttribute("href")).toBe(URL);
    expect(link.getAttribute("title")).toBe(URL);
    expect(section.textContent).not.toContain(URL);
    expect(within(section).getByText("Open")).toBeTruthy();
    expect(within(section).getByText("Checks failing")).toBeTruthy();
    await user.click(link);
    expect(calls).toContain(`openExternal:${URL}`);
  });

  it("on the story's Work row is the PR number, its state, and its checks as a mark that says itself", async () => {
    const { row, user, calls } = await workRow(URL, {
      ...OPEN_FAILING,
      status: { state: "merged", checks: "passing" },
    });
    const link = within(row).getByRole("link", { name: "#14" });
    expect(link.getAttribute("title")).toBe(URL);
    expect(row.textContent).not.toContain(URL);
    expect(within(row).getByText("Merged")).toBeTruthy();
    expect(within(row).getByRole("img", { name: "Checks passing" }).getAttribute("title")).toBe("Checks passing");
    await user.click(link);
    expect(calls).toContain(`openExternal:${URL}`);
  });

  it("before its first read, or in local mode, is the link alone", async () => {
    const { section } = await openCard(URL);
    expect(within(section).getByRole("link", { name: "#14" })).toBeTruthy();
    expect(within(section).queryByText("Open")).toBeNull();
    expect(within(section).queryByText(/Checks/)).toBeNull();
  });
});

describe("AC2: Create PR", () => {
  it("is offered when the server says so, and asks the server to open the PR", async () => {
    const { section, user, calls } = await openCard(null, { status: null, create: true, opening: false, note: null });
    await user.click(within(section).getByRole("button", { name: "Create PR" }));
    await waitFor(() => expect(calls).toContain(`createPr:${PROJECT.dir}:${STORY}`));
  });

  it("isn't offered while the PR opens, or once the story has one", async () => {
    const opening = await openCard(null, { status: null, create: false, opening: true, note: null });
    expect(within(opening.section).getByRole("status").textContent).toBe("Opening PR…");
    expect(within(opening.section).queryByRole("button", { name: "Create PR" })).toBeNull();
    cleanup();
    const has = await openCard(URL, OPEN_FAILING);
    expect(within(has.section).queryByRole("button", { name: "Create PR" })).toBeNull();
  });

  it("shows why opening it failed, and why a Create PR was refused", async () => {
    const note = "Couldn't open the PR: HTTP 403";
    const app = renderApp({
      cards: { [PROJECT.dir]: cards(null) },
      cardPrs: { [STORY]: { status: null, create: true, opening: false, note } },
      review: { createPr: async () => ({ ok: false, error: "This story already has a PR." }) },
    });
    await screen.findByRole("region", { name: "Work list" });
    await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
    await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
    const section = await within(await screen.findByRole("complementary", { name: `${STORY} card` })).findByRole(
      "region",
      { name: "PR" },
    );
    expect(within(section).getByText(note)).toBeTruthy();
    await app.user.click(within(section).getByRole("button", { name: "Create PR" }));
    expect((await within(section).findByRole("alert")).textContent).toBe("This story already has a PR.");
  });
});

describe("AC4: reading PRs when the window regains focus", () => {
  it("asks the server for a read each time the window is focused", async () => {
    const { calls } = await workRow(URL, OPEN_FAILING);
    expect(calls.filter((c) => c === "refreshPrs")).toHaveLength(0);
    fireEvent.focus(window);
    fireEvent.focus(window);
    expect(calls.filter((c) => c === "refreshPrs")).toHaveLength(2);
  });
});
