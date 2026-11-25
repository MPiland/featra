/**
 * STORY-25 (the user's side): a story's card pane shows why a criterion has no screenshot, with the dev server's last
 * output folded away, and offers Preview when the project's proof does: it asks the server to start the story's dev
 * server and opens it in a Featra window. The real App over a fake host; the server's proof answers are the test's.
 */
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PROOF_COPY, type Card } from "@featra/work-format";
import { PROJECT, renderApp } from "../harness.tsx";
import type { HostOptions } from "../harness-options.ts";
import { cardOf, PLAN } from "../work-fixtures.ts";

afterEach(cleanup);

const STORY = "STORY-2";
const ACS = ["Settings show it", "Home shows it"] as const;
const withCriteria = (c: Card): Card => ({
  ...c,
  acs: [
    { text: ACS[0], done: true, test: null, page: "/settings" },
    { text: ACS[1], done: true, test: null },
  ],
});
const cards = (): Card[] => PLAN.map(cardOf).map((c) => (c.id === STORY ? withCriteria(c) : c));

async function openPane(host: HostOptions) {
  const app = renderApp({ cards: { [PROJECT.dir]: cards() }, ...host });
  await screen.findByRole("region", { name: "Work list" });
  await app.user.click(screen.getByRole("button", { name: "Cards and the feature list" }));
  await app.user.click(screen.getByRole("button", { name: "Open a folder" }));
  const pane = await screen.findByRole("complementary", { name: `${STORY} card` });
  return { ...app, pane };
}

const criterion = (scope: HTMLElement, text: string) => {
  const found = [...scope.querySelectorAll<HTMLElement>("li.ac")].find((li) => li.textContent?.includes(text));
  if (!found) throw new Error(`No criterion "${text}"`);
  return found;
};

describe("a screenshot Featra couldn't take is a note on its criterion", () => {
  it("says why next to the criterion, with the dev server's last output folded away", async () => {
    const { pane } = await openPane({
      cardProof: {
        [STORY]: { notes: { 0: { note: PROOF_COPY.notes.notStarted, output: "Error: Cannot find module 'vite'" } } },
      },
    });
    const first = criterion(pane, ACS[0]);
    const note = within(first).getByText(PROOF_COPY.notes.notStarted);
    expect(note.closest("details")).not.toBeNull();
    expect(within(first).getByText("Error: Cannot find module 'vite'").tagName).toBe("PRE");
    expect(within(criterion(pane, ACS[1])).queryByText(PROOF_COPY.notes.notStarted)).toBeNull();
  });

  it("shows a note without output as a line", async () => {
    const { pane } = await openPane({
      cardProof: { [STORY]: { notes: { 1: { note: PROOF_COPY.notes.unconfirmed } } } },
    });
    expect(within(criterion(pane, ACS[1])).getByText(PROOF_COPY.notes.unconfirmed)).toBeTruthy();
  });
});

describe("Preview", () => {
  it("starts the story's dev server and opens it in a Featra window", async () => {
    const { pane, user, calls } = await openPane({ cardProof: { [STORY]: { preview: true } } });
    await user.click(within(pane).getByRole("button", { name: PROOF_COPY.preview }));
    await waitFor(() => expect(calls).toContain(`openPreview:http://localhost:5173:${PROOF_COPY.previewTitle(STORY)}`));
    expect(calls).toContain(`previewStory:${PROJECT.dir}:${STORY}`);
  });

  it("says why when the dev server doesn't start, and opens nothing", async () => {
    const why = `${PROOF_COPY.notes.notStarted}\nError: Cannot find module 'vite'`;
    const { pane, user, calls } = await openPane({
      cardProof: { [STORY]: { preview: true } },
      review: { previewStory: async () => ({ ok: false, error: why }) },
    });
    await user.click(within(pane).getByRole("button", { name: PROOF_COPY.preview }));
    expect((await within(pane).findByRole("alert")).textContent).toBe(why);
    expect(calls.some((c) => c.startsWith("openPreview:"))).toBe(false);
  });

  it("isn't offered when the project's proof leaves it out", async () => {
    const { pane } = await openPane({});
    expect(within(pane).queryByRole("button", { name: PROOF_COPY.preview })).toBeNull();
  });
});
