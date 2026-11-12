import { expect, type Page } from "@playwright/test";

/** The Dev Lead draft journeys share this: a new Dev Lead chat that drafts a feature, resolved with the pane it opens in. */
export const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
export const pane = (page: Page, id: string) => page.getByRole("complementary", { name: `${id} card` });
/** How long a chat may take to start and open: the first one after Electron is unpacked, on a cold runner, is slow. */
const CHAT_START_MS = 20_000;
/** Starts a Dev Lead chat and has it draft a feature; resolves with the pane the draft opens in. */
export async function draftInNewChat(page: Page, id: string) {
  const open = page.locator("section.chat");
  const before = (await open.count()) > 0 ? await open.first().getAttribute("data-chat") : null;
  await page.getByRole("button", { name: "New chat" }).click();
  const picker = page.getByRole("dialog", { name: "New chat" });
  await picker.getByRole("button", { name: /^Dev Lead/ }).click();
  // The picker stays up, and the app behind it is inert, until the server answers the start. The first chat of a run on
  // a cold machine took over the 5 s default (BUG-17), so wait for that answer on its own, longer limit. A refusal
  // would leave the picker up, which then fails here, not later as a composer that is missing.
  await expect(picker).toBeHidden({ timeout: CHAT_START_MS });
  // The old chat's composer stays on screen until the new chat replaces it, and is editable: filling it then sends the
  // text to the old chat (the CI trace showed a 6 ms fill against 72 ms in a fresh composer). Wait for the swap, then
  // send with the button and see the message land.
  if (before) await expect(open.first()).not.toHaveAttribute("data-chat", before);
  await expect(composer(page)).toBeEditable();
  await composer(page).fill("draft a feature");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("log", { name: "Chat" })).toContainText("draft a feature");
  // The agent's turn ends with the tool's answer; only then is there a draft to show.
  await expect(page.getByRole("log", { name: "Chat" })).toContainText(`Tool said: Drafted ${id}`);
  const draft = pane(page, id);
  await expect(draft).toBeVisible();
  // The drafting turn has ended before the user answers it.
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  return draft;
}
