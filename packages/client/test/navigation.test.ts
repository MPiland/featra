import { describe, expect, it } from "vitest";
import {
  canGoBack,
  canGoForward,
  chatEntry,
  currentView,
  entryChat,
  entryView,
  goBack,
  goForward,
  initialNav,
  leaveChats,
  navigate,
} from "../src/navigation.ts";

describe("view history", () => {
  it("starts on Work with nowhere to go", () => {
    const nav = initialNav();
    expect(currentView(nav)).toBe("work");
    expect(canGoBack(nav)).toBe(false);
    expect(canGoForward(nav)).toBe(false);
  });

  it("goes back and forward through opened views", () => {
    let nav = navigate(navigate(initialNav(), "inbox"), "settings");
    nav = goBack(nav);
    expect(currentView(nav)).toBe("inbox");
    expect(canGoForward(nav)).toBe(true);
    nav = goBack(nav);
    expect(currentView(nav)).toBe("work");
    expect(canGoBack(nav)).toBe(false);
    nav = goForward(goForward(nav));
    expect(currentView(nav)).toBe("settings");
    expect(canGoForward(nav)).toBe(false);
  });

  it("drops forward entries when a new view is opened after going back", () => {
    let nav = navigate(navigate(initialNav(), "inbox"), "settings");
    nav = navigate(goBack(nav), "plugins");
    expect(nav.entries).toEqual(["work", "inbox", "plugins"]);
    expect(canGoForward(nav)).toBe(false);
  });

  it("does not add an entry when the current view is opened again", () => {
    const nav = navigate(initialNav(), "inbox");
    expect(navigate(nav, "inbox")).toBe(nav);
  });

  it("ignores back at the start and forward at the end", () => {
    const nav = initialNav();
    expect(goBack(nav)).toBe(nav);
    expect(goForward(nav)).toBe(nav);
  });
});

describe("STORY-21: chats in the history", () => {
  it("names a chat by its id and tells it from a view", () => {
    expect(entryChat(chatEntry("c1"))).toBe("c1");
    expect(entryView(chatEntry("c1"))).toBeNull();
    expect(entryChat("work")).toBeNull();
    expect(entryView("work")).toBe("work");
  });

  it("goes back from a chat to the view before it, and re-opening the same chat is a no-op", () => {
    const nav = navigate(navigate(initialNav(), chatEntry("c1")), chatEntry("c2"));
    expect(navigate(nav, chatEntry("c2"))).toBe(nav);
    expect(currentView(goBack(nav))).toBe("chat:c1");
    expect(currentView(goBack(goBack(nav)))).toBe("work");
  });

  it("leaves the old project's chats when the project changes: a chat in front gives way to Work", () => {
    const onChat = navigate(navigate(navigate(initialNav(), "inbox"), chatEntry("c1")), "settings");
    const back = goBack(onChat);
    expect(leaveChats(back)).toEqual({ entries: ["work", "inbox", "work"], index: 2 });
    expect(leaveChats(onChat)).toEqual({ entries: ["work", "inbox", "settings"], index: 2 });
  });

  it("keeps the place in a history that has no chats, and drops repeats the chats left behind", () => {
    const views = navigate(initialNav(), "inbox");
    expect(leaveChats(views)).toBe(views);
    const between = navigate(navigate(navigate(initialNav(), "inbox"), chatEntry("c1")), "inbox");
    expect(leaveChats(goBack(goBack(between)))).toEqual({ entries: ["work", "inbox"], index: 1 });
  });
});
