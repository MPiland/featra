/**
 * STORY-25 (the user's side): Project settings' Proof section shows the project's proof, the answer to the question
 * asked when its first feature was shaped, and changes it; it sets the dev server Featra starts and where the tests
 * write screenshots, and confirms a dev-server command changed through git.
 */
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DESIGN_REVIEW_COPY, type ProofView } from "@featra/work-format";
import { PROOF_PAGE_COPY as COPY } from "../../../src/proof-bridge.ts";
import { PROJECT, renderApp } from "../../harness.tsx";
import { NO_PROOF } from "../../checks-server.ts";
import { main, openSettings, WORK } from "./helpers.tsx";

afterEach(cleanup);

const SET: ProofView = {
  proof: "both",
  devServerCommand: "pnpm dev --port {port}",
  devServerUrl: "http://localhost:5173",
  testScreenshots: null,
  designReview: true,
  unconfirmed: false,
  error: null,
};

async function open(view: ProofView) {
  const app = renderApp({ proofs: { [PROJECT.dir]: view } });
  await openSettings(app.user, WORK);
  const section = await within(main()).findByRole("region", { name: COPY.title });
  return { ...app, section };
}
const input = (section: HTMLElement, name: string) => within(section).getByRole<HTMLInputElement>("textbox", { name });
const mode = (section: HTMLElement, name: string) => within(section).getByRole<HTMLInputElement>("radio", { name });

describe("AC1: the project's proof is a setting", () => {
  it("shows the answer to the proof question, and changes it", async () => {
    const { section, user, calls } = await open(SET);
    expect(mode(section, "Both").checked).toBe(true);
    await user.click(mode(section, "Screenshots"));
    await waitFor(() => expect(calls).toContain(`proof.set:${PROJECT.dir}:{"proof":"screenshots"}`));
    expect(mode(section, "Screenshots").checked).toBe(true);
  });

  it("shows the chosen proof at once, before the save answers", async () => {
    const { section, calls } = await open(SET);
    fireEvent.click(mode(section, "Preview"));
    expect(mode(section, "Preview").checked).toBe(true);
    await waitFor(() => expect(calls).toContain(`proof.set:${PROJECT.dir}:{"proof":"preview"}`));
    expect(mode(section, "Preview").checked).toBe(true);
  });

  it("says it isn't chosen until the question is answered", async () => {
    const { section } = await open(NO_PROOF);
    expect(within(section).getByText(COPY.notChosen)).toBeTruthy();
    expect(COPY.modes.map((m) => mode(section, m.label).checked)).toEqual([false, false, false, false]);
  });
});

describe("the dev server and the tests' screenshots", () => {
  it("saves only what changed, and an emptied field clears it", async () => {
    const { section, user, calls } = await open(SET);
    const save = within(section).getByRole<HTMLButtonElement>("button", { name: COPY.save });
    expect(save.disabled).toBe(true);
    expect(input(section, COPY.command).value).toBe("pnpm dev --port {port}");
    await user.clear(input(section, COPY.url));
    await user.type(input(section, COPY.shots), "test-results/shots");
    await user.click(save);
    await waitFor(() =>
      expect(calls).toContain(`proof.set:${PROJECT.dir}:{"devServerUrl":null,"testScreenshots":"test-results/shots"}`),
    );
    expect(await within(section).findByText(COPY.saved)).toBeTruthy();
    expect(save.disabled).toBe(true);
  });

  it("keeps a field being typed when the proof's own save answers", async () => {
    const { section, calls } = await open(SET);
    fireEvent.click(mode(section, "Screenshots"));
    fireEvent.change(input(section, COPY.command), { target: { value: "node serve.mjs {port}" } });
    await waitFor(() => expect(calls).toContain(`proof.set:${PROJECT.dir}:{"proof":"screenshots"}`));
    await waitFor(() => expect(mode(section, "Screenshots").checked).toBe(true));
    expect(input(section, COPY.command).value).toBe("node serve.mjs {port}");
    expect(within(section).getByRole<HTMLButtonElement>("button", { name: COPY.save }).disabled).toBe(false);
  });

  it("asks to confirm a command changed outside Featra, which doesn't run until then", async () => {
    const { section, user, calls } = await open({ ...SET, devServerCommand: "npm run dev", unconfirmed: true });
    expect(within(section).getByText(`${COPY.changed}:`)).toBeTruthy();
    await user.click(within(section).getByRole("button", { name: COPY.confirm }));
    await waitFor(() => expect(calls).toContain(`proof.set:${PROJECT.dir}:{"confirm":true}`));
    await waitFor(() => expect(within(section).queryByRole("button", { name: COPY.confirm })).toBeNull());
  });

  it("shows why the section couldn't be read or saved", async () => {
    const { section } = await open({ ...NO_PROOF, error: "Couldn't read the project's proof settings." });
    expect(within(section).getByRole("alert").textContent).toBe("Couldn't read the project's proof settings.");
  });
});

const toggle = (section: HTMLElement) =>
  within(section).getByRole<HTMLButtonElement>("switch", { name: DESIGN_REVIEW_COPY.setting });

describe("STORY-73 AC4: the project can turn the design review off", () => {
  it("is on next to the proof when it captures screenshots, and turns off and on again", async () => {
    const { section, user, calls } = await open(SET);
    expect(toggle(section).getAttribute("aria-checked")).toBe("true");
    expect(within(section).getByText(DESIGN_REVIEW_COPY.settingHint)).toBeTruthy();
    await user.click(toggle(section));
    await waitFor(() => expect(calls).toContain(`proof.set:${PROJECT.dir}:{"designReview":false}`));
    expect(toggle(section).getAttribute("aria-checked")).toBe("false");
    await user.click(toggle(section));
    await waitFor(() => expect(calls).toContain(`proof.set:${PROJECT.dir}:{"designReview":true}`));
    expect(toggle(section).getAttribute("aria-checked")).toBe("true");
  });

  it("is off for a project whose proof doesn't capture screenshots", async () => {
    const { section } = await open(NO_PROOF);
    expect(toggle(section).getAttribute("aria-checked")).toBe("false");
  });
});
