/** STORY-42: what the setup page offers and what one Set up sends, through the real App over a fake host. */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORK_SETTINGS } from "../../src/bridge.ts";
import { PROJECT, renderApp } from "../harness.tsx";
import { box, button, help, result, shown, tag } from "./setup-helpers.tsx";

afterEach(cleanup);

const KNOWLEDGE = ["CONTEXT.md", "decisions.md", "open-questions.md", "docs/adr/"];
const sectionNames = (region: HTMLElement) =>
  within(region)
    .getAllByRole("heading", { level: 3 })
    .map((h) => h.textContent);

describe("AC2: one screen offers git, the Featra folder, the knowledge files, a .gitignore and the workflow", () => {
  it("a plain folder: git and the Featra folder required, every file offered and ticked, a starter .gitignore", async () => {
    renderApp({ setup: { [PROJECT.dir]: { state: "no-git" } } });
    const region = await shown();
    expect(sectionNames(region)).toEqual(["Repository", "Project knowledge", "Workflow"]);
    for (const name of ["Git", "Featra folder"]) {
      expect(tag(name), name).toBe("Required");
      expect(box(name).checked && box(name).disabled, name).toBe(true);
    }
    expect(help("Git")).not.toBe("Already a git repository");
    for (const name of [...KNOWLEDGE, ".gitignore"]) {
      expect(tag(name), name).toBeNull();
      expect(box(name).checked, name).toBe(true);
      expect(box(name).disabled, name).toBe(false);
    }
  });

  it("a repository reads Already a git repository; a file that exists is kept and locked", async () => {
    renderApp({ setup: { [PROJECT.dir]: { state: "no-featra" } }, existing: { [PROJECT.dir]: ["context"] } });
    await shown();
    expect(help("Git")).toBe("Already a git repository");
    expect(tag("Git")).toBe("Required");
    expect(tag("CONTEXT.md")).toBe("Kept");
    expect(box("CONTEXT.md").checked && box("CONTEXT.md").disabled).toBe(true);
    expect(box("CONTEXT.md").getAttribute("aria-describedby")).toContain("setup-item-context-tag");
  });

  it("a project that has a .gitignore isn't offered one", async () => {
    renderApp({ setup: { [PROJECT.dir]: { state: "no-featra" } }, existing: { [PROJECT.dir]: ["gitignore"] } });
    await shown();
    expect(screen.queryByRole("checkbox", { name: ".gitignore" })).toBeNull();
  });

  it("the workflow settings are inline, starting from the app defaults", async () => {
    renderApp({
      setup: { [PROJECT.dir]: { state: "no-git" } },
      settings: { work: { ...DEFAULT_WORK_SETTINGS, progress: "tasks" } },
    });
    const region = await shown();
    const progress = within(region).getByRole("radiogroup", { name: "Feature progress" });
    expect(within(progress).getByRole<HTMLInputElement>("radio", { name: "Tasks" }).checked).toBe(true);
    expect(within(region).getByRole("switch", { name: "Require acceptance before Done" })).toBeTruthy();
  });
});

describe("AC3: one Set up does it all through the server", () => {
  it("sends only what is ticked; the server adds what is required", async () => {
    const { user, actions } = renderApp({ setup: { [PROJECT.dir]: { state: "no-git" } } });
    await shown();
    await user.click(box("open-questions.md"));
    await user.click(await button("Set up"));
    await result();
    expect(actions()).toEqual([`setup:${PROJECT.dir}:context,decisions,adr,gitignore`]);
  });

  it("asks for kept files too, so the result can list them as kept", async () => {
    const { user, actions } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-featra" } },
      existing: { [PROJECT.dir]: ["context", "gitignore"] },
    });
    await user.click(await button("Set up"));
    await result();
    expect(actions()).toEqual([`setup:${PROJECT.dir}:context,decisions,openQuestions,adr`]);
  });

  it("writes the workflow settings changed on the page to the project, after setup", async () => {
    const { user, projectFiles } = renderApp({ setup: { [PROJECT.dir]: { state: "no-git" } } });
    const region = await shown();
    await user.click(within(region).getByRole("radio", { name: "Tasks" }));
    expect(projectFiles.get(PROJECT.dir)).toBeUndefined();
    await user.click(await button("Set up"));
    await result();
    expect(projectFiles.get(PROJECT.dir)).toEqual({ progress: "tasks" });
  });

  it("a workflow change that is reset on the page isn't written", async () => {
    const { user, projectFiles } = renderApp({ setup: { [PROJECT.dir]: { state: "no-git" } } });
    const region = await shown();
    await user.click(within(region).getByRole("radio", { name: "Tasks" }));
    await user.click(within(region).getByRole("button", { name: "Reset Feature progress to the app default" }));
    await user.click(await button("Set up"));
    await result();
    expect(projectFiles.get(PROJECT.dir)).toBeUndefined();
  });

  it("a workflow setting that can't be saved is reported on the result step", async () => {
    const { user } = renderApp({
      setup: { [PROJECT.dir]: { state: "no-git" } },
      brokenProjects: { [PROJECT.dir]: "access denied" },
    });
    const region = await shown();
    await user.click(within(region).getByRole("radio", { name: "Tasks" }));
    await user.click(await button("Set up"));
    expect((await within(await result()).findByRole("alert")).textContent).toBe(
      "Can't save the workflow settings: access denied",
    );
  });
});
