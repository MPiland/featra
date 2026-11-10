import { useState } from "react";
import type { FeatraBridge } from "../../bridge.ts";
import type { ProjectsSnapshot } from "../../projects.ts";
import type { RoleEdit } from "../../roles-bridge.ts";
import { roleGroups, roleMeta, ROLES_COPY, sourceTag } from "../../roles-page.ts";
import { Dropdown } from "../controls/Dropdown.tsx";
import { NewRole } from "./NewRole.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { RoleEditor } from "./RoleEditor.tsx";
import { useRoles } from "./useRoles.ts";

export interface RolesPageProps {
  bridge: FeatraBridge;
  /** The picker lists every known project and starts on the current one. */
  projects: ProjectsSnapshot;
  title: string;
}

/** The Project scope's Roles page: every role a chat can start from, and the edits to the project's own. */
export function RolesPage({ bridge, projects, title }: RolesPageProps) {
  const [dir, setDir] = useState(projects.current?.dir ?? projects.projects[0]?.dir ?? null);
  const [chosen, setChosen] = useState<string | null>(null);
  const heard = useRoles(bridge, dir);
  if (!dir) {
    return (
      <>
        <PageHeader title={title} />
        <p className="settings-intro">{ROLES_COPY.none}</p>
      </>
    );
  }
  const roles = heard?.list.roles ?? [];
  const selected = roles.find((r) => r.id === chosen) ?? null;
  const edit = async (change: RoleEdit) => {
    const result = await bridge.roles.edit(dir, change);
    // The role an edit made is the one to show next; a deleted one leaves nothing chosen.
    if (result.ok) setChosen(change.action === "delete" ? null : result.id);
    return result;
  };
  return (
    <div aria-busy={!heard}>
      <PageHeader title={title}>
        <Dropdown
          name="Project"
          value={dir}
          options={projects.projects.map((p) => ({ value: p.dir, label: p.name }))}
          onChange={(next) => {
            setDir(next);
            setChosen(null);
          }}
        />
        <NewRole onCreate={(name) => edit({ action: "create", name })} />
      </PageHeader>
      <p className="settings-intro">
        {ROLES_COPY.intro} {ROLES_COPY.providerIntro}
      </p>
      {heard?.error && (
        <p role="alert" className="setting-error">
          {heard.error}
        </p>
      )}
      {heard && heard.list.problems.length > 0 && (
        <div role="alert" className="setting-error">
          <p>{ROLES_COPY.problems}</p>
          <ul>
            {heard.list.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {!heard && <p className="settings-intro">{ROLES_COPY.loading}</p>}
      {roleGroups(roles).map((group) => (
        <div key={group.id} className="settings-group">
          <h3 id={`roles-${group.id}`}>{group.title}</h3>
          <ul className="settings-card role-rows" aria-labelledby={`roles-${group.id}`}>
            {group.roles.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  className={role.id === selected?.id ? "role-row on" : "role-row"}
                  aria-current={role.id === selected?.id ? "true" : undefined}
                  onClick={() => setChosen(role.id)}
                >
                  <span className="role-row-name">{role.name}</span>
                  <span className="role-tag">{sourceTag(role.source)}</span>
                  <span className="role-meta">{roleMeta(role)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {selected && <RoleEditor key={selected.id} role={selected} onEdit={edit} />}
    </div>
  );
}
