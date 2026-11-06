import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ChoiceDef } from "../../settings.ts";
import { ChevronDownIcon } from "../icons.tsx";

export interface DropdownProps {
  /** Shown on the button before the chosen label ("Project: featra"), and the list's name. */
  name: string;
  value: string;
  options: readonly ChoiceDef<string>[];
  onChange: (value: string) => void;
}

/**
 * The app's own dropdown: a button that opens a list box. Enter, Space or the arrows open it; the arrows, Home and
 * End move; Enter or Space chooses; Escape closes. Focus comes back to the button.
 */
export function Dropdown({ name, value, options, onChange }: DropdownProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (i: number) => {
    const option = options[i];
    if (option) onChange(option.value);
    close();
  };
  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      " ": () => choose(active),
      Escape: close,
    };
    if (e.key === "Tab") return setOpen(false);
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    e.stopPropagation(); // Escape here closes the list, not anything behind it
    move();
  };

  return (
    <div className="dropdown" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="dropdown-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
      >
        {name}: {options[selected]?.label}
        <ChevronDownIcon />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="dropdown-list"
          role="listbox"
          aria-label={name}
          tabIndex={-1}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === selected}
              className={i === active ? "active" : undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
