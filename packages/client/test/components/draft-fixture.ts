/**
 * The shared setup for the draft review tests (STORY-51, BUG-31): a project with FEAT-1 built and FEAT-2 drafted by a
 * chat, in the real App over the fake host.
 */
import { expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { DEFAULT_CONFIG, planDraft, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import { cardOf } from "../work-fixtures.ts";

export const BUILT = [cardOf({ id: "FEAT-1", type: "feature", status: "done", title: "Built" })];
export const FEATURE = "FEAT-2";

export function drafted(chat: string): Card[] {
  const planned = planDraft(
    {
      feature: { title: "Shaping", description: "Talk a feature through." },
      stories: [
        { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It shows"], tasks: ["Build"] },
        { id: null, title: "Review it", story: "As a builder, I review.", criteria: ["It opens"], tasks: ["Wire"] },
      ],
    },
    { cards: BUILT, config: DEFAULT_CONFIG, chat, at: "2026-11-10T09:00:00Z" },
  );
  if (!planned.ok) throw new Error(planned.error);
  return planned.value.writes.map((w) => w.card);
}

export type Host = Parameters<typeof renderApp>[0];

/** A Dev Lead chat (chat-1) that has drafted FEAT-2, open with its pane. */
export async function chatWithDraft(host: Host = {}, more: Card[] = []) {
  const app = renderApp({ ...host, cards: { [PROJECT.dir]: [...BUILT, ...drafted("chat-1"), ...more] } });
  await app.chats.bridge.start(PROJECT.dir, "dev-lead");
  await screen.findByRole("region", { name: "Work list" });
  app.chats.retitle("chat-1", "Shaping", "draft");
  await app.user.click(screen.getByRole("button", { name: `Review draft ${FEATURE}` }));
  return { app, pane: await screen.findByRole("complementary", { name: `${FEATURE} card` }) };
}

export const button = (pane: HTMLElement, name: string) =>
  within(pane).getByRole<HTMLButtonElement>("button", { name });
export const gone = (pane: HTMLElement, ...names: string[]) =>
  names.forEach((name) => expect(within(pane).queryByRole("button", { name })).toBeNull());
