import type { ProjectRef } from "../projects.ts";
import type { ViewDef } from "../views.ts";
import { ViewIcon } from "./icons.tsx";

/** Stands in for a view until the story that builds it lands. A project view names the folder it shows. */
export function ViewPlaceholder({ view, project }: { view: ViewDef; project?: ProjectRef }) {
  return (
    <section className="placeholder" data-view={view.id} data-project={project?.dir}>
      <ViewIcon view={view.id} size={28} />
      <p>{view.placeholder}</p>
    </section>
  );
}
