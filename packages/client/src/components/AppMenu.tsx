import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MenuIcon } from "./icons.tsx";

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  /** Draws a separator above the item. */
  separated?: boolean;
}

/** The title bar's Menu button and its dropdown. Arrow keys move, Escape closes and returns focus to the button. */
export function AppMenu({ items }: { items: readonly MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const itemEls = () => Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);

  useEffect(() => {
    if (!open) return;
    itemEls()[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const els = itemEls();
    const at = els.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => els[(i + els.length) % els.length]?.focus();
    if (e.key === "ArrowDown") focusAt(at + 1);
    else if (e.key === "ArrowUp") focusAt(at - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(els.length - 1);
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") return close(false);
    else return;
    e.preventDefault();
  };

  return (
    <div className="menuwrap">
      <button
        ref={button}
        type="button"
        className={open ? "tb on" : "tb"}
        aria-label="Menu"
        data-tip="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "app-menu" : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MenuIcon />
      </button>
      {open && (
        <div ref={menu} id="app-menu" className="menu" role="menu" aria-label="Menu" onKeyDown={onMenuKey}>
          {items.map((item) => (
            <div key={item.id} role="none">
              {item.separated && <div className="msep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className="mi"
                tabIndex={-1}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.label}
                {item.shortcut && <span className="k">{item.shortcut}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
