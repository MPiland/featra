import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "@featra/work-format";
import { DEFAULT_APP_SETTINGS, DEFAULT_WORK_SETTINGS } from "@featra/client/bridge";
import { createSettingsStore, readProjectSettings, writeProjectValue } from "../src/settings-store.ts";
import { createUiStateStore } from "../src/ui-state-store.ts";

/** Real stores against temporary folders: a userData folder and a project folder. */
let userData: string;
let project: string;
beforeEach(async () => {
  userData = await mkdtemp(join(tmpdir(), "featra-settings-"));
  project = await mkdtemp(join(tmpdir(), "featra-project-"));
  await mkdir(join(project, ".featra"));
});
afterEach(async () => {
  await rm(userData, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

const configText = () => readFile(join(project, ".featra", "config.yaml"), "utf8");

describe("AC2: app settings are stored in the user's config folder", () => {
  it("as settings.json in userData; a restarted app reads them back", async () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      closeButton: "quit" as const,
      work: { ...DEFAULT_WORK_SETTINGS, progress: "tasks" as const },
    };
    const store = createSettingsStore(userData);
    expect(store.file).toBe(join(userData, "settings.json"));
    await store.save(settings);
    expect(JSON.parse(await readFile(join(userData, "settings.json"), "utf8"))).toEqual(settings);
    expect(await createSettingsStore(userData).load()).toEqual(settings);
  });

  it("first launch: the defaults (close keeps Featra running, System theme)", async () => {
    expect(await createSettingsStore(userData).load()).toEqual(DEFAULT_APP_SETTINGS);
    expect(DEFAULT_APP_SETTINGS.closeButton).toBe("tray");
  });

  it("a corrupt file falls back to the defaults instead of breaking startup", async () => {
    await writeFile(join(userData, "settings.json"), "{ half", "utf8");
    expect(await createSettingsStore(userData).load()).toEqual(DEFAULT_APP_SETTINGS);
  });
});

describe("AC8: the theme survives a restart", () => {
  it("a restarted app reads back the theme the last one saved", async () => {
    await createSettingsStore(userData).save({ ...DEFAULT_APP_SETTINGS, theme: "dark" });
    expect((await createSettingsStore(userData).load()).theme).toBe("dark");
  });

  it("a theme pinned before STORY-20 (in ui-state.json) carries over once; the settings file wins after that", async () => {
    await writeFile(
      join(userData, "ui-state.json"),
      JSON.stringify({ sidebarCollapsed: true, zoomFactor: 1, theme: "light" }),
    );
    expect((await createSettingsStore(userData).load()).theme).toBe("light");
    expect(await createUiStateStore(userData).load()).toEqual({ sidebarCollapsed: true, zoomFactor: 1 });
    await createSettingsStore(userData).save({ ...DEFAULT_APP_SETTINGS, theme: "system" });
    expect((await createSettingsStore(userData).load()).theme).toBe("system");
  });
});

describe("AC2: project settings are stored in the project's .featra/config.yaml", () => {
  it("an override is written to config.yaml, keeping the file's other keys and comments", async () => {
    const before =
      "# Featra project settings\nversion: 1\nhierarchy: epic-feature-story-task\nbaseBranch: main\nmcp: true # tools for agents\n";
    await writeFile(join(project, ".featra", "config.yaml"), before);
    const result = await writeProjectValue(project, "progress", "tasks");
    expect(result).toEqual({ dir: project, overrides: { progress: "tasks" }, error: null });
    expect(await configText()).toBe(`${before}progress: tasks\n`);
    expect(parseConfig(await configText()).progress).toBe("tasks");
  });

  it("a project with no config file yet gets one", async () => {
    await writeProjectValue(project, "worktrees", false);
    expect(await configText()).toBe("# Featra project settings\nversion: 1\nworktrees: false\n");
    expect(await readProjectSettings(project)).toEqual({ dir: project, overrides: { worktrees: false }, error: null });
  });

  it("a reset removes the key, so the app default applies again", async () => {
    await writeProjectValue(project, "knowledge", "edit");
    await writeProjectValue(project, "requireAccept", false);
    const result = await writeProjectValue(project, "knowledge", null);
    expect(result.overrides).toEqual({ requireAccept: false });
    expect(await configText()).not.toMatch(/knowledge/);
  });

  it("quick changes land in order", async () => {
    await Promise.all([
      writeProjectValue(project, "progress", "tasks"),
      writeProjectValue(project, "progress", "stories"),
      writeProjectValue(project, "progress", "tasks"),
    ]);
    expect((await readProjectSettings(project)).overrides).toEqual({ progress: "tasks" });
  });

  it("only work settings count as overrides; the project's other keys are not app defaults", async () => {
    await writeFile(join(project, ".featra", "config.yaml"), "version: 1\nbaseBranch: trunk\nrequireAccept: false\n");
    expect((await readProjectSettings(project)).overrides).toEqual({ requireAccept: false });
  });

  it("a config file that isn't valid is reported and left untouched", async () => {
    const broken = "progress: effort\n";
    await writeFile(join(project, ".featra", "config.yaml"), broken);
    expect((await readProjectSettings(project)).error).toMatch(/progress must be/);
    const result = await writeProjectValue(project, "worktrees", false);
    expect(result.error).toMatch(/progress must be/);
    expect(await configText()).toBe(broken);
  });
});
