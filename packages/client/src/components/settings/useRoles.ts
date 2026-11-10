import { useEffect, useState } from "react";
import type { FeatraBridge } from "../../bridge.ts";
import type { RolesUpdate } from "../../roles-bridge.ts";

/** The project's roles, live: what the server last sent for `dir`, or null until it has. */
export function useRoles(bridge: FeatraBridge, dir: string | null): RolesUpdate | null {
  const [heard, setHeard] = useState<{ dir: string; update: RolesUpdate } | null>(null);
  useEffect(() => {
    if (!dir) return undefined;
    return bridge.roles.watch(dir, (update) => setHeard({ dir, update }));
  }, [bridge, dir]);
  return heard && heard.dir === dir ? heard.update : null;
}
