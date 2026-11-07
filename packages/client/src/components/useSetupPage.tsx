import { useCallback, useEffect, useState } from "react";
import type { FeatraBridge } from "../bridge.ts";
import type { InitResult, SetupItemId, SetupPlan } from "../project-setup.ts";
import { WORK_SETTING_KEYS, type WorkOverrides, type WorkSettingKey, type WorkSettings } from "../settings.ts";
import { initialChoice, itemsToSet } from "../setup-page.ts";

type ReadyPlan = Extract<SetupPlan, { ok: true }>;
type Done = Extract<InitResult, { ok: true }>;

/** Where the page stands: checking the project, can't, offering setup (maybe running it), or showing the result. */
export type SetupPhase =
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "offer"; plan: ReadyPlan; running: boolean; error: string | null }
  | { kind: "done"; result: Done; workflowError: string | null };

/**
 * Writes the workflow settings the user changed on the page to the project's config, through the same storage
 * Settings > Project uses. Answers with the first error, or null.
 */
async function saveWorkflow(bridge: FeatraBridge, dir: string, from: WorkOverrides, to: WorkOverrides) {
  for (const key of WORK_SETTING_KEYS) {
    if (from[key] === to[key]) continue;
    const saved = await bridge.settings.setProjectValue(dir, key, to[key] ?? null);
    if (saved.error) return saved.error;
  }
  return null;
}

/**
 * One project's setup page: the server's plan, what the user ticked, the workflow settings they changed, and the one
 * Set up that does it all. The settings are written after setup, once `.featra/config.yaml` exists.
 */
export function useSetupPage(bridge: FeatraBridge, dir: string) {
  const [phase, setPhase] = useState<SetupPhase>({ kind: "loading" });
  const [choice, setChoice] = useState<ReadonlySet<SetupItemId>>(() => new Set());
  // The project's overrides as read, and as the user has them on the page.
  const [stored, setStored] = useState<WorkOverrides>({});
  const [overrides, setOverrides] = useState<WorkOverrides>({});
  // Reads the plan and the project's settings together. The page is keyed by project, so `dir` never changes here.
  const load = useCallback(
    (isLive: () => boolean) =>
      Promise.all([bridge.setup.plan(dir), bridge.settings.loadProject(dir)]).then(([plan, settings]) => {
        if (!isLive()) return;
        if (!plan.ok) return setPhase({ kind: "error", error: plan.error });
        setChoice(initialChoice(plan));
        setStored(settings.overrides);
        setOverrides(settings.overrides);
        setPhase({ kind: "offer", plan, running: false, error: null });
      }),
    [bridge, dir],
  );
  useEffect(() => {
    let live = true;
    void load(() => live);
    return () => {
      live = false;
    };
  }, [load]);

  const retry = useCallback(() => {
    setPhase({ kind: "loading" });
    void load(() => true);
  }, [load]);
  const toggle = useCallback((id: SetupItemId, on: boolean) => {
    setChoice((c) => {
      const next = new Set(c);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const setValue = useCallback((key: WorkSettingKey, value: WorkSettings[WorkSettingKey] | null) => {
    setOverrides((o) => {
      const { [key]: _old, ...rest } = o;
      return value === null ? rest : { ...rest, [key]: value };
    });
  }, []);

  const setUp = useCallback(async () => {
    if (phase.kind !== "offer" || phase.running) return;
    setPhase({ ...phase, running: true, error: null });
    const result = await bridge.setup.run(dir, itemsToSet(phase.plan, choice));
    if (!result.ok) return setPhase({ ...phase, running: false, error: result.error });
    const workflowError = await saveWorkflow(bridge, dir, stored, overrides);
    setPhase({ kind: "done", result, workflowError });
  }, [bridge, dir, phase, choice, stored, overrides]);

  return { phase, choice, overrides, retry, toggle, setValue, setUp };
}
