import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { FeatraBridge } from "../bridge.ts";
import type { ProjectSetup } from "../project-setup.ts";
import { SetupOffer } from "./SetupOffer.tsx";

/** Each result is kept with the project it belongs to, so switching projects never shows another one's. */
interface ForDir<T> {
  dir: string;
  value: T;
}

/**
 * The current project's setup, checked with the server whenever the project changes (opened, created or switched
 * to), and the offer to take the next step. "Not now" hides the offer for that project until Featra restarts.
 */
export function useProjectSetup(bridge: FeatraBridge, dir: string | null): ReactNode {
  const [checked, setChecked] = useState<ForDir<ProjectSetup> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ForDir<string> | null>(null);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const folders = bridge.platform !== "web";

  useEffect(() => {
    if (!dir || !folders) return undefined;
    let live = true;
    void bridge.setup.status(dir).then((value) => live && setChecked({ dir, value }));
    return () => {
      live = false;
    };
  }, [bridge, dir, folders]);

  /** Runs one setup step on the current project; shows its new status, or why it failed. */
  const step = useCallback(
    async (run: (project: string) => Promise<ProjectSetup | { error: string }>) => {
      if (!dir) return;
      setBusy(true);
      setError(null);
      const outcome = await run(dir);
      setBusy(false);
      if ("error" in outcome) setError({ dir, value: outcome.error });
      else setChecked({ dir, value: outcome });
    },
    [dir],
  );
  const initGit = useCallback(
    () =>
      void step(async (project) => {
        const setup = await bridge.setup.initGit(project);
        return setup.state === "error" ? { error: setup.error } : setup;
      }),
    [bridge, step],
  );
  const initFeatra = useCallback(
    () =>
      void step(async (project) => {
        const result = await bridge.setup.initFeatra(project);
        return result.ok ? bridge.setup.status(project) : { error: result.error };
      }),
    [bridge, step],
  );
  const dismiss = useCallback(() => {
    if (dir) setDismissed((d) => new Set(d).add(dir));
  }, [dir]);

  if (!dir || checked?.dir !== dir || dismissed.has(dir)) return null;
  return (
    <SetupOffer
      setup={checked.value}
      busy={busy}
      error={error?.dir === dir ? error.value : null}
      onInitGit={initGit}
      onInitFeatra={initFeatra}
      onDismiss={dismiss}
    />
  );
}
