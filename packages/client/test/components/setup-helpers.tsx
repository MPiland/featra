/** Shared steps and queries for the project setup page tests (STORY-42). */
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import { sidebar } from "../harness.tsx";

export const PAGE = "Set up project";
export const RESULT = "Project is set up";
export const page = () => screen.queryByRole("region", { name: PAGE });
/** The page, once it has checked the project. */
export async function shown() {
  const region = await screen.findByRole("region", { name: PAGE });
  await waitFor(() => expect(region.getAttribute("aria-busy")).toBe("false"));
  return region;
}
export const result = () => screen.findByRole("region", { name: RESULT });
/** Work's list for the current project (a placeholder until its story lands). */
export const list = () => document.querySelector('main .placeholder[data-view="work"][data-project]');
export const button = async (name: string) => within(await shown()).getByRole("button", { name });
export const box = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });
/** The tag beside a row's checkbox ("Required", "Kept"), or null. */
export const tag = (name: string) =>
  box(name).closest(".setting-row")?.querySelector(".setup-tag")?.textContent ?? null;
/** A row's help text, as read beside its label. */
export const help = (name: string) => box(name).closest(".setting-row")?.querySelector(".setting-help")?.textContent;
/** Each result list's label and its paths, as the user reads them. */
export const lists = (region: HTMLElement) =>
  Array.from(region.querySelectorAll("dl > div")).map((row) => ({
    label: row.querySelector("dt")?.textContent,
    paths: Array.from(row.querySelectorAll("dd code")).map((c) => c.textContent),
  }));
/** Lets the app's status check settle before asserting nothing is shown. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Opens the project switcher and chooses a project. */
export async function switchTo(user: UserEvent, name: string) {
  await user.click(within(sidebar()).getByRole("button", { name: /^Switch project: / }));
  await user.click(within(screen.getByRole("menu", { name: "Projects" })).getByRole("menuitemradio", { name }));
}
