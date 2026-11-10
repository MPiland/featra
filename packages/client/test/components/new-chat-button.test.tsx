/**
 * BUG-13: the sidebar's New chat control reads as a button (a nav row with a "+"), not as a text input. Through the
 * real App; only the host is faked. Looks that CSS decides (hover, focus ring) are checked by their selectors in
 * the shipped stylesheets, since jsdom does no cascade for them.
 */
import { cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_COPY } from "../../src/chats.ts";
import { shortcutLabel } from "../../src/shortcuts.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

const newChat = () => screen.getByRole("button", { name: CHAT_COPY.newChat });
const css = (f: string) => readFileSync(join(import.meta.dirname, "../../src/styles", f), "utf8");

describe("AC1: New chat reads as a nav-row button", () => {
  it("is a nav row with a + icon and the label, with no input-like border", () => {
    renderApp();
    const b = newChat();
    expect(b.classList.contains("nav")).toBe(true);
    expect(b.closest("ul")?.classList.contains("navlist")).toBe(true);
    expect(b.querySelector("svg.i")).not.toBeNull();
    expect(b.textContent).toContain(CHAT_COPY.newChat);
    const rule = /\.new-chat\s*\{[^}]*\}/.exec(css("chat.css"))?.[0] ?? "";
    expect(rule).not.toMatch(/border/);
  });

  it("carries the new-chat shortcut as a hint outside the button name", () => {
    renderApp({ platform: "darwin" });
    expect(newChat().getAttribute("data-shortcut")).toBe(shortcutLabel("newChat", "darwin"));
    expect(newChat().textContent).toBe(CHAT_COPY.newChat);
  });
});

describe("AC2: hover, focus and disabled states", () => {
  it("shows the hint on hover and focus, and shares the nav rows' hover and focus ring", () => {
    expect(css("chat.css")).toMatch(/\.new-chat:hover::after,\s*\.new-chat:focus-visible::after\s*\{[^}]*opacity: 1/);
    expect(css("shell.css")).toMatch(/\.nav:hover\s*\{[^}]*background/);
    expect(css("titlebar.css")).toMatch(/\.nav:focus-visible/);
  });

  it("is disabled, and styled as disabled, with no project open", () => {
    renderApp({ project: null });
    expect((newChat() as HTMLButtonElement).disabled).toBe(true);
    expect(css("chat.css")).toMatch(/\.nav\.new-chat:disabled[^{]*\{[^}]*opacity/);
  });
});

describe("AC3: it still opens the New chat dialog", () => {
  it("opens the dialog when clicked", async () => {
    const app = renderApp();
    await app.user.click(newChat());
    expect(await screen.findByRole("dialog", { name: CHAT_COPY.newChat })).toBeTruthy();
  });
});
