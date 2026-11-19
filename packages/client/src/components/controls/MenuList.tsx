import type { MouseEvent } from "react";
import type { MenuMark, MenuNode } from "../../menu.ts";
import { CheckIcon, ChevronRightIcon } from "../icons.tsx";

export interface MenuListProps {
  id?: string;
  label: string;
  className?: string;
  nodes: readonly MenuNode[];
  depth: number;
  path: readonly string[];
  onRun: (node: Extract<MenuNode, { onSelect: () => void }>) => void;
  onOpenSub: (depth: number, id: string, focusFirst: boolean) => void;
  onHoverLeaf: (depth: number) => void;
}

const ITEM_ROLES = { item: "menuitem", check: "menuitemcheckbox", radio: "menuitemradio" } as const;

/** An item's marks, drawn after its label; screen readers hear them in the item's name instead (`markedName`). */
function Marks({ marks }: { marks: readonly MenuMark[] }) {
  if (!marks.length) return null;
  return (
    <span className="mmarks" aria-hidden="true">
      {marks.map((m) => (
        <span key={m.id} className={m.quiet ? "mmark quiet" : "mmark"} title={m.tip} aria-hidden="true">
          {m.text}
        </span>
      ))}
    </span>
  );
}

/**
 * The name of an item with marks: its label, then their spoken words, in one piece. Text in the item would be joined by
 * the browser, which can put a space before the comma.
 */
const markedName = (label: string, marks: readonly MenuMark[] | undefined) =>
  marks?.length ? label + marks.map((m) => m.spoken).join("") : undefined;

/** One level of a MenuButton's menu, with the submenu open under it, if any. */
export function MenuList(p: MenuListProps) {
  return (
    <div
      id={p.id}
      className={p.depth === 0 ? `menu top ${p.className ?? ""}`.trim() : "menu sub"}
      role="menu"
      aria-label={p.label}
      data-depth={p.depth}
    >
      {p.nodes.map((node) => {
        if (node.kind === "separator") return <hr key={node.id} className="msep" />;
        const hover = (e: MouseEvent<HTMLButtonElement>) => {
          e.currentTarget.focus();
          if (node.kind === "submenu") p.onOpenSub(p.depth, node.id, false);
          else p.onHoverLeaf(p.depth);
        };
        if (node.kind === "submenu") {
          const expanded = p.path[p.depth] === node.id;
          return (
            <div key={node.id} role="none" className="mwrap">
              <button
                type="button"
                role="menuitem"
                className={expanded ? "mi open" : "mi"}
                tabIndex={-1}
                data-id={node.id}
                aria-haspopup="menu"
                aria-expanded={expanded}
                onMouseEnter={hover}
                // A keyboard click (Enter/Space, detail 0) moves into the submenu; a mouse click just opens it.
                onClick={(e) => p.onOpenSub(p.depth, node.id, e.detail === 0)}
              >
                {node.label}
                <span className="k chev">
                  <ChevronRightIcon />
                </span>
              </button>
              {expanded && (
                <MenuList
                  {...p}
                  id={undefined}
                  className={undefined}
                  label={node.label}
                  nodes={node.items}
                  depth={p.depth + 1}
                />
              )}
            </div>
          );
        }
        return (
          <div key={node.id} role="none">
            {/* A disabled item stays focusable, so arrowing through the menu still finds it (WAI-ARIA). */}
            <button
              type="button"
              role={ITEM_ROLES[node.kind]}
              aria-checked={node.kind === "item" ? undefined : node.checked}
              aria-label={node.kind === "radio" ? markedName(node.label, node.marks) : undefined}
              aria-disabled={node.kind === "item" && node.disabled ? true : undefined}
              className="mi"
              tabIndex={-1}
              data-id={node.id}
              onMouseEnter={hover}
              onClick={() => {
                if (!(node.kind === "item" && node.disabled)) p.onRun(node);
              }}
            >
              {node.kind !== "item" && <span className="mcheck">{node.checked && <CheckIcon />}</span>}
              {node.label}
              {node.kind === "radio" && node.marks && <Marks marks={node.marks} />}
              {node.shortcut && <span className="k">{node.shortcut}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
