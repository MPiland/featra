/** STORY-74: the Browser pane's fixtures and steps, shared by its component tests. */
import { screen, within } from "@testing-library/react";
import { BROWSER_COPY } from "../../src/browser.ts";
import type { UiState } from "../../src/ui-state.ts";
import { PROJECT, renderApp } from "../harness.tsx";
import type { HostOptions } from "../harness-options.ts";
import { cardOf } from "../work-fixtures.ts";

export const STORY = "STORY-5";
export const WEBSITE = { dir: "/home/me/website", name: "website" };

/** FEAT-2 and its story STORY-5, in the project at `dir`. */
export const projectCards = (status = "In Progress") => [
  cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" }),
  cardOf({ id: STORY, type: "story", parent: "FEAT-2", status, title: "Spawn five", acs: [0, 1] }),
];
export const cards = (status = "In Progress") => ({ [PROJECT.dir]: projectCards(status) });

export type Host = HostOptions & { state?: Partial<UiState> };
export type App = ReturnType<typeof renderApp>;

export const rowOf = () => screen.getByRole("row", { name: /Spawn five/ });
export const browserPane = (id = STORY) => screen.findByRole("complementary", { name: BROWSER_COPY.pane(id) });

/** Opens STORY-5's card from Work. */
export async function openCard(host: Host = {}) {
  const app = renderApp({ cards: cards(), cardProof: { [STORY]: { browser: true } }, ...host });
  return { ...app, card: await cardFromWork(app) };
}

/** In Work, opens STORY-5's card from its feature's group. */
export async function cardFromWork(app: App) {
  await screen.findByRole("region", { name: "Work list" });
  // The list's rows come with the project's cards, which may land after the list itself.
  await app.user.click(await screen.findByRole("button", { name: "Delegation" }));
  await app.user.click(await within(rowOf()).findByRole("button", { name: "Spawn five" }));
  return screen.findByRole("complementary", { name: `${STORY} card` });
}

/** Opens the card, then the Browser pane from it, with the story's dev server up. */
export async function openBrowser(host: Host = {}) {
  const app = await openCard(host);
  await app.user.click(within(app.card).getByRole("button", { name: BROWSER_COPY.open }));
  const pane = await browserPane();
  return { ...app, pane };
}

export const key = (app: App) => app.browser.current();
export const lastSaved = (app: App) => app.saves.at(-1);
export const device = (pane: HTMLElement) => within(pane).getByRole("combobox", { name: BROWSER_COPY.device });
