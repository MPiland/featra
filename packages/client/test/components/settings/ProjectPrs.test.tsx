/**
 * STORY-11 (the user's side): Project settings' Pull requests section says in one line what GitHub is missing in local
 * mode, turns "Open story PRs automatically" off and on, and sets how often open PRs are read again.
 */
import { cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GITHUB_COPY, type ChecksView } from "@featra/work-format";
import { NO_CHECKS } from "../../checks-server.ts";
import { PROJECT, renderApp } from "../../harness.tsx";
import { isOn, main, openSettings, WORK } from "./helpers.tsx";

afterEach(cleanup);

const USABLE: ChecksView = { ...NO_CHECKS, github: { usable: true, missing: null } };

async function open(view: ChecksView = USABLE) {
  const app = renderApp({ checks: { [PROJECT.dir]: view } });
  await openSettings(app.user, WORK);
  const section = await within(main()).findByRole("region", { name: "Pull requests" });
  return { ...app, section };
}
const minutes = (section: HTMLElement) =>
  within(section).getByRole<HTMLInputElement>("spinbutton", { name: "Refresh open PRs every" });

describe("AC1: local mode", () => {
  it("says in one line what is missing, and nothing when GitHub is usable", async () => {
    const local = await open({ ...USABLE, github: { usable: false, missing: GITHUB_COPY.signedOut } });
    expect(within(local.section).getByText(GITHUB_COPY.signedOut)).toBeTruthy();
    cleanup();
    const usable = await open();
    for (const line of Object.values(GITHUB_COPY)) expect(within(usable.section).queryByText(line)).toBeNull();
  });
});

describe("AC2: Open story PRs automatically", () => {
  it("is on by default and the user turns it off", async () => {
    const { section, user, calls } = await open();
    const toggle = within(section).getByRole("switch", { name: "Open story PRs automatically" });
    expect(isOn(toggle)).toBe(true);
    await user.click(toggle);
    await waitFor(() => expect(calls).toContain(`checks.set:${PROJECT.dir}:{"openStoryPrs":false}`));
    expect(isOn(toggle)).toBe(false);
  });
});

describe("STORY-14 AC2: Open feature PRs automatically", () => {
  it("is on by default and the user turns it off", async () => {
    const { section, user, calls } = await open();
    const toggle = within(section).getByRole("switch", { name: "Open feature PRs automatically" });
    expect(isOn(toggle)).toBe(true);
    await user.click(toggle);
    await waitFor(() => expect(calls).toContain(`checks.set:${PROJECT.dir}:{"openFeaturePrs":false}`));
    expect(isOn(toggle)).toBe(false);
  });
});

describe("AC4: how often open PRs are read again", () => {
  it("shows 2 minutes by default and saves a new interval", async () => {
    const { section, user, calls } = await open();
    expect(minutes(section).value).toBe("2");
    await user.clear(minutes(section));
    await user.type(minutes(section), "5{Enter}");
    await waitFor(() => expect(calls).toContain(`checks.set:${PROJECT.dir}:{"prRefreshMinutes":5}`));
    expect(minutes(section).value).toBe("5");
  });

  it("refuses an interval outside 1 to 60 whole minutes and saves nothing", async () => {
    const { section, user, calls } = await open();
    for (const bad of ["0", "61", "1.5"]) {
      await user.clear(minutes(section));
      await user.type(minutes(section), `${bad}{Enter}`);
      expect((await within(section).findByRole("alert")).textContent).toBe("Use whole minutes from 1 to 60.");
    }
    expect(calls.some((c) => c.includes("prRefreshMinutes"))).toBe(false);
  });
});
