import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Dropdown } from "../../../src/components/controls/Dropdown.tsx";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

function Picker({ onEscapeBehind = () => {} }) {
  const [value, setValue] = useState("b");
  return (
    <div onKeyDown={(e) => e.key === "Escape" && onEscapeBehind()}>
      <Dropdown name="Letter" value={value} options={OPTIONS} onChange={setValue} />
      <button type="button">outside</button>
    </div>
  );
}

const button = () => screen.getByRole("button", { name: /^Letter: / });
const options = () => within(screen.getByRole("listbox", { name: "Letter" })).getAllByRole("option");
const active = () =>
  document.getElementById(screen.getByRole("listbox").getAttribute("aria-activedescendant")!)!.textContent;

describe("Dropdown", () => {
  it("shows its name and the chosen label; clicking opens a list box with the choice selected and focused", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    expect(button().textContent).toBe("Letter: Beta");
    expect(button().getAttribute("aria-haspopup")).toBe("listbox");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    await user.click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(button().getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(options().map((o) => [o.textContent, o.getAttribute("aria-selected")])).toEqual([
      ["Alpha", "false"],
      ["Beta", "true"],
      ["Gamma", "false"],
    ]);
    expect(document.activeElement).toBe(screen.getByRole("listbox"));
    expect(active()).toBe("Beta");
  });

  it("from the keyboard: arrows open and move, Home and End jump, Enter chooses and focus returns", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    button().focus();
    await user.keyboard("{ArrowDown}");
    expect(active()).toBe("Beta");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toBe("Gamma"); // stops at the end
    await user.keyboard("{Home}");
    expect(active()).toBe("Alpha");
    await user.keyboard("{ArrowUp}");
    expect(active()).toBe("Alpha"); // and at the start
    await user.keyboard("{End}{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(button().textContent).toBe("Letter: Gamma");
    expect(document.activeElement).toBe(button());

    await user.keyboard("{Enter}");
    await user.keyboard("{Home} ");
    expect(button().textContent).toBe("Letter: Alpha");
  });

  it("Escape closes only the list, without choosing, and focus returns to the button", async () => {
    const user = userEvent.setup();
    let behind = 0;
    render(<Picker onEscapeBehind={() => behind++} />);
    await user.click(button());
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(button().textContent).toBe("Letter: Beta");
    expect(document.activeElement).toBe(button());
    expect(behind).toBe(0);
  });

  it("clicking an option chooses it; clicking outside or tabbing away closes the list", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    await user.click(button());
    await user.click(screen.getByRole("option", { name: "Alpha" }));
    expect(button().textContent).toBe("Letter: Alpha");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.click(button());
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.click(button());
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(button().textContent).toBe("Letter: Alpha");
  });
});
