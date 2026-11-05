import type { ViewDef } from "../views.ts";
import { ViewIcon } from "./icons.tsx";

/** Stands in for a view until the story that builds it lands. */
export function ViewPlaceholder({ view }: { view: ViewDef }) {
  return (
    <section className="placeholder" data-view={view.id}>
      <ViewIcon view={view.id} size={28} />
      <p>{view.placeholder}</p>
    </section>
  );
}
