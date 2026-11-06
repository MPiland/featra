import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { titleBar } from "./harness.tsx";

/** Helpers for the title bar's app menu, shared by its tests. */
export const menuButton = () => within(titleBar()).getByRole("button", { name: "Menu" });
export const menus = () => screen.queryAllByRole("menu");
export const menuAt = (depth: number) => menus()[depth] as HTMLElement;
/** Text of the items directly in a menu (not those of its open submenus): label followed by shortcut. */
export const labels = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>("[role^=menuitem]"))
    .filter((i) => i.closest("[role=menu]") === menu)
    .map((i) => i.textContent);
export const item = (name: string | RegExp | ((accessibleName: string) => boolean)) =>
  screen.queryByRole("menuitem", { name }) ?? screen.getByRole("menuitemcheckbox", { name });

/** Opens the menu (if closed) and hovers through the named submenus. */
export async function openPath(user: UserEvent, ...names: string[]) {
  if (menus().length === 0) await user.click(menuButton());
  for (const name of names) await user.hover(item(name));
}
