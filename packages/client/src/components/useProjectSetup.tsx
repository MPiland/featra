import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import type { ProjectSetup } from "../project-setup.ts";
import type { WorkSettings } from "../settings.ts";
import { ProjectSetupPage } from "./ProjectSetupPage.tsx";

/** A status is kept with the project it belongs to, so switching projects never shows another one's. */
interface ForDir<T> {
  dir: string;
  value: T;
}

export interface ProjectSetupControl {
  /** The setup page for the current project, or null when Work should show its list. */
  setupPage: ReactNode;
  /** Shows the setup page for a project again (Project settings > Set up project). */
  openSetup: (dir: string) => void;
}

/**
 * When the current project gets the setup page (STORY-42). The server's status is checked whenever the project
 * changes; a project that isn't set up shows the page until it is skipped or set up. Skip lasts until Featra
 * restarts. Done closes the page; it comes back only when reopened from Project settings.
 */
export function useProjectSetup(bridge: FeatraBridge, dir: string | null, defaults: WorkSettings): ProjectSetupControl {
  const [checked, setChecked] = useState<ForDir<ProjectSetup> | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  // The project whose page was reopened from settings, and how often, so each reopen starts afresh.
  const [reopened, setReopened] = useState<ForDir<number> | null>(null);
  const folders = bridge.platform !== "web";

  const check = useCallback(
    (project: string, isLive: () => boolean = () => true) =>
      void bridge.setup.status(project).then((value) => isLive() && setChecked({ dir: project, value })),
    [bridge],
  );
  useEffect(() => {
    if (!dir || !folders) return undefined;
    let live = true;
    check(dir, () => live);
    return () => {
      live = false;
    };
  }, [check, dir, folders]);

  const close = useCallback((project: string) => {
    setReopened((r) => (r?.dir === project ? null : r));
  }, []);
  const skip = useCallback(() => {
    if (!dir) return;
    setSkipped((s) => new Set(s).add(dir));
    close(dir);
  }, [dir, close]);
  const done = useCallback(() => {
    if (!dir) return;
    // Set up now; the server's answer follows. Either way the page waits for a reopen from settings.
    setChecked({ dir, value: { state: "ready" } });
    setSkipped((s) => new Set(s).add(dir));
    close(dir);
    check(dir);
  }, [dir, close, check]);
  const openSetup = useCallback((project: string) => {
    setSkipped((s) => {
      const next = new Set(s);
      next.delete(project);
      return next;
    });
    setReopened((r) => ({ dir: project, value: r?.dir === project ? r.value + 1 : 1 }));
  }, []);

  const forced = reopened !== null && reopened.dir === dir;
  const needed = checked?.dir === dir && checked.value.state !== "ready" && !skipped.has(dir ?? "");
  const show = dir !== null && folders && (forced || needed);
  return {
    setupPage: show ? (
      <ProjectSetupPage
        key={`${dir}:${forced ? reopened.value : 0}`}
        bridge={bridge}
        dir={dir}
        defaults={defaults}
        onSkip={skip}
        onDone={done}
      />
    ) : null,
    openSetup,
  };
}
