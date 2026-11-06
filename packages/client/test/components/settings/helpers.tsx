/** Shared steps and queries for the Settings tests (STORY-20). */
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import { sidebar } from "../../harness.tsx";

export const main = () => screen.getByRole("main");
export const pageNav = () => within(main()).getByRole("navigation", { name: "Settings pages" });
export const pageTitle = () => within(main()).getByRole("heading", { level: 2 }).textContent;
export const radios = (group: string) => within(screen.getByRole("radiogroup", { name: group })).getAllByRole("radio");
export const checked = (group: string) =>
  (radios(group).find((r) => (r as HTMLInputElement).checked)?.closest("label")?.textContent ?? null);
export const row = (control: HTMLElement) => control.closest(".setting-row") as HTMLElement;
export const WORK = "Workflow";
/** App and Project both have a "Workflow" page: a page is found within its scope's list. */
export const navButton = (name: string, scope: "App" | "Project" = name === WORK ? "Project" : "App") =>
  within(within(pageNav()).getByRole("list", { name: scope })).getByRole("button", { name });
/** The text a screen reader reads as the control's description. */
export const description = (el: HTMLElement) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)!.textContent)
    .join(" ");
export const switchFor = (name: string) => screen.getByRole("switch", { name });
export const isOn = (el: HTMLElement) => el.getAttribute("aria-checked") === "true";
/** The Project page has read the project's config file. */
export const projectLoaded = () => waitFor(() => expect(main().querySelector('[aria-busy="true"]')).toBeNull());
export const picker = () => within(main()).getByRole("button", { name: /^Project: / });

export async function openSettings(user: UserEvent, page?: string, scope?: "App" | "Project") {
  await user.click(within(sidebar()).getByRole("button", { name: "Settings" }));
  if (page) await user.click(navButton(page, scope));
  if (page === WORK && scope !== "App") await projectLoaded();
}

/** Tabs forward from the current focus until it leaves `scope`, collecting every stop inside it. */
export async function tabStops(user: UserEvent, scope: HTMLElement): Promise<HTMLElement[]> {
  const stops: HTMLElement[] = [];
  for (let i = 0; i < 60; i++) {
    await user.tab();
    const el = document.activeElement as HTMLElement;
    if (!scope.contains(el)) break;
    stops.push(el);
  }
  return stops;
}
