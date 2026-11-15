/** STORY-24: the feature progress pane's fixtures and steps, shared by its component tests. */
import { screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import { DRAFTED_BY, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "./harness.tsx";
import { cardOf } from "./work-fixtures.ts";

export type Host = Parameters<typeof renderApp>[0];
export type App = ReturnType<typeof renderApp>;

export const drafted = (card: Card, chat: string): Card => ({ ...card, extra: { ...card.extra, [DRAFTED_BY]: chat } });
export const FEATURE = cardOf({ id: "FEAT-2", type: "feature", status: "active", title: "Delegation" });
export const STORIES = [
  cardOf({ id: "STORY-5", type: "story", parent: "FEAT-2", status: "New", title: "Spawn five", acs: [0, 2] }),
  cardOf({ id: "STORY-6", type: "story", parent: "FEAT-2", status: "Ready", title: "Report back", tasks: [1, 3] }),
];
/** FEAT-2, drafted by the project's first chat; FEAT-3 drafted by nobody. */
export const cards = (lead: string | null = "chat-1") => ({
  [PROJECT.dir]: [
    lead ? drafted(FEATURE, lead) : FEATURE,
    ...STORIES,
    cardOf({ id: "FEAT-3", type: "feature", status: "approved", title: "Burn-up" }),
  ],
});

export const pane = (id = "FEAT-2") => screen.queryByRole("complementary", { name: `${id} progress` });
export const findPane = (id = "FEAT-2") => screen.findByRole("complementary", { name: `${id} progress` });
export const storyLine = (scope: HTMLElement, id: string) => scope.querySelector(`[data-card="${id}"]`) as HTMLElement;
export const progressButton = () => screen.queryByRole("button", { name: "Feature progress" });

/** Starts a chat of `role` from the UI; it is the project's chat-1. */
export async function startChat(host: Host, role = "Dev Lead") {
  const app = renderApp(host);
  await app.user.click(screen.getByRole("button", { name: "New chat" }));
  const dialog = await screen.findByRole("dialog", { name: "New chat" });
  await app.user.click(await within(dialog).findByRole("button", { name: new RegExp(`^${role}`) }));
  await screen.findByRole("region", { name: role });
  return app;
}

/** Opens Work and the feature's progress from its row. */
export async function fromWork(app: App, id = "FEAT-2") {
  await app.user.click(screen.getByRole("button", { name: "Work" }));
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(await screen.findByRole("button", { name: `Feature progress of ${id}` }));
  return findPane(id);
}

/** Starts STORY-5 from its Work row: its session is a chat under the Dev Lead's. */
export async function startStory(app: App) {
  await app.user.click(screen.getByRole("button", { name: "Delegation" }));
  await app.user.click(await screen.findByRole("button", { name: "Start STORY-5" }));
  await waitFor(() => expect(app.calls).toContain(`startStory:${PROJECT.dir}:STORY-5`));
  const row = screen.getByRole("row", { name: /Spawn five/ });
  await within(row).findByRole("button", { name: "Open the session of STORY-5" });
}

export const sessionOf = (app: App) => {
  const chat = app
    .cardsIn(PROJECT.dir)
    .find((c) => c.id === "STORY-5")
    ?.sessions.at(-1);
  if (!chat) throw new Error("STORY-5 has no session.");
  return chat;
};
