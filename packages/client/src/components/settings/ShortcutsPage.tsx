import { useMemo, useState } from "react";
import { filterShortcuts, type ShortcutEntry } from "../../menu.ts";

/** Keyboard shortcuts: every shortcut, a table per menu, filtered by the search box. */
export function ShortcutsPage({ shortcuts }: { shortcuts: readonly ShortcutEntry[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterShortcuts(shortcuts, query), [shortcuts, query]);
  const areas = [...new Set(shown.map((s) => s.area))];
  return (
    <>
      <input
        type="search"
        className="text-field settings-search"
        aria-label="Search shortcuts"
        placeholder="Search shortcuts"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      {areas.map((area) => (
        <section key={area} className="settings-group">
          <h3 aria-hidden="true">{area}</h3>
          <div className="settings-card">
            <table className="shortcuts" aria-label={area}>
              <tbody>
                {shown
                  .filter((s) => s.area === area)
                  .map((s) => (
                    <tr key={s.name}>
                      <th scope="row">{s.name}</th>
                      <td>
                        <kbd>{s.keys}</kbd>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <output className="settings-intro">{shown.length === 0 ? `No shortcuts match “${query.trim()}”.` : ""}</output>
    </>
  );
}
